# Change Spec: App-Level Robustness

**Change ID:** epoch-loop-2-robustness
**Cycle:** 2
**Priority:** HIGH
**Requires Design Mode:** false

---

## Gap Evidence

### Quality Gap 1: No React Error Boundary

- **Gap ID:** fix-001
- **Category:** interaction_improvement
- **Severity:** HIGH
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The product standard requires graceful error handling. The seed spec's global accessibility standard implies resilient UI. No ErrorBoundary component exists in the component tree — any unhandled render error crashes to a blank white page. The QA Gate identified this as HIGH severity (-5 health score). The heuristic evaluation failed H5-R3 ("React Error Boundary catches component crashes") and H9-R1 ("Graceful crash recovery UI").

#### Current State (What's Wrong)
- **Description:** An unhandled JavaScript error in any React component causes the entire app to crash to a blank white page. There is no fallback UI, no recovery option, and no indication of what happened. For a product designed to be "left on screen" during focus sessions, this is a critical failure mode — a crash during a timed session with no recovery would be deeply frustrating.
- **PO Review Assessment:** Heuristic H5-R3 failed: "No ErrorBoundary component in tree." Heuristic H9-R1 failed: "No error boundary fallback UI."
- **Heuristics Failed:** H5-R3, H9-R1
- **Affected Screens:** All screens (app-level)
- **Affected Journeys:** All journeys — crash recovery affects every user flow

#### Previous Attempts (Do Not Repeat)
First attempt.

### Quality Gap 2: No localStorage Schema Validation

- **Gap ID:** fix-005
- **Category:** interaction_improvement
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** The `loadSettings()` function in `storage.ts` uses `JSON.parse` with a spread merge against defaults but performs no type checking or range clamping. Corrupted or manually edited localStorage values could produce NaN timer durations, boolean-as-string settings, or out-of-range values. The QA Gate flagged this as MEDIUM severity (-2 health score). Heuristic H5-R4 failed: "localStorage schema validation on read."

#### Current State (What's Wrong)
- **Description:** When settings are loaded from localStorage, the parsed JSON is spread over defaults without validating value types or ranges. If localStorage contains `{"focusDuration": "abc"}` or `{"volume": 999}`, the app will display NaN in the timer or behave unpredictably. This creates a silent corruption path — the user sees broken behavior with no clear cause.
- **PO Review Assessment:** Heuristic H5-R4 failed: "Raw JSON.parse without validation."
- **Heuristics Failed:** H5-R4
- **Affected Screens:** / (main timer), settings modal
- **Affected Journeys:** All journeys — corrupt settings affect timer display, phase durations, audio, and notifications

#### Previous Attempts (Do Not Repeat)
First attempt.

### Quality Gap 3: AudioContext Suspended State Not Handled

- **Gap ID:** fix-006
- **Category:** interaction_improvement
- **Severity:** MEDIUM
- **Root Cause:** implementation_bug
- **Root Cause Evidence:** Browser autoplay policies suspend `AudioContext` until a user gesture. The `playChime()` function in `audio.ts` creates or reuses an AudioContext but never calls `resume()`. On mobile browsers (and some desktop browsers on first load), the first chime after page load will be silently swallowed. The QA Gate flagged this as MEDIUM (-2 health score).

#### Current State (What's Wrong)
- **Description:** The phase transition chime — a key feedback mechanism for the Pomodoro cycle — may silently fail on first play after page load on mobile browsers. The AudioContext starts in a "suspended" state per browser autoplay policy. Without calling `audioCtx.resume()`, the oscillator note is scheduled but never reaches the audio output. The user misses their first phase transition notification with no indication that sound failed.
- **PO Review Assessment:** AI code audit robustness finding: "AudioContext may be suspended on first load (browser autoplay policy) — no resume() call."
- **Heuristics Failed:** None directly, but contributes to robustness score (78/100)
- **Affected Screens:** / (main timer)
- **Affected Journeys:** Phase transition (Focus to Short Break) — first chime after page load

#### Previous Attempts (Do Not Repeat)
First attempt.

---

## Target State

