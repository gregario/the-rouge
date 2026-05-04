# Discipline Transition Dogfood Fixes

**Date:** 2026-05-04
**Source:** Live dogfood testing of PR #218 (human-gated discipline transitions)
**Project tested:** highlow (M-tier, all 9 disciplines)

---

## Bug 1: Seeding summary "Approve & start build" never renders

**Severity:** HIGH — blocks the entire seeding-to-build transition
**Observed:** All 9 disciplines green-checked, `seeding_awaiting_final_approval: true` in state, `seeding_summary` message in chat log — but nothing visible in the UI.

**Root cause:** The `seeding_summary` message has no `metadata.discipline` tag. Chat panel groups messages by discipline. Untagged messages only render in the flat (no-groups) path, which is gated behind `groups.length === 0`. Since all 9 discipline groups exist, the untagged summary is invisible.

**Fix:** Render `seeding_summary` messages as a banner/footer OUTSIDE the discipline section list — after the last group, at the bottom of the chat area. It's a project-level message, not a discipline-level one.

**Files:** `dashboard/src/components/chat-panel.tsx`

---

## Bug 2: Autonomous disciplines invisible during work

**Severity:** HIGH — user thinks nothing is happening for minutes
**Observed:** Competition and infrastructure sections don't appear in the chat until they're already complete. During autonomous work (heartbeats, decisions, wrote markers), the user sees only a spinner with no progress indication.

**Root cause:** Discipline sections only render when `messagesByDiscipline.get(d)` has messages. During autonomous continuation turns, heartbeat/decision/wrote messages ARE being written to the chat log with the correct discipline tag. But the chat panel's `displayMessages` comes from `seeding.messages` which is populated by polling every 2s. The messages DO arrive — but the section isn't auto-expanded when a new discipline becomes current mid-poll.

The auto-expand effect (line 155) fires on `currentDiscipline` change. But `currentDiscipline` comes from the parent prop (seedingProgress.currentDiscipline), which is derived from state.json — a different file from seeding-chat.jsonl. The state may update before the messages arrive, or vice versa.

**Fix:** Two parts:
1. When `currentDiscipline` changes, ensure the new discipline's section is expanded even if it has zero messages yet — show an "In progress..." placeholder.
2. When a new discipline's messages arrive on the next poll, they populate the section that's already expanded and visible.

**Files:** `dashboard/src/components/chat-panel.tsx`

---

## Bug 3: Approval card appears BEFORE artifact summary

**Severity:** MEDIUM — user asked to accept before seeing what they're accepting
**Observed:** Infrastructure section shows "infrastructure ready for review" (amber approval card) ABOVE the "Rouge wrote infrastructure-manifest" message. User must scroll past the accept button to see what was produced.

**Root cause:** In `seed-handler.ts`, the `approve_prompt` message is appended BEFORE the `appendSegmentedRougeMessages` call that writes the `[WROTE:]` summary. The approval card is emitted in the `[DISCIPLINE_COMPLETE]` handler (line ~760), but the Claude response segments (including the `[WROTE:]` marker) are appended later (line ~900).

**Fix:** Move the `approve_prompt` append to AFTER `appendSegmentedRougeMessages`. The sequence should be: Claude's response messages (including WROTE summary) → then the approval card at the bottom.

**Files:** `dashboard/src/bridge/seed-handler.ts`

---

## Bug 4: Stale approval cards not cleared on revision

**Severity:** MEDIUM — confusing duplicate approval cards
**Observed:** Marketing showed two "marketing ready for review" approval cards — the first from the initial completion, the second from re-completion after revision. The first should have been removed or visually deactivated when the user sent revision feedback.

**Root cause:** The approval card is a chat message in seeding-chat.jsonl. When the user sends revision feedback, `clearAwaitingApproval` clears the state but doesn't remove or mark the old approval message as stale. On re-completion, a new approval message is appended, and both render.

**Fix:** Two options:
- **Option A:** When `clearAwaitingApproval` fires (user sent revision feedback), append a `system_note` that replaces/cancels the old approval card, OR mark the old approval message with a `stale: true` flag.
- **Option B (simpler):** In the chat panel renderer, only render the LAST `approve_prompt` message per discipline. Earlier ones are stale by definition.

**Files:** `dashboard/src/components/chat-panel.tsx` or `dashboard/src/bridge/seed-handler.ts`

---

## Bug 5: Gate chips not yet tested on fresh project

**Severity:** LOW — code is committed but unverified
**Status:** The smart fallback parser (synthetic "Accept" chip for accept-or-revise gates) shipped in the last commit but wasn't tested on a fresh project since highlow was mid-session. Needs verification.

**Files:** Already committed in `dashboard/src/components/chat-message.tsx`

---

## Implementation Order

| # | Bug | Effort | Blocks |
|---|-----|--------|--------|
| 1 | Seeding summary doesn't render | 20min | Seeding-to-build transition |
| 3 | Approval card before artifact summary | 15min | User understanding of what they're approving |
| 4 | Stale approval cards | 15min | Visual clarity |
| 2 | Autonomous disciplines invisible | 45min | User confidence during autonomous work |
| 5 | Gate chip verification | 10min | Nothing — just needs a test |

Total: ~1.5 hours
