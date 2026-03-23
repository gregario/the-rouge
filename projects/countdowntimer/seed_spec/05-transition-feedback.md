---
feature_area: Transition Feedback
area_number: 5
scope: expanded
---

# Transition Feedback

Multi-sensory phase transition — audio, visual, and notification.

## Specification

- Audio chime on phase completion (~0.5-1s duration)
  - Crystalline/tonal quality — clean, not alarming
  - Matches the futuristic aesthetic
  - Respects sound on/off setting and volume slider
- Visual transition animation between states
  - Color palette shifts (background, accent, glow)
  - All transitions smooth via CSS (1.2s ease-in-out)
- Browser notification when tab is not focused
  - Only if permission has been granted
  - Shows phase name and next phase info
- Timer must continue running accurately when tab is backgrounded
  - Use date-based timing, not setInterval drift

## User Journey

1. **Deep in focus, timer ends** — chime cuts through gently, you look up and the screen has shifted to break mode. *Smooth.*
2. **Tab is hidden** — system notification appears: "Focus complete. Short break starting." *Reliable.*
3. **Sound muted** — visual shift still communicates the transition clearly. *Resilient.*

## Edge Cases

- Sound muted at OS level: visual shift still works
- Notification permission denied: sound still works
- Both sound and notifications off: visual shift is always on (can't be disabled)
- Tab backgrounded for extended time: timer doesn't drift >1s after 25 minutes
- Multiple tabs: only one should be active (localStorage coordination or single-tab enforcement)

## Acceptance Criteria

- [ ] Chime plays when a phase ends
- [ ] Chime respects sound on/off setting and volume
- [ ] Browser notification fires when tab is hidden and permission is granted
- [ ] Timer does not drift >1s after 25 minutes backgrounded
- [ ] Notification request only triggers on user action, not page load
- [ ] Visual transition always occurs regardless of sound/notification settings

## Build Estimate

Human team: ~2 days / Rouge: ~1 cycle