### From Library Heuristics
- **H5-R3 (Error Boundary):** A React Error Boundary must wrap the main content tree. On unhandled render error, it displays a styled fallback UI with a recovery action. The fallback must never show a blank white page.
  - **Measurement:** Trigger a render error (e.g., throw in a component). Verify fallback UI renders instead of blank page.
  - **Threshold:** Fallback UI visible within 100ms of error. Contains at minimum: error indication, "Reload" button.

- **H5-R4 (localStorage Validation):** All values read from localStorage must be validated for type and range before use. Invalid values must fall back to defaults.
  - **Measurement:** Write malformed JSON to localStorage keys, reload page, verify app uses defaults.
  - **Threshold:** Zero NaN values, zero type coercion errors, zero out-of-range values after loading corrupted data.

- **H9-R1 (Crash Recovery):** The fallback UI must provide a clear recovery path — at minimum a "Reload" button that refreshes the page.
  - **Measurement:** After error boundary catches, verify recovery button is present and functional.
  - **Threshold:** One-click recovery from any crash state.

### From Reference Products
No reference products defined. These are baseline robustness expectations for any production web app.

### Concrete Description
After this change:

1. **Error Boundary:** A new `ErrorBoundary` component wraps the app's main content in `layout.tsx`. If any child component throws during render, the boundary catches it and displays a fallback screen. The fallback screen matches the Epoch dark aesthetic — dark background (#0a0a0f), centered card with frosted glass, a message like "Something went wrong," and a prominent "Reload" button styled with the current phase accent color. The fallback must not look jarring or out of place — it should feel like part of the product, not a system error page.

2. **localStorage Validation:** The `loadSettings()` function in `storage.ts` validates every parsed field before merging with defaults. For each setting: (a) type check — must be the expected type (number for durations, boolean for toggles, number for volume), (b) range clamp — durations 1–99 minutes, interval 1–10, volume 0–1. If any field fails validation, it falls back to the default value for that field (not the entire settings object). The `loadDailyCount()` function similarly validates its parsed values.

3. **AudioContext Resume:** The `playChime()` function in `audio.ts` calls `audioCtx.resume()` before scheduling any oscillator nodes. Since `resume()` returns a promise, it should be awaited (or the oscillator scheduling should be chained). This ensures the AudioContext is active before playing, even on mobile browsers with strict autoplay policies.

---

## Design Requirements

- **Requires Design Mode:** false
- **Design Mode Scope:** N/A
- **Design Direction:** The Error Boundary fallback should visually match the Epoch aesthetic (dark background, frosted glass card, phase-appropriate accent color). Use the existing design system tokens — no new visual language needed. The fallback is a safety net, not a feature surface.
- **Design Constraints:** The Error Boundary must not affect the normal rendering path. No visible change to the app when errors do not occur. The localStorage validation must not change any default values or settings behavior — only prevent corrupted values from reaching the app.

---

## Acceptance Criteria

AC-robust-1: Error boundary catches render errors
  GIVEN the app is loaded normally
  WHEN a React component throws an unhandled error during render
  THEN a styled fallback UI appears instead of a blank white page
  MEASUREMENT: Inject a throw in a component, verify via DOM query that fallback container with data-testid="error-boundary-fallback" is present and visible
  HEURISTIC: H5-R3
  CLOSES_GAP: fix-001

