---
id: web-accessibility
name: Web accessibility basics (WCAG 2.1 AA)
applies_to: [web]
severity: blocking
tier: cross-cutting
origin: Rouge
---

# Web accessibility basics

Every web product Rouge ships must clear WCAG 2.1 AA on basic checks. Advanced conformance is a stretch goal; these are the floor.

## Rules

### Semantic structure
- Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>` present exactly once where applicable
- Heading hierarchy: one `<h1>` per page, no skipped levels (h1 → h3 is wrong)
- Form inputs have associated `<label>`s (`for` attribute or wrapping)
- Buttons that look like links use `<a>`, links that look like buttons use `<button>` — role matches visual

### Keyboard
- Every interactive element reachable via Tab, activatable via Enter/Space
- Visible focus indicator on all interactive elements
- No keyboard traps (can always Tab out)
- Escape closes modals / dismisses overlays

### ARIA
- Don't add ARIA when semantic HTML suffices (`<button>` beats `<div role="button">`)
- `aria-label` on icon-only buttons
- `aria-live` regions for dynamic content announcements
- `aria-expanded` + `aria-controls` for toggles

### Contrast + text
- Body text: 4.5:1 contrast ratio minimum
- Large text (18pt+ regular or 14pt+ bold): 3:1 minimum
- Don't rely on color alone to convey meaning (add icons, text, or patterns)
- Text resizable to 200% without layout breakage

### Images + media
- All `<img>` have `alt` (empty `alt=""` for decorative)
- Complex images (charts, diagrams) have longer text description nearby
- Videos have captions; audio has transcripts

## Enforcement

- Lighthouse accessibility score ≥ 90 (already a Rouge quality bar)
- `axe-core` run during product-walk phase; zero serious/critical findings
- Reviewer agent flags missing alt, missing labels, missing landmarks

## Why

Not an afterthought, not "for compliance." Real users with screen readers, keyboard-only navigation, low-contrast vision, and motor differences will use what Rouge ships.
