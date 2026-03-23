---
feature_area: Session Counter
area_number: 4
scope: expanded_light
---

# Session Counter

Simple daily progress indicator. Unobtrusive but present.

## Specification

- Display today's completed focus sessions on main page
- Resets at midnight local time (checked on phase completion and page load)
- Persisted in localStorage (key: epoch_daily_count, epoch_daily_date)
- Unobtrusive placement below controls
- Only increments when a focus session completes naturally (not on skip)

## User Journey

1. **Glance at counter** — "I've done 6 sessions today." *Accomplished.*
2. **Fresh morning** — counter is at zero, clean slate. *Motivated.*

## Edge Cases

- Midnight rollover: checks date on each phase completion and on page load
- localStorage cleared: graceful reset to 0, no error
- localStorage unavailable: counter works for current session but doesn't persist
- Display range: 0 to 99

## Acceptance Criteria

- [ ] Counter increments when a focus session completes (not on skip)
- [ ] Counter resets when the date changes
- [ ] Counter survives page refresh
- [ ] Counter displays correctly from 0 to 99
- [ ] Graceful fallback when localStorage is unavailable

## Build Estimate

Human team: ~1 day / Rouge: ~1 cycle
