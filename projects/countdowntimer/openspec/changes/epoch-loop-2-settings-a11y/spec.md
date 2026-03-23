# Change Spec: Settings Modal Accessibility

**Change ID:** epoch-loop-2-settings-a11y
**Cycle:** 2
**Priority:** HIGH
**Requires Design Mode:** false

---

## Gap Evidence

### Quality Gap 1: No Focus Trap in Settings Modal

- **Gap ID:** fix-002
- **Category:** interaction_improvement
- **Severity:** HIGH
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The settings modal is implemented as a custom `<div>` overlay, not a native `<dialog>` element. No focus trapping logic exists. The QA Gate's browser test confirmed: pressing Tab 11–15 times from within the modal lands focus on background page elements ("Skip to next phase" button was reachable). This violates WCAG 2.4.3 (Focus Order) and is a HIGH severity accessibility failure. Heuristic HA-R1 failed: "Modal focus trap prevents Tab escape."

#### Current State (What's Wrong)
- **Description:** When the settings modal is open, keyboard Tab/Shift+Tab navigation escapes the modal into the background page. Screen reader users lose modal context — they can interact with background elements while the modal visually obscures them, creating a confusing disconnect between what's announced and what's visible. The modal also doesn't return focus to the trigger button on close, losing the user's place in the page.
- **PO Review Assessment:** Heuristic HA-R1 failed: "Tab escapes modal after 15 presses." A11y review: "No focus trap in settings modal — Tab escapes into background elements. Verified: 11 Tab presses from modal reached page body."
- **Heuristics Failed:** HA-R1
- **Affected Screens:** Settings modal
- **Affected Journeys:** Configure Pomodoro settings

#### Previous Attempts (Do Not Repeat)
First attempt.

### Quality Gap 2: Modal Footer Text Contrast Fails WCAG AA

- **Gap ID:** fix-004
- **Category:** design_change
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The modal footer contains legal disclosure text ("The Pomodoro Technique is a registered trademark..." and "Epoch runs entirely in your browser...") rendered at `rgb(107,114,128)` with `opacity: 0.6` at `11px` font size. The effective contrast against the modal's dark background is severely below WCAG AA 4.5:1 threshold. The QA Gate flagged this as MEDIUM severity (-2 health score). Heuristic HA-R2 failed.

#### Current State (What's Wrong)
- **Description:** The legal disclosure text at the bottom of the settings modal is practically invisible. The base color `rgb(107,114,128)` already has marginal contrast on dark backgrounds (~3.2:1), and the added `opacity: 0.6` reduces the effective contrast to approximately 1.9:1 — less than half the required 4.5:1. At 11px font size (small text, requiring the higher 4.5:1 threshold), this text is unreadable for many users, particularly those with any degree of visual impairment.
- **PO Review Assessment:** A11y review: "Modal footer text (legal disclosures) at rgb(107,114,128) opacity 0.6, 11px — severely fails WCAG AA."
- **Heuristics Failed:** HA-R2
- **Affected Screens:** Settings modal
- **Affected Journeys:** Configure Pomodoro settings

#### Previous Attempts (Do Not Repeat)
First attempt.

### Quality Gap 3: Number Inputs Missing :focus-visible Styles

- **Gap ID:** fix-008
- **Category:** interaction_improvement
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The settings modal's CSS applies `outline: none` to number inputs without providing a `:focus-visible` replacement. Keyboard users tabbing through the modal see no visible indication of which input has focus. This violates WCAG 2.4.7 (Focus Visible) at the AA level. The QA Gate initially classified this as LOW but reclassified to MEDIUM due to WCAG AA requirements. Heuristic HA-R5 failed.