AC-robust-2: Error boundary fallback matches Epoch aesthetic
  GIVEN the error boundary has caught an error
  WHEN the fallback UI is displayed
  THEN the fallback has dark background (#0a0a0f or matching), centered content, and a "Reload" button
  MEASUREMENT: Screenshot comparison — fallback renders on dark background with centered card. DOM query confirms button with text "Reload" or "Try again" exists.
  HEURISTIC: H9-R1
  CLOSES_GAP: fix-001

AC-robust-3: Error boundary recovery button works
  GIVEN the error boundary fallback is displayed
  WHEN the user clicks the "Reload" button
  THEN the page refreshes and the app loads normally
  MEASUREMENT: Click reload button, verify page reloads (window.location.reload or equivalent). After reload, verify timer displays normally.
  HEURISTIC: H9-R1
  CLOSES_GAP: fix-001

AC-robust-4: localStorage corrupted number handled
  GIVEN localStorage contains epoch_settings with focusDuration set to "abc" (string instead of number)
  WHEN the app loads and reads settings
  THEN focusDuration falls back to default value (25) and timer displays 25:00
  MEASUREMENT: Set localStorage key to malformed JSON, reload app, read timer display text. Verify it shows "25:00" (default) not "NaN:NaN".
  HEURISTIC: H5-R4
  CLOSES_GAP: fix-005

AC-robust-5: localStorage out-of-range values clamped
  GIVEN localStorage contains epoch_settings with focusDuration set to 999
  WHEN the app loads and reads settings
  THEN focusDuration is clamped to maximum (99) and timer displays 99:00
  MEASUREMENT: Set localStorage focusDuration to 999, reload, verify timer shows ≤ 99:00.
  HEURISTIC: H5-R4
  CLOSES_GAP: fix-005

AC-robust-6: localStorage missing fields use defaults
  GIVEN localStorage contains epoch_settings with only { "volume": 0.5 } (other fields missing)
  WHEN the app loads and reads settings
  THEN all missing fields use default values, only volume uses the stored 0.5
  MEASUREMENT: Set localStorage to partial object, reload, open settings modal, verify all fields have valid values.
  HEURISTIC: H5-R4
  CLOSES_GAP: fix-005

AC-robust-7: AudioContext resumed before chime
  GIVEN the page has just loaded and no user gesture has occurred on audio elements
  WHEN a phase transition triggers playChime()
  THEN audioCtx.resume() is called before oscillator scheduling
  MEASUREMENT: Code review — verify resume() call exists in playChime() before oscillator.start(). Unit test: mock AudioContext with suspended state, verify resume() called.
  CLOSES_GAP: fix-006

AC-robust-8: Chime plays on mobile after user interaction
  GIVEN the user has clicked Start (user gesture) and timer is running on a mobile browser
  WHEN the timer completes and phase transitions
  THEN the chime sound plays audibly (AudioContext is in "running" state)
  MEASUREMENT: Browser test on mobile viewport — verify AudioContext.state === "running" after resume() in playChime(). Verify no console warnings about blocked audio.
  CLOSES_GAP: fix-006

---

## Scope

### In Scope
- New `ErrorBoundary` component in `src/components/ErrorBoundary.tsx`
- ErrorBoundary wrapping in `src/app/layout.tsx`
- Validation logic in `src/engine/storage.ts` — `loadSettings()` and `loadDailyCount()`
- `audioCtx.resume()` call in `src/engine/audio.ts` — `playChime()` function
- Unit tests for all three changes

### Out of Scope (Do Not Touch)
- Settings modal UI — no changes to how settings are displayed or edited
- Timer display component — no visual changes
- Timer controls — no behavior changes
- Phase transition logic — no changes to cycle engine
- CSS/styling of any existing component (except the new ErrorBoundary fallback)

### Regression Risk
- ErrorBoundary wrapping could theoretically interfere with React context providers if placed incorrectly — wrap inside providers, not outside
- localStorage validation could change behavior if defaults differ from what users have stored — ensure validation only rejects truly invalid values, not edge-case valid ones
- AudioContext resume() is a no-op if already running — low regression risk

---

## Root Cause Context

- **Classification:** implementation_bug
- **What Went Wrong:** The building phase implemented all 37 seed spec acceptance criteria successfully (100% pass rate) but did not address robustness concerns beyond the spec. Error boundaries, input validation, and AudioContext state management are standard production practices that the spec didn't explicitly require. The QA Gate identified all three issues, generating fix tasks fix-001, fix-005, and fix-006, but the QA-fixing phase did not run — the pipeline proceeded to PO Review with these fixes unresolved.
- **Why Previous Approach Failed:** N/A — first attempt. These are new fixes, not retries.
- **What's Different This Time:** The change spec now makes these requirements explicit with measurable acceptance criteria. The builder has clear targets for error boundary behavior, validation logic, and AudioContext handling. The QA Gate will verify each criterion before PO Review.
