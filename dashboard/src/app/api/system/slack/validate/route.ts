import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// POST /api/system/slack/validate
// Body: { botToken?: string, appToken?: string }
// Bot token (xoxb-) is validated against Slack's auth.test — returns workspace name.
// App token (xapp-) has no cheap validation endpoint; we only sanity-check the prefix.
export async function POST(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const { botToken, appToken } = (await request.json()) as {
      botToken?: string;
      appToken?: string;
    };

    const result: {
      bot?: { ok: boolean; team?: string; user?: string; error?: string };
      app?: { ok: boolean; error?: string };
    } = {};

    if (botToken !== undefined) {
      if (!botToken.startsWith("xoxb-")) {
        result.bot = { ok: false, error: "Bot tokens start with xoxb-. Check OAuth & Permissions → Bot User OAuth Token." };
      } else {
        try {
          const res = await fetch("https://slack.com/api/auth.test", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${botToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
          });
          const body = (await res.json()) as { ok: boolean; team?: string; user?: string; error?: string };
          if (body.ok) {
            result.bot = { ok: true, team: body.team, user: body.user };
          } else {
            result.bot = { ok: false, error: body.error ?? "auth.test returned ok=false" };
          }
        } catch (err) {
          console.error('[system/slack/validate] bot token fetch failed:', err);
          result.bot = { ok: false, error: 'Slack API request failed. Check network connectivity and dashboard logs.' };
        }
      }
    }

    if (appToken !== undefined) {
      if (!appToken.startsWith("xapp-")) {
        result.app = { ok: false, error: "App tokens start with xapp-. Generate one under Basic Information → App-Level Tokens." };
      } else {
        // App tokens don't have a cheap validation endpoint — they're used
        // via Socket Mode. Accept prefix-valid tokens as "probably ok."
        result.app = { ok: true };
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return sanitizedErrorResponse(err, "system/slack/validate");
  }
}
