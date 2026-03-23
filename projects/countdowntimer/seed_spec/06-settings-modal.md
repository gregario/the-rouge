---
feature_area: Settings Modal
area_number: 6
scope: baseline
---

# Settings Modal

The only secondary UI surface. Clean, focused, same glass aesthetic as the main timer.

## Specification

- Trigger: gear icon, always visible (top-right)
- Centered overlay with dark scrim (rgba(0,0,0,0.6))
- Same frosted glass aesthetic as timer card
- Slides in with subtle scale+fade animation

### Settings Fields

**Timing:**
- Focus duration — number input, default 25, min 1, max 99 (minutes)
- Short break duration — number input, default 5, min 1, max 99 (minutes)
- Long break duration — number input, default 15, min 1, max 99 (minutes)
- Long break interval — number input, default 4, min 1, max 10 (sessions)

**Behavior:**
- Auto-start breaks — toggle, default ON
- Auto-start focus sessions — toggle, default OFF

**Sound:**
- Sound on/off — toggle, default ON
- Volume — slider, default 70%

**Notifications:**
- Browser notifications — toggle, default OFF
  - When toggled ON: triggers browser permission prompt if not already granted
  - If permission denied: toggle reverts to OFF with brief explanation

### Persistence
- All values saved to localStorage immediately on change
- Keys prefixed with `epoch_` to avoid collisions

### Closing
- Overlay click closes modal
- Escape key closes modal
- Close button (X) in modal header
- Settings take effect on next phase (not current running phase)

## User Journey

1. **Open settings** — see current values clearly, change what you want. *Clear.*
2. **Adjust a duration** — value updates, saved immediately. *Responsive.*
3. **Close modal** — settings take effect on next phase. *Predictable.*

## Edge Cases

- Invalid input: enforce min/max constraints, prevent non-numeric input
- localStorage unavailable: settings work for current session, don't persist
- Permission prompt: if user dismisses (not denies), toggle stays OFF
- Very small viewport: modal scrolls internally if needed

## Acceptance Criteria

- [ ] All 8 settings are present and functional
- [ ] Settings persist across page refresh
- [ ] Modal opens/closes with smooth animation
- [ ] Escape key closes modal
- [ ] Overlay click closes modal
- [ ] Invalid input is prevented (enforced min/max)
- [ ] Notification toggle triggers browser permission prompt if not already granted
- [ ] Settings changes apply on next phase, not current

## Build Estimate

Human team: ~2 days / Rouge: ~1 cycle
