# Change Spec: Main Screen Accessibility

**Change ID:** epoch-loop-2-main-a11y
**Cycle:** 2
**Priority:** MEDIUM
**Requires Design Mode:** false

---

## Gap Evidence

### Quality Gap 1: Session Counter Text Contrast Fails WCAG AA

- **Gap ID:** fix-003
- **Category:** design_change
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The product standard requires `color_contrast_aa: true`. The session counter label uses `rgb(107,114,128)` (the design system's `text_secondary` color #6b7280) on a near-black background (#0a0a0f). This produces a contrast ratio of approximately 3.2:1 — well below the WCAG AA minimum of 4.5:1 for normal text. The QA Gate's a11y review flagged this as MEDIUM severity. Heuristic HA-R2 failed.

#### Current State (What's Wrong)
- **Description:** The "0 sessions today" text below the timer card uses `rgb(107,114,128)` on the dark background `#0a0a0f`. At 13px font size, this text requires 4.5:1 contrast ratio per WCAG AA. The measured ratio is approximately 3.2:1 — failing by ~1.3 points. Users with low vision or in bright ambient lighting conditions may struggle to read this text.
- **PO Review Assessment:** Heuristic HA-R2 failed: "Color contrast meets WCAG AA (4.5:1)" — measured "Session counter ~3.2:1 (rgb(107,114,128) on #0a0a0f), modal footer opacity 0.6."
- **Heuristics Failed:** HA-R2
- **Affected Screens:** / (main timer)
- **Affected Journeys:** First-time user landing — session counter is visible on initial load

#### Previous Attempts (Do Not Repeat)
First attempt.

### Quality Gap 2: Missing Semantic HTML Landmarks

- **Gap ID:** fix-007
- **Category:** interaction_improvement
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The product standard requires `aria_labels: true` and `keyboard_navigation: true`. The page has a `<main>` element but no `<header>`, `<footer>`, or `<h1>`. The accessibility tree shows a flat structure — screen reader users cannot navigate by landmark or heading. Heuristic H4-R4 failed: "Semantic HTML landmarks present (h1, header, main, footer)." The Lighthouse accessibility score is 89, pulled below the 90 threshold partly by this issue.

#### Current State (What's Wrong)
- **Description:** The page structure is: `<main>` containing all content (settings button, timer card, session counter). There is no `<header>` landmark (settings button floats without semantic context), no `<footer>` landmark (session counter sits directly in main), and critically no `<h1>` heading anywhere on the page. Screen reader users pressing "H" to navigate by heading find nothing. Users pressing landmark navigation keys find only `<main>` — no granular navigation is possible.
- **PO Review Assessment:** Heuristic H4-R4 failed: "No h1 element, no header or footer landmarks." A11y review finding: "No landmark structure beyond <main> — missing <header>, <nav>, <footer>. Accessibility tree shows flat structure."
- **Heuristics Failed:** H4-R4
- **Affected Screens:** / (main timer)
- **Affected Journeys:** First-time user landing — screen reader users cannot orient themselves on the page

#### Previous Attempts (Do Not Repeat)
First attempt.

---

## Target State

### From Library Heuristics
- **HA-R2 (Color Contrast WCAG AA):** All text must achieve minimum 4.5:1 contrast ratio against its background for normal text (< 18px or < 14px bold). Large text (≥ 18px or ≥ 14px bold) requires 3:1 minimum.
  - **Measurement:** Compute contrast ratio of session counter text color against background color using WCAG relative luminance formula.
  - **Threshold:** ≥ 4.5:1 for the session counter text at its current size (~13px).

- **H4-R4 (Semantic Landmarks):** All landmark roles must be present: `<header>`, `<main>`, `<footer>`, and at least one `<h1>`.
  - **Measurement:** DOM query for `header`, `main`, `footer`, and `h1` elements.
  - **Threshold:** All four elements present in the document.

### From Reference Products
No reference products defined. These are WCAG AA baseline requirements.

### Concrete Description
After this change:

1. **Session Counter Contrast Fix:** The session counter label text color changes from `rgb(107,114,128)` (#6b7280) to `rgb(156,163,175)` (#9ca3af) or a similarly lightened value that achieves ≥ 4.5:1 contrast against the darkest background color in any phase state. The color must still read as "secondary" — clearly subordinate to the primary timer display — while being comfortably legible. The `text_secondary` CSS custom property or the component's module CSS should be updated.

2. **Semantic Landmarks:** The page layout in `page.tsx` wraps existing elements in semantic landmarks:
   - `<header>` containing the settings button (top of page)
   - `<main>` containing the timer card (already exists — content restructured within it)
   - `<footer>` containing the session counter
   - A visually-hidden `<h1>Epoch</h1>` placed at the top of `<main>` or inside `<header>`. The `<h1>` is hidden from visual display using a standard screen-reader-only CSS class (`position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;`) but announced by screen readers. This gives the page a heading that screen reader users can navigate to.

   The visual appearance must not change at all. The landmarks are structural — they add semantic meaning without affecting layout, spacing, or styling.

---

## Design Requirements

- **Requires Design Mode:** false
- **Design Mode Scope:** N/A
- **Design Direction:** The contrast change must preserve the visual hierarchy — session counter text should remain clearly secondary to the timer display. The lightened color should feel intentional within the design system, not like a random accessibility override. #9ca3af (Tailwind gray-400) is a good candidate — it's one step lighter in the gray scale while remaining muted.
- **Design Constraints:** No visual layout changes. The landmarks are invisible structural additions. The color change affects only the session counter label — no other text colors change. The timer display, phase label, and control button colors remain unchanged.

---

## Acceptance Criteria

AC-main-a11y-1: Session counter text meets WCAG AA contrast
  GIVEN the main timer page is loaded in any phase state (FOCUS, SHORT BREAK, LONG BREAK)
  WHEN the session counter label "X sessions today" is displayed
  THEN the text color has a contrast ratio ≥ 4.5:1 against the page background color
  MEASUREMENT: Use JavaScript to compute contrast ratio: get computed style of session counter text color and body/page background color, apply WCAG relative luminance formula. Ratio must be ≥ 4.5.
  HEURISTIC: HA-R2
  CLOSES_GAP: fix-003

AC-main-a11y-2: Session counter remains visually secondary
  GIVEN the main timer page is loaded
  WHEN comparing the visual weight of the session counter to the timer display
  THEN the session counter text is clearly subordinate — smaller font size, lighter weight, muted color relative to the timer digits
  MEASUREMENT: Screenshot comparison — session counter should not visually compete with timer. Font-size of counter < font-size of timer. Color is muted gray, not accent-colored.
  CLOSES_GAP: fix-003

AC-main-a11y-3: Page contains h1 element
  GIVEN the main timer page is loaded
  WHEN querying the DOM for heading elements
  THEN exactly one <h1> element exists with text content "Epoch"
  MEASUREMENT: document.querySelector('h1') returns an element. Element.textContent === "Epoch" or contains "Epoch".
  HEURISTIC: H4-R4
  CLOSES_GAP: fix-007

AC-main-a11y-4: h1 is visually hidden but screen-reader accessible
  GIVEN the main timer page is loaded
  WHEN inspecting the <h1> element's computed styles
  THEN the element is visually hidden (clipped, zero-dimension, or off-screen) but not display:none or visibility:hidden (which would hide from screen readers too)
  MEASUREMENT: Verify h1 exists in DOM. Verify computed style: position is absolute AND (width ≤ 1px OR height ≤ 1px OR clip is set). Verify display !== 'none' and visibility !== 'hidden'.
  HEURISTIC: H4-R4
  CLOSES_GAP: fix-007

AC-main-a11y-5: Header landmark contains settings button
  GIVEN the main timer page is loaded
  WHEN querying the DOM for <header> element
  THEN a <header> element exists and contains the settings button (gear icon)
  MEASUREMENT: document.querySelector('header') exists. Within it, a button with aria-label containing "settings" (case-insensitive) is present.
  HEURISTIC: H4-R4
  CLOSES_GAP: fix-007

AC-main-a11y-6: Footer landmark contains session counter
  GIVEN the main timer page is loaded
  WHEN querying the DOM for <footer> element
  THEN a <footer> element exists and contains the session counter text
  MEASUREMENT: document.querySelector('footer') exists. Within it, text matching /\d+ sessions? today/ is present.
  HEURISTIC: H4-R4
  CLOSES_GAP: fix-007

AC-main-a11y-7: Visual layout unchanged after landmark additions
  GIVEN the main timer page is loaded with the new semantic landmarks
  WHEN comparing the visual appearance to the pre-change state
  THEN no visual differences are perceptible — same layout, spacing, colors, and element positions
  MEASUREMENT: Screenshot comparison at 1280x720 viewport — pixel difference should be negligible (< 1% changed pixels, excluding dynamic elements like timer digits).
  CLOSES_GAP: fix-007

---

## Scope

### In Scope
- `src/components/SessionCounter.module.css` — text color update
- `src/app/page.tsx` — semantic landmark wrapping (<header>, <footer>, <h1>)
- `src/app/page.module.css` — visually-hidden class for <h1> (if not already available)
- Unit tests for contrast verification and landmark presence

### Out of Scope (Do Not Touch)
- Timer display component (TimerDisplay.tsx) — no changes
- Timer controls (TimerControls.tsx) — no changes
- Settings modal — no changes (footer contrast handled in separate spec)
- Cycle indicator — no changes
- Any component behavior or state management
- CSS color of any element other than session counter label

### Regression Risk
- Adding `<header>` and `<footer>` elements could affect CSS selectors or flex layout in `page.module.css` — verify that the page layout container's flex children still render correctly
- Changing the session counter text color could look wrong against the different phase backgrounds (FOCUS blue-black, SHORT BREAK purple-black, LONG BREAK green-black) — test contrast against all three background colors
- The visually-hidden `<h1>` must not create unexpected whitespace or layout shifts

---

## Root Cause Context

- **Classification:** implementation_bug
- **What Went Wrong:** The builder used the design system's `text_secondary` color (#6b7280) for the session counter, which is a reasonable default but doesn't meet WCAG AA on near-black backgrounds. The product standard declares `color_contrast_aa: true` but doesn't provide pre-computed contrast-safe color values for each background. Similarly, the seed spec doesn't mention semantic landmarks — the builder implemented `<main>` (likely from Next.js conventions) but didn't add `<header>`, `<footer>`, or `<h1>` because the spec didn't call for them.
- **Why Previous Approach Failed:** N/A — first attempt.
- **What's Different This Time:** The change spec provides exact color targets (#9ca3af or lighter) with measured contrast ratios, and explicit landmark structure requirements. The builder has precise targets instead of general guidelines.
