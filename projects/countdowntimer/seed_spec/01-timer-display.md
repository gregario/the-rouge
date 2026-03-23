---
feature_area: Timer Display
area_number: 1
scope: expanded
---

# Timer Display

Full-viewport single-page layout, dark-first. The timer display is the hero element — everything else orbits it.

## Specification

- Monospace countdown display (MM:SS), large enough to read from 2m away (80-120px)
- Three visual states with distinct color palettes:
  - **Focus**: Deep navy-black background (#0a0a0f), electric blue accent (#4a9eff)
  - **Short Break**: Warm dark purple background (#0f0a14), soft violet accent (#c084fc)
  - **Long Break**: Dark teal-black background (#0a100f), emerald accent (#34d399)
- Frosted glass card container with subtle glow matching current state
- Phase label above timer ("FOCUS" / "SHORT BREAK" / "LONG BREAK")
- Smooth CSS transitions between states (~1.2s ease-in-out)
- Responsive — works from 320px to ultrawide, no scrollbar at any viewport
- Radial gradient glow behind the glass card, pulses subtly while timer is running

## User Journey

1. **Open the page** — see the timer at 25:00, ready state. Clean, inviting. *Calm.*
2. **Glance during focus** — time remaining is instantly readable at any distance. *Anchored.*
3. **Phase transition** — color shifts smoothly, atmosphere changes, new phase begins. *Satisfying.*

## Edge Cases

- Very small viewports: timer and controls scale down, remain usable
- Tab backgrounded: timer keeps running via JS timing
- User returns after long absence: timer completed, notification was sent, shows completed state

## Acceptance Criteria

- [ ] Timer displays MM:SS in monospace font >= 72px
- [ ] Three distinct color palettes render for each phase
- [ ] Transitions between states animate smoothly (no flash/jump)
- [ ] Layout is usable at 320px, 768px, 1440px, and 2560px viewports
- [ ] Page has no scrollbar at any viewport size
- [ ] Glow effect visible behind glass card, matches current phase color

## Build Estimate

Human team: ~3 days / Rouge: ~1 cycle
