# Seeding Flow — Manual Smoke Test

## Prerequisites
- `claude` CLI available in PATH (`which claude`)
- Dashboard running: `rouge dashboard` (foreground) or `rouge dashboard start` (background)
- Terminal access to `$ROUGE_PROJECTS_DIR` (default `~/.rouge/projects/` on global installs,
  or `<repo>/projects/` on source checkouts)

## Test 1: Create new project + first Rouge response

1. Open dashboard at `http://localhost:3000`
2. Click **"+ New Project"**
3. Enter name: `smoke test product`, slug auto-fills to `smoke-test-product`
4. Click **"Create project"**
5. **Expected:** Navigates to `/projects/smoke-test-product`
6. **Expected:** Within 30-60s, first Rouge question appears in chat panel
7. **Verify on disk:**

```bash
ls "$ROUGE_PROJECTS_DIR/smoke-test-product/"
# Should show: state.json, seeding-state.json, seeding-chat.jsonl

cat <project-dir>/seeding-chat.jsonl
# Should show one rouge message

cat <project-dir>/seeding-state.json
# Should show session_id populated, status: "active"
```

## Test 2: Send a message

1. Type a response in chat, press Enter
2. **Expected:** Input greys out, placeholder says "Rouge is thinking…"
3. **Expected:** After ~30-120s, Rouge's response appears
4. **Verify:** `seeding-chat.jsonl` now has 3 entries (rouge greeting, human reply, rouge follow-up)

## Test 3: Multiple turns + discipline completion

1. Continue the conversation until Rouge completes a discipline (emits `[DISCIPLINE_COMPLETE: brainstorming]`)
2. **Expected:** Discipline stepper UI updates showing discipline as complete
3. **Verify:** `seeding-state.json` has `disciplines_complete: ["brainstorming"]`

## Test 4: SSE reconnect

1. With seeding session active, refresh the browser page
2. **Expected:** Chat history loads from `seeding-chat.jsonl` — all messages restored
3. **Expected:** Sending a new message continues using the same session_id (Claude remembers context)

## Test 5: Cleanup after testing

```bash
rm -rf "$ROUGE_PROJECTS_DIR/smoke-test-product"
```

## Known limitations (v1)

- Two tabs open to same project = undefined behavior (not designed for)
- Session expires if unused for days → restart seeding from scratch
- Rate limits surface as a red banner, user retries manually
- No mid-seeding abort button — user can just stop
