# Changelog

## [0.3.0] - 2026-03-23

### Added
- SVG clock-face favicon in Epoch accent blue for browser tab presence
- Machine-readable `datetime` attribute on timer element (ISO 8601 duration format)

### Changed
- Settings modal section spacing improved for better visual breathing room

### Fixed
- Notifications now respect the "notifications enabled" setting (previously fired unconditionally)
- Settings footer text contrast fixed definitively — uses #9ca3af base color (~6.2:1 ratio) instead of opacity adjustments
- Removed unused 'completed' status from timer state type

## [0.2.0] - 2026-03-23

### Added
- Inline keyboard shortcut hints below timer controls (R, Space, S) — visible on desktop, hidden on mobile
- React Error Boundary with styled dark fallback UI matching the app aesthetic
- Semantic HTML5 landmarks (`<header>`, `<main>`, `<footer>`) and screen-reader heading for accessibility
- ARIA attributes on settings button (`aria-expanded`, `aria-haspopup`) and cycle indicator (`role="img"`)

### Changed
- Settings modal converted from `<div>` overlay to native `<dialog>` with automatic focus trapping and Escape handling
- Session counter text color improved to #9ca3af (~6.2:1 contrast ratio) for WCAG AA compliance
- Settings modal footer text opacity increased from 0.6 to 0.85 for improved readability
- Focus returns to settings trigger button when modal closes
- All inputs, toggles, and slider now show `:focus-visible` keyboard focus rings

### Fixed
- localStorage settings now validated with type checking and range clamping on load
- AudioContext resumed before chime playback for mobile browser compatibility

## [0.1.0] - 2026-03-22

### Added
- Pomodoro focus timer with configurable work, short break, and long break durations
- Techno-futuristic dark UI with frosted glass card, phase-aware color system (blue/purple/green)
- Full Pomodoro cycle engine with automatic phase transitions
- Session counter with daily persistence via localStorage
- Synthesized crystalline chime via Web Audio API for phase transitions
- Browser notification support for phase completions
- Keyboard shortcuts: Space (play/pause), R (reset), S (skip)
- Settings modal with duration controls, auto-start toggles, sound and notification preferences
- Responsive design from mobile (375px) to desktop
- Deployed to Cloudflare Workers via OpenNext adapter