#### Current State (What's Wrong)
- **Description:** When a keyboard user navigates the settings modal using Tab, the number inputs (focus duration, short break, long break, sessions before long break) show no visible focus indicator. The browser's default outline was removed with `outline: none` but no `:focus-visible` replacement was added. The user has no visual feedback about which element is currently focused, making keyboard navigation of the settings form impossible without guessing.
- **PO Review Assessment:** Heuristic HA-R5 failed: "Number inputs in settings lack :focus-visible styling." A11y review: "Number inputs in settings use outline:none without :focus-visible replacement — invisible focus for keyboard users (WCAG 2.4.7 AA)."
- **Heuristics Failed:** HA-R5
- **Affected Screens:** Settings modal
- **Affected Journeys:** Configure Pomodoro settings

#### Previous Attempts (Do Not Repeat)
First attempt.

---

## Target State

### From Library Heuristics
- **HA-R1 (Modal Focus Trap):** When a modal is open, Tab/Shift+Tab must cycle within the modal's focusable elements only. Focus must never escape to background page elements. On modal close, focus returns to the trigger element.
  - **Measurement:** Open modal, press Tab repeatedly (20+ times), verify focus never reaches a background element. Press Shift+Tab from first element, verify focus wraps to last element.
  - **Threshold:** Zero Tab presses reach background elements while modal is open.

- **HA-R2 (Color Contrast WCAG AA):** All text must achieve minimum 4.5:1 contrast ratio for normal text.
  - **Measurement:** Compute contrast ratio of modal footer text (including opacity) against modal background.
  - **Threshold:** ≥ 4.5:1 for the footer legal text.

- **HA-R5 (Focus Visible):** All focusable elements must have a visible focus indicator when navigated via keyboard.
  - **Measurement:** Tab to each input in the modal, verify a visible outline/ring appears.
  - **Threshold:** Every focusable element shows a visible indicator on :focus-visible.

### From Reference Products
No reference products defined. These are WCAG AA baseline requirements.

### Concrete Description
After this change:

1. **Focus Trap:** The settings modal is converted to use the native HTML `<dialog>` element with `showModal()`. This provides:
   - Automatic focus trapping (Tab/Shift+Tab cycle within the dialog)
   - Automatic `inert` on background content (background elements are removed from tab order and screen reader tree)
   - Native Escape key handling (already implemented, now browser-native)
   - `::backdrop` pseudo-element for the overlay (replaces custom overlay div)

   On open: `dialogRef.current.showModal()` is called. Focus moves to the first focusable element inside the dialog (the close button or first input).
   On close: `dialogRef.current.close()` is called. Focus returns to the settings trigger button (gear icon).

   If `<dialog>` is not feasible (e.g., styling constraints), an alternative is a manual focus trap: on mount, find all focusable elements, on Tab from last → focus first, on Shift+Tab from first → focus last. Also set `aria-modal="true"` and `inert` on background content. The `<dialog>` approach is strongly preferred for its completeness and browser-native behavior.

