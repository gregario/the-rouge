# Change Spec: Keyboard Shortcut Discoverability

**Change ID:** epoch-loop-2-shortcut-discovery
**Cycle:** 2
**Priority:** MEDIUM
**Requires Design Mode:** true

---

## Gap Evidence

### Quality Gap: Keyboard Shortcuts Undiscoverable

- **Gap ID:** qg-001
- **Category:** interaction_improvement
- **Severity:** MEDIUM
- **Root Cause:** spec_ambiguity
- **Root Cause Evidence:** The seed spec AC-controls-5 says "Keyboard accessible (Space, R, S)" — it specifies the shortcuts should exist but says nothing about their discoverability. The spec treats keyboard access as a functional requirement, not a UX requirement. The builder implemented working shortcuts with no visible indication they exist. The PO Review's heuristic evaluation failed H10-R1: "Keyboard shortcuts discoverable" — "No visible hint that Space/R/S shortcuts exist." Journey quality noted that reset step clarity scored 8/10 (slightly below 9-10 for other controls).

#### Current State (What's Wrong)
- **Description:** Three keyboard shortcuts exist — Space (start/pause), R (reset), S (skip) — but there is zero visual indication of their existence. No tooltips, no help overlay, no small text hints near the buttons. A user who only uses the mouse will never discover them. A keyboard-oriented user might try common shortcuts (Space for play/pause is somewhat conventional) but R and S are not universal conventions. The shortcuts are fully functional and well-implemented — the problem is purely discoverability.
- **PO Review Assessment:** Heuristic H10-R1 failed: "Keyboard shortcuts discoverable" — measured "No visible hint that Space/R/S shortcuts exist", threshold "Visual hint, tooltip, or help text." Journey quality: "Keyboard shortcuts working (Space for start/pause verified)" but discovery was incidental, not guided.
- **Heuristics Failed:** H10-R1
- **Affected Screens:** / (main timer — control buttons area)
- **Affected Journeys:** Start a focus session, Reset current phase timer

#### Previous Attempts (Do Not Repeat)
First attempt.

---

## Target State

### From Library Heuristics
- **H10-R1 (Keyboard Shortcuts Discoverable):** Keyboard shortcuts must be discoverable through at least one visual mechanism: inline hints, tooltips, or a help overlay.
  - **Measurement:** Visual inspection — verify at least one mechanism exists that reveals shortcut keys to users.
  - **Threshold:** All three shortcuts (Space, R, S) are discoverable without prior knowledge.

### From Reference Products
No reference products defined. However, common patterns from premium apps:
- Linear: shows keyboard shortcuts in tooltip on hover ("K" shown next to action name)
- Figma: "?" icon opens keyboard shortcut overlay
- Notion: tooltips show shortcuts inline (e.g., "Bold ⌘B")

### Concrete Description
After this change, keyboard shortcuts are discoverable through a design-approved mechanism. The design mode phase will determine the exact approach, but the spec provides constraints and options:

**Option A: Inline shortcut hints** (preferred for minimal UI)
Small, subdued text labels appear near each control button showing the shortcut key. For example, below or beside the play/pause button, small text "Space" in muted secondary color. Below reset: "R". Below skip: "S". The hints are always visible but unobtrusive — they should feel like part of the button label, not bolted-on annotations.

**Option B: Tooltip on hover/focus**
Each control button shows a tooltip on hover (mouse) or focus (keyboard) that includes the action name and shortcut key. Example: hovering the play button shows "Start timer (Space)". This is less discoverable than Option A (requires hover intent) but cleaner visually.

**Option C: Help overlay via "?" icon**
A small "?" icon (or keyboard icon) in the corner reveals a shortcut legend panel on click. The panel lists all shortcuts in a compact format. This centralizes discovery but requires the user to find and click the "?" first.

**Design constraints for all options:**
- The visual treatment must match the Epoch aesthetic: muted, secondary, not competing with the timer display
- The mechanism must not add visual clutter that conflicts with the "as little design as possible" philosophy
- The shortcut hints must be readable (meet WCAG AA contrast) but clearly subordinate to the button icons
- The approach should feel crafted, not functional — consistent with the premium design language

