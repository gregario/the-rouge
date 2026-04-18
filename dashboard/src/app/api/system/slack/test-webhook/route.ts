import { NextResponse } from "next/server";
import { assertLoopback } from "@/lib/localhost-guard";
import { sanitizedErrorResponse } from "@/lib/error-response";

export const dynamic = "force-dynamic";

// POST /api/system/slack/test-webhook
// Body: { webhookUrl: string }
// Sends a real "Rouge setup test" message to the webhook. Returns
// { ok: true } if Slack returned "ok" (200), else the error text.
export async function POST(request: Request) {
  const forbidden = await assertLoopback();
  if (forbidden) return forbidden;

  try {
    const { webhookUrl } = (await request.json()) as { webhookUrl?: string };
    if (!webhookUrl) {
      return NextResponse.json({ ok: false, error: "webhookUrl is required" }, { status: 400 });
    }
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      return NextResponse.json({
        ok: false,
        error: "Webhook URLs start with https://hooks.slack.com/. Check Incoming Webhooks in your Slack app settings.",
      }, { status: 400 });
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "✅ Rouge setup test — if you can read this, your webhook works.",
      }),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true });
    }
    const errorText = await res.text();
    return NextResponse.json({ ok: false, error: errorText || `HTTP ${res.status}` }, { status: 400 });
  } catch (err) {
    return sanitizedErrorResponse(err, "system/slack/test-webhook");
  }
}
