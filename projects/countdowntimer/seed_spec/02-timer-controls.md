---
feature_area: Timer Controls
area_number: 2
scope: baseline
---

# Timer Controls

Minimal controls integrated into the design. Part of the timer composition, not floating UI.

## Specification

- Start/Pause as single toggle button (primary action)
- Reset button (resets current phase to full duration, does not change cycle position)
- Skip button (advance to next phase in sequence)
- Icon-based, no text labels
- Ghost button style with glass effect on hover, accent-colored icon fill
- Subtle press/hover feedback
- Keyboard accessible: Space for start/pause, R for reset, S for skip

## User Journey

1. **Hit start** — single action, zero configuration needed for defaults. *Effortless.*
2. **Need to pause** — one tap, timer freezes, state is obvious. *In control.*
3. **Want to skip a break** — secondary action, no confirmation modal. Trust the user. *Respected.*

## Edge Cases

- Accidental reset: resets to current phase start, not full session reset
- Double-tap: debounced
- Keyboard shortcuts don't fire when settings modal is open

## Acceptance Criteria

- [ ] Start toggles to Pause when running, and back
- [ ] Reset returns current phase to full duration without changing cycle position
- [ ] Skip advances to next phase in sequence
- [ ] All controls have visible hover and active states
- [ ] Controls are keyboard-accessible (Space for start/pause, R for reset, S for skip)
- [ ] Keyboard shortcuts are disabled when settings modal is open

## Build Estimate

Human team: ~1 day / Rouge: ~1 cycle
