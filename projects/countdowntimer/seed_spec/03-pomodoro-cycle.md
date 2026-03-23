---
feature_area: Pomodoro Cycle Engine
area_number: 3
scope: baseline
---

# Pomodoro Cycle Engine

The core state machine that drives the focus/break cycle.

## Specification

- Cycle sequence: Focus -> Short Break -> Focus -> Short Break -> Focus -> Short Break -> Focus -> Long Break -> repeat
- Default durations: Focus 25min, Short Break 5min, Long Break 15min
- Long break triggers after every 4 focus sessions (configurable)
- Auto-start breaks by default (configurable)
- Auto-start focus sessions off by default (configurable)
- Cycle position indicator on main page (e.g., 4 dots — filled for completed, hollow for remaining)
- Settings changes apply on next phase, not current running phase

## User Journey

1. **Complete a focus session** — break starts automatically, you lean back. *Earned.*
2. **Complete 4th focus session** — long break, the vibe shifts noticeably. *Rewarding.*
3. **See "3/4" indicator** — know where you are in the cycle without counting. *Aware.*

## Edge Cases

- User resets mid-cycle: resets current phase only, not cycle position
- User changes settings mid-session: apply on next phase
- User skips a focus session: does not count as completed for cycle tracking
- After long break: cycle resets to position 1

## Acceptance Criteria

- [ ] Cycle follows correct Pomodoro sequence (F-SB-F-SB-F-SB-F-LB)
- [ ] Long break triggers after configured number of focus sessions
- [ ] Auto-start respects per-phase-type settings
- [ ] Cycle position indicator shows correct position (1 through N)
- [ ] Mid-session settings changes don't disrupt current phase
- [ ] Skipped focus sessions don't count toward cycle completion

## Build Estimate

Human team: ~2 days / Rouge: ~1 cycle