2. **Footer Text Contrast:** The modal footer legal text opacity increases from `0.6` to `0.85` or higher. Alternatively, the base color changes from `rgb(107,114,128)` to `rgb(156,163,175)` (#9ca3af) while keeping or reducing the opacity. The effective contrast against the modal background must achieve ≥ 4.5:1. The text should still feel subdued and secondary — it's a legal disclosure, not primary content — but it must be legible.

3. **:focus-visible Styles:** The `outline: none` on number inputs is replaced with a `:focus-visible` rule that shows a visible focus ring. The ring uses the current phase accent color (via CSS custom property `var(--accent)` or equivalent) with a 2px solid outline and 2px offset. This provides clear keyboard navigation feedback while not showing outlines on mouse click (`:focus-visible` only fires for keyboard navigation). The same `:focus-visible` treatment applies to all focusable elements within the modal: inputs, toggles, slider, and buttons.

---

## Design Requirements

- **Requires Design Mode:** false
- **Design Mode Scope:** N/A
- **Design Direction:** The `<dialog>` conversion should preserve the current modal appearance: frosted glass card, dark scrim, centered layout, entrance animation. The `::backdrop` can replace the custom overlay with equivalent styling (`background: rgba(0,0,0,0.5)` or similar). The focus ring color should use the phase accent color to feel integrated with the design system rather than using the browser's default blue outline.
- **Design Constraints:** The modal's visual appearance must remain unchanged except for the footer text becoming slightly more readable and focus rings appearing on keyboard navigation. The entrance animation must be preserved. The frosted glass effect must be preserved. No layout changes to modal content.

---

## Acceptance Criteria

AC-settings-a11y-1: Focus trapped within modal
  GIVEN the settings modal is open
  WHEN the user presses Tab 20+ times consecutively
  THEN focus cycles within the modal elements and never reaches any background page element
  MEASUREMENT: Open modal via browser, Tab 25 times, after each Tab check document.activeElement — verify every focused element is inside the dialog/modal container. Zero elements outside the modal receive focus.
  HEURISTIC: HA-R1
  CLOSES_GAP: fix-002

AC-settings-a11y-2: Shift+Tab wraps from first to last element
  GIVEN the settings modal is open and focus is on the first focusable element
  WHEN the user presses Shift+Tab
  THEN focus moves to the last focusable element in the modal (not to a background element)
  MEASUREMENT: Focus the first element in modal, press Shift+Tab, verify document.activeElement is the last focusable element in the modal.
  HEURISTIC: HA-R1
  CLOSES_GAP: fix-002

AC-settings-a11y-3: Focus returns to trigger on close
  GIVEN the settings modal is open
  WHEN the user closes the modal (via close button, Escape key, or overlay click)
  THEN focus returns to the settings trigger button (gear icon)
  MEASUREMENT: Open modal, close it, verify document.activeElement matches the settings button.
  HEURISTIC: HA-R1
  CLOSES_GAP: fix-002

AC-settings-a11y-4: Background inert when modal open
  GIVEN the settings modal is open
  WHEN a screen reader user navigates the page
  THEN background elements (timer, controls, session counter) are not accessible — either via `inert` attribute or `aria-hidden="true"` on background content
  MEASUREMENT: With modal open, verify background content has `inert` attribute or `aria-hidden="true"`. Alternatively, if using <dialog showModal()>, browser handles this natively — verify dialog element exists with `open` attribute.
  HEURISTIC: HA-R1
  CLOSES_GAP: fix-002

AC-settings-a11y-5: Modal footer text meets WCAG AA contrast
  GIVEN the settings modal is open
  WHEN inspecting the legal disclosure text at the bottom of the modal
  THEN the text has an effective contrast ratio ≥ 4.5:1 against the modal background
  MEASUREMENT: Get computed style (color, opacity, background-color) of the footer text element. Calculate effective color accounting for opacity. Compute WCAG contrast ratio. Must be ≥ 4.5.
  HEURISTIC: HA-R2
  CLOSES_GAP: fix-004

AC-settings-a11y-6: Footer text remains visually subdued
  GIVEN the settings modal is open
  WHEN comparing the footer legal text to the settings labels and section headers
  THEN the footer text is clearly the lowest visual priority — smaller font size, muted color relative to settings labels
  MEASUREMENT: Screenshot of modal. Footer text should be visually subordinate to section headers and setting labels. Font size of footer ≤ font size of setting labels.
  CLOSES_GAP: fix-004

AC-settings-a11y-7: Number inputs show focus ring on keyboard Tab
  GIVEN the settings modal is open
  WHEN the user Tabs to a number input (e.g., focus duration)
  THEN a visible focus ring/outline appears around the input
  MEASUREMENT: Tab to a number input, capture screenshot or check computed style. Verify outline-width > 0 or box-shadow with visible spread on the focused input. The indicator must be visible against the dark modal background.
  HEURISTIC: HA-R5
  CLOSES_GAP: fix-008

AC-settings-a11y-8: Toggle switches show focus ring on keyboard Tab
  GIVEN the settings modal is open
  WHEN the user Tabs to a toggle switch (e.g., auto-start breaks)
  THEN a visible focus indicator appears on the toggle
  MEASUREMENT: Tab to a toggle element, verify a visible outline or ring appears. Check computed style for outline or box-shadow.
  HEURISTIC: HA-R5
  CLOSES_GAP: fix-008

AC-settings-a11y-9: Focus ring not visible on mouse click
  GIVEN the settings modal is open
  WHEN the user clicks a number input with the mouse
  THEN no visible focus ring/outline appears (only :focus-visible triggers the ring, not :focus)
  MEASUREMENT: Click an input with mouse, verify no outline appears. Then Tab to it, verify outline appears. This confirms :focus-visible behavior rather than :focus.
  HEURISTIC: HA-R5
  CLOSES_GAP: fix-008

AC-settings-a11y-10: Modal entrance animation preserved
  GIVEN the user is on the main timer page
  WHEN the user clicks the settings button to open the modal
  THEN the modal appears with a smooth entrance animation (fade + scale or equivalent)
  MEASUREMENT: Browser test — open modal, observe animation. CSS transition or animation property must be present on the dialog/modal container. Verify animation-duration > 0 or transition-duration > 0.
  CLOSES_GAP: fix-002

---

## Scope

### In Scope
- `src/components/SettingsModal.tsx` — convert to `<dialog>` element, focus management
- `src/components/SettingsModal.module.css` — footer text contrast, :focus-visible styles, dialog/::backdrop styling
- `src/app/page.tsx` — update modal open/close logic if needed for `<dialog>` API
- Unit tests for focus trapping, contrast, and :focus-visible

### Out of Scope (Do Not Touch)
- Settings modal functionality — all 8 settings, persistence, and validation behavior unchanged
- Main timer page layout — no changes outside the modal
- Timer controls — no changes
- Session counter — handled in separate spec (epoch-loop-2-main-a11y)
- Settings modal micro-interactions/delight — deferred to future cycle (qg-002)
- Settings modal spacing/density — deferred to future cycle (qg-003)

### Regression Risk
- Converting from `<div>` overlay to `<dialog>` may affect the entrance animation — `<dialog>` elements have different default styles and animation behavior. The CSS may need adjustment to preserve the fade+scale entrance.
- `<dialog>::backdrop` replaces the custom overlay — ensure the backdrop opacity and blur match the current overlay appearance.
- Focus trapping via `<dialog showModal()>` may interfere with Escape key handling — verify Escape still closes the modal (it should — `<dialog>` handles this natively, but the existing Escape handler in the React component may conflict).
- `:focus-visible` styles on the volume slider may look different than on number inputs — ensure consistent appearance across input types.
- The `inert` behavior of `<dialog>` makes background elements non-interactive — verify this doesn't break the timer (which should continue running while modal is open).

---

## Root Cause Context

- **Classification:** implementation_bug
- **What Went Wrong:** The settings modal was implemented as a standard `<div>` overlay with manual open/close state management. This is a common pattern but misses critical accessibility requirements: focus trapping, background inertness, and focus restoration. The browser provides these for free via `<dialog showModal()>`, but the builder chose the `<div>` pattern (likely out of habit or because the spec didn't specify the HTML element). The footer contrast issue stems from the same root cause as the session counter (fix-003) — using the design system's `text_secondary` color with additional opacity reduction on a dark background. The `:focus-visible` issue is a CSS oversight — `outline: none` was applied (common for design system inputs) without the corresponding `:focus-visible` replacement.
- **Why Previous Approach Failed:** N/A — first attempt.
- **What's Different This Time:** The change spec explicitly requires `<dialog>` with `showModal()` (preferred approach) or manual focus trap (fallback). It specifies exact contrast requirements with measurement methods. It requires `:focus-visible` with accent-colored outline on all focusable elements. The builder has no ambiguity about what to implement.