**The design mode phase will produce:**
- A specific recommendation (A, B, C, or hybrid)
- Exact styling: font size, color, position relative to buttons, animation (if any)
- Responsive behavior: whether hints are shown/hidden on mobile (mobile keyboards don't have these shortcuts)

---

## Design Requirements

- **Requires Design Mode:** true
- **Design Mode Scope:** Pass 2 (component design) + Pass 3 (visual design). UX architecture (Pass 1) is not needed — the feature is a simple addition to existing controls, not a structural change.
- **Design Direction:** The current control area has three evenly-spaced icon buttons (play/pause, reset, skip). The shortcut hints should integrate with this existing layout. Option A (inline hints) is recommended as the default — it provides the best discoverability without requiring interaction. The hints should use the `text_secondary` color (corrected for contrast per fix-003) at a small font size (10-12px). They should appear below each button icon, creating a two-line label (icon + shortcut text). On mobile viewports (< 768px), the hints could be hidden since keyboard shortcuts are irrelevant on touch devices.
- **Design Constraints:** The timer display hierarchy must remain dominant — shortcut hints must never compete with the timer digits. The control button icons must remain the primary visual element in the controls area — hints are supplementary. No new icons or buttons should be added to the main timer view (i.e., no "?" help icon — that would add a fourth element to the clean three-button layout).

---

## Acceptance Criteria

AC-shortcut-1: All three shortcuts are visually discoverable
  GIVEN the main timer page is loaded on a desktop viewport (≥ 768px)
  WHEN the user looks at the control buttons area
  THEN visual hints for all three shortcuts (Space, R, S) are present and readable
  MEASUREMENT: DOM query for elements containing text "Space" (or "⎵"), "R", and "S" within or adjacent to the controls container. All three must exist and be visible (not display:none, not visibility:hidden, not zero-dimension).
  HEURISTIC: H10-R1
  CLOSES_GAP: qg-001

AC-shortcut-2: Shortcut hints meet WCAG AA contrast
  GIVEN the main timer page is loaded
  WHEN inspecting the shortcut hint text
  THEN each hint has a contrast ratio ≥ 4.5:1 against its background (or ≥ 3:1 if the text is ≥ 18px/14px bold)
  MEASUREMENT: Compute contrast ratio of hint text color against background. Must meet WCAG AA threshold for the text size used.
  HEURISTIC: HA-R2
  CLOSES_GAP: qg-001

AC-shortcut-3: Shortcut hints are visually subordinate to button icons
  GIVEN the main timer page is loaded
  WHEN comparing the visual weight of shortcut hints to the control button icons
  THEN the hints are clearly secondary — smaller, lighter, less prominent than the icons themselves
  MEASUREMENT: Screenshot comparison. Hint font-size must be smaller than icon size. Hint color must be muted relative to icon color.
  CLOSES_GAP: qg-001

AC-shortcut-4: Shortcut hints hidden on mobile
  GIVEN the main timer page is loaded on a mobile viewport (< 768px)
  WHEN inspecting the controls area
  THEN shortcut hints are hidden (keyboard shortcuts are irrelevant on touch devices)
  MEASUREMENT: Set viewport to 375x812, verify shortcut hint elements are not visible (display:none, visibility:hidden, or not rendered via media query).
  CLOSES_GAP: qg-001

AC-shortcut-5: Timer display hierarchy preserved
  GIVEN the main timer page is loaded with shortcut hints visible
  WHEN viewing the full page layout
  THEN the timer digits remain the dominant visual element — shortcut hints do not create visual competition or clutter
  MEASUREMENT: Screenshot at 1280x720 — timer display should command primary visual attention. Control area (including hints) remains secondary. No new visual clutter introduced above the fold.
  CLOSES_GAP: qg-001

---

## Scope

### In Scope
- `src/components/TimerControls.tsx` — add shortcut hint elements
- `src/components/TimerControls.module.css` — style shortcut hints, responsive hiding
- Design mode review of hint placement, styling, and responsive behavior
- Unit tests for hint visibility and responsive hiding

### Out of Scope (Do Not Touch)
- Keyboard shortcut functionality — the shortcuts themselves (Space, R, S) are already working and must not change
- Timer display — no changes
- Settings modal — no changes
- Session counter — no changes
- Adding new buttons or icons to the main page (e.g., no "?" help icon)
- Keyboard shortcut overlay/panel (Option C) — unless design mode specifically recommends it

### Regression Risk
- Adding text elements below buttons could affect the vertical spacing and push content down — verify the timer display position and session counter position are not significantly shifted
- On mobile, if hints are hidden via CSS but the DOM space is still reserved, it could create unwanted whitespace — use display:none or conditional rendering
- The shortcut hint text could wrap on very narrow viewports if not sized correctly — test at 320px width

---

## Root Cause Context

- **Classification:** spec_ambiguity
- **What Went Wrong:** The seed spec defined keyboard shortcuts as a functional requirement ("Keyboard accessible — Space, R, S") without addressing discoverability. The builder correctly implemented the shortcuts but had no guidance on making them visible to users. This is a spec gap — the spec treated keyboard access as a binary (shortcuts exist: yes/no) rather than a spectrum (shortcuts exist AND users can discover them).
- **Why Previous Approach Failed:** N/A — first attempt.
- **What's Different This Time:** The change spec explicitly requires visual discoverability with measurable criteria. Design mode will determine the exact visual approach, but the spec constrains the solution space: integrated with existing controls, WCAG AA contrast, mobile-hidden, visually subordinate. The builder will implement whatever design mode produces, not guess at the treatment.
