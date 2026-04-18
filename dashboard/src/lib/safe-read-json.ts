import { existsSync, readFileSync } from "node:fs";

/**
 * Shared JSON reader with consistent error handling.
 *
 * Previously every reader (state.json, cycle_context.json, task_ledger,
 * seeding-state, checkpoints, activity, interventions, etc.) had its
 * own private `try { JSON.parse(readFileSync(...)) } catch { return [] }`
 * with no logging. When a file really did get corrupted, the caller saw
 * exactly the same shape as "file absent" — `[]` / `null` / `{}` — and
 * the dashboard silently treated the project like a fresh start. Debug
 * took hours because there was no evidence in any log of a parse
 * failure.
 *
 * `safeReadJson` makes two guarantees:
 *   1. Missing files return `fallback` silently (legitimate case).
 *   2. Present-but-malformed files return `fallback` AND emit a
 *      structured warn log including the file path, so corruption is
 *      discoverable.
 *
 * If you want stricter behaviour (throw on corruption), set
 * `opts.throwOnParseError: true`. Otherwise you get the fallback +
 * warn-log contract — safe to use from hot paths.
 */
export function safeReadJson<T>(
  filePath: string,
  fallback: T,
  opts: {
    context?: string;
    throwOnParseError?: boolean;
  } = {},
): T {
  if (!existsSync(filePath)) return fallback;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.warn(
      `[safe-read-json]${opts.context ? ` (${opts.context})` : ""} read failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.throwOnParseError) {
      throw new Error(`safeReadJson: malformed JSON at ${filePath} — ${msg}`);
    }
    console.warn(
      `[safe-read-json]${opts.context ? ` (${opts.context})` : ""} JSON.parse failed for ${filePath}: ${msg}`,
    );
    return fallback;
  }
}

/**
 * Variant that preserves the distinction between "file missing" and
 * "file unreadable/malformed" — useful when you want to surface a
 * corruption signal up to the UI (e.g. specs table health chip).
 */
export function safeReadJsonWithStatus<T>(
  filePath: string,
  opts: { context?: string } = {},
): { status: "missing" | "ok" | "corrupt"; data: T | null } {
  if (!existsSync(filePath)) return { status: "missing", data: null };
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.warn(
      `[safe-read-json]${opts.context ? ` (${opts.context})` : ""} read failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { status: "corrupt", data: null };
  }
  if (!raw.trim()) return { status: "corrupt", data: null };
  try {
    return { status: "ok", data: JSON.parse(raw) as T };
  } catch (err) {
    console.warn(
      `[safe-read-json]${opts.context ? ` (${opts.context})` : ""} JSON.parse failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { status: "corrupt", data: null };
  }
}
