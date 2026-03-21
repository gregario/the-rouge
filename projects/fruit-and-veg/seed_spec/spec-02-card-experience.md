# SPEC: Card Experience

## Overview
The core interaction: kid sees a card, taps to flip, reads fun facts in the fruit's voice, then answers quiz questions. This is the heart of the product — every other feature feeds into or out of this moment.

---

## User Journeys

### Journey: Discover a New Fruit (Happy Path)
```
Entry point: Home screen (daily challenge) or Collection grid
Goal: Learn about a fruit/veg and earn its sticker
Preconditions: Item not yet completed by this user

Step 1: Kid taps a card (Fruit of the Day on home, or silhouette in collection)
  → System: Card zooms to fill the screen, showing the image prominently with the name below
  → Screen: Full-screen card view — large beautiful image, item name in playful font, coloured background matching the item
  → Click count: 1

Step 2: Kid taps the card to flip it
  → System: Card performs a smooth 3D flip animation (Y-axis rotation, ~400ms). Back side reveals fun facts.
  → Screen: Coloured card back with 3-4 fun facts in speech-bubble style. Highlighted words are bold and in a contrasting colour. A "Quiz me!" button pulses gently at the bottom.
  → Click count: 2

Step 3: Kid taps "Quiz me!" button
  → System: Card slides up slightly, quiz area slides in below with the first question
  → Screen: Card (smaller) at top, quiz question below. Question text in first person. 3-4 large tap targets for answers.
  → Click count: 3

Step 4: Kid taps an answer
  → System: If correct — answer button turns green, confetti/stars animation plays, celebration text appears ("Yes! I'm yellow!"). If incorrect — selected answer fades, correct answer highlights gently, correction text appears ("Nearly! I'm actually yellow"). Next question auto-advances after 1.5s.
  → Screen: Answer feedback overlay. No "wrong" buzzer, no red X. Just gentle colour changes and text.
  → Click count: 4

Step 5: Kid completes all questions (2-3 questions)
  → System: Sticker unlock animation plays. Item is marked as completed in local storage (and synced to backend if account exists). Collection count updates.
  → Screen: Full-screen sticker celebration — the item's image flies into a sticker shape with a gold border, "New sticker!" text appears. A "See my collection" and "Next card" button appear.
  → Click count: 5

Total clicks: 5 — JUSTIFIED: The core learning journey is inherently 5 steps (see → flip → quiz → answer → complete). Reducing would skip learning content. Each step is a single tap with no navigation decisions.
```

### Journey: Re-Visit a Completed Card
```
Entry point: Collection grid (coloured sticker)
Goal: Re-read facts and re-take quiz for practice
Preconditions: Item previously completed

Step 1: Kid taps a completed item in collection
  → System: Card opens to the front (image) view
  → Screen: Same as discovery, but with a small gold sticker badge in the corner indicating "completed"
  → Click count: 1

Step 2: Kid taps to flip
  → System: Same flip animation, facts appear
  → Screen: Same fact view. "Quiz me!" button available for practice.
  → Click count: 2

Step 3: Kid takes the quiz (optional)
  → System: Quiz works identically to first time. No additional sticker earned (already have it). Celebration is lighter — "You remembered!" instead of "New sticker!"
  → Screen: Same quiz UI. Results are for practice only — not tracked.
  → Click count: 3

Total clicks: 3 ✓
```

### Journey: Sad Path — Image Fails to Load
```
Entry point: Any card view
Preconditions: Image file is corrupt or missing

Step 1: Kid taps a card
  → System: Image load fails. Fallback renders immediately (no loading spinner for kids).
  → Screen: A solid circle in the item's primary colour with the item name in white text, centered. The card is still tappable and functional.
  → Recovery: All other card functionality works normally. The fallback image is used everywhere this item appears.
```

### Journey: Sad Path — Local Storage Full
```
Entry point: Completing a card
Preconditions: Device localStorage is full (rare but possible on shared devices)

Step 1: Kid completes quiz, system tries to save progress
  → System: localStorage write fails. Progress for THIS session is held in memory.
  → Screen: No error shown to child. The sticker celebration plays normally.
  → Recovery: On next app load, a subtle banner appears on the parent-facing settings area: "Storage is full — some progress may not be saved. Consider creating an account to save progress."
  → Data preservation: Current session progress is in memory and functional until page close.
```

---

## Interaction Patterns

### Element: Card (Front — Image View)
```
Type: card (tappable)
States:
  - Default: Beautiful image, item name below, coloured background. Slight drop shadow.
  - Hover (desktop): Subtle scale up (1.02x), shadow deepens. Cursor: pointer.
  - Active/Pressed: Scale down slightly (0.98x) — tactile press feel.
  - Loading: Not applicable — images are bundled/cached.
  - Disabled: Not applicable — cards are always tappable.
Click/Tap: Triggers flip animation to reveal facts.
Keyboard: Tab-focusable. Enter/Space triggers flip. Focus ring visible.
Touch: Single tap only. No swipe or long-press.
```

### Element: Card (Back — Facts View)
```
Type: card (readable content + CTA)
States:
  - Default: Coloured background, 3-4 fun facts in speech bubbles, "Quiz me!" button at bottom
  - Hover: Only the "Quiz me!" button has hover state
Click/Tap: Tapping the card body does nothing (content reading area). Only "Quiz me!" is tappable.
Keyboard: Tab moves focus to "Quiz me!" button.
```

### Element: "Quiz me!" Button
```
Type: button (primary CTA)
States:
  - Default: Large, rounded, bright colour contrasting with card background. Gentle pulse animation (scale 1.0 → 1.05, 2s cycle) to draw attention.
  - Hover: Background brightens, pulse stops, scale 1.05 static.
  - Active/Pressed: Scale 0.95, background darkens slightly.
  - Disabled: Not applicable.
Click/Tap: Transitions to quiz view.
Keyboard: Enter/Space triggers. Focus ring visible.
```

### Element: Quiz Answer Button
```
Type: button (answer option)
States:
  - Default: Large rounded rectangle. White/light background. Text or colour swatch inside. Minimum 48px height for tap targets.
  - Hover: Background tints toward the option's colour (for colour-match) or lightens.
  - Active/Pressed: Scale 0.95.
  - Correct: Background transitions to soft green. Checkmark icon appears. Celebration text shows.
  - Incorrect: Background transitions to soft amber (NOT red — red feels punitive for kids). Correct answer highlights simultaneously.
  - Disabled: After answering, all other options become non-tappable. Opacity 0.6.
Click/Tap: Submits answer. Triggers correct/incorrect state.
Keyboard: Tab between options. Enter/Space to select.
Touch: Single tap. Double-tap protection — first tap registers, second is ignored.
```

### Element: Sticker Celebration Overlay
```
Type: modal overlay (auto-dismiss)
States:
  - Appear: Fade in (200ms). Sticker image scales from 0 → 1.2 → 1.0 (bounce ease, 500ms). Confetti particles animate.
  - Active: Shows for 2 seconds, then "See collection" and "Next card" buttons fade in.
  - Dismiss: Tapping anywhere outside buttons, or tapping a button, fades out (200ms).
Click/Tap: "See collection" navigates to collection view. "Next card" loads next daily challenge card or returns to collection.
Keyboard: Escape dismisses. Tab focuses buttons.
```

### Data Loading Pattern
```
All catalogue data is bundled as static JSON — loaded on app init.
Images are bundled as static files — no network loading after initial page load.
Loading state: App shell renders immediately. If catalogue JSON takes >500ms (first load, uncached): show a simple spinner with a random fruit emoji.
Subsequent loads: Instant from browser cache.
```

---

## Acceptance Criteria

```
AC-CARD-01: Card displays image and name
  GIVEN a catalogue item
  WHEN its card is displayed
  THEN the image is visible (min 200x200px rendered), and the name is displayed in readable text (min 16px font)
  MEASUREMENT: DOM query for img element with naturalWidth >= 200, text element with item name

AC-CARD-02: Card interaction opens detail view
  GIVEN a card is displayed (thumbnail/preview)
  WHEN the user taps/clicks the card
  THEN a detail view opens with full card content (either via flip animation or route navigation to /card/[id])
  MEASUREMENT: Detail content is visible within 500ms of tap. Content includes item name, image, fun facts, and quiz.

AC-CARD-03: Fun facts display correctly
  GIVEN a card is flipped to the back
  WHEN the facts are displayed
  THEN 3-4 facts are shown, each in its own visual container, with the highlightWord rendered in bold/contrasting colour
  MEASUREMENT: DOM query for fact elements (count 3-4), bold/highlight element containing highlightWord text

AC-CARD-04: Quiz questions appear after "Quiz me!"
  GIVEN the card back is showing
  WHEN user taps "Quiz me!"
  THEN 2-3 questions are presented sequentially, each with 3-4 answer options
  MEASUREMENT: Question container appears with option buttons (count 3-4 per question)

AC-CARD-05: Correct answer shows celebration
  GIVEN a quiz question is displayed
  WHEN user selects the correct answer
  THEN the selected option turns green, a celebration animation plays, and positive text is shown
  MEASUREMENT: Selected button has success class/style (green). Celebration text element is visible and contains item-specific text.

AC-CARD-06: Incorrect answer shows gentle correction
  GIVEN a quiz question is displayed
  WHEN user selects an incorrect answer
  THEN the selected option turns amber (not red), the correct answer highlights in green, and correction text appears
  MEASUREMENT: Selected button has incorrect class/style (amber, not red). Correct button has success class. Correction text element is visible.

AC-CARD-07: Quiz auto-advances between questions
  GIVEN the user has answered a question
  WHEN 1.5 seconds have elapsed
  THEN the next question slides in (or completion celebration if last question)
  MEASUREMENT: After 1500ms delay, next question container is visible (or celebration overlay)

AC-CARD-08: Sticker earned on completion
  GIVEN the user completes all questions for an uncompleted item
  WHEN the last question is answered
  THEN a sticker celebration overlay appears, and the item is marked as completed in storage
  MEASUREMENT: Celebration overlay is visible. localStorage/backend contains item ID in completed items.

AC-CARD-09: Completed card shows badge
  GIVEN the user views a previously completed item
  WHEN the card front is displayed
  THEN a small gold sticker/badge is visible in the corner
  MEASUREMENT: Badge element with "completed" class is present on card

AC-CARD-10: Re-visit quiz works but doesn't re-award sticker
  GIVEN the user re-takes the quiz on a completed item
  WHEN they finish all questions
  THEN celebration text says "You remembered!" (not "New sticker!"), no new sticker animation plays
  MEASUREMENT: Celebration text contains "remembered" not "New sticker"

AC-CARD-11: Colour-match question uses colour circles
  GIVEN a question of type "colour-match"
  WHEN displayed
  THEN options are rendered as coloured circles (not text), each circle's background matches option.colour
  MEASUREMENT: Option elements have background-color matching their hex colour value, no text content

AC-CARD-12: Where-grow question uses icons
  GIVEN a question of type "where-grow"
  WHEN displayed
  THEN options show simple icons (tree, ground, bush, vine, underground) alongside text
  MEASUREMENT: Option elements contain both an icon/image element and text label

AC-CARD-13: Tap targets meet minimum size
  GIVEN any interactive element in the card/quiz view
  WHEN measured
  THEN all tap targets are at minimum 44x44px (WCAG 2.5.5)
  MEASUREMENT: Computed element dimensions >= 44x44px for all buttons and tappable elements

AC-CARD-14: Double-tap protection on quiz answers
  GIVEN a quiz question is displayed
  WHEN the user taps an answer twice rapidly
  THEN only the first tap registers. The second tap is ignored.
  MEASUREMENT: Click event handler debounce — second click within 500ms produces no state change

AC-CARD-15: Card works with keyboard navigation
  GIVEN the card view is displayed
  WHEN user navigates with Tab and activates with Enter/Space
  THEN all interactions (flip, quiz me, answer selection) work identically to tap
  MEASUREMENT: Tab order follows visual order. Enter/Space triggers same actions as click.

AC-CARD-16: Image fallback renders on load failure
  GIVEN a catalogue item whose image fails to load
  WHEN the card is displayed
  THEN a coloured circle with the item's primary colour and name text is shown instead
  MEASUREMENT: img onerror handler fires, fallback element visible with correct background-color
```

---

## Error States and Recovery

```
Error: Image load failure
  Trigger: Image file missing, corrupt, or network error on first load
  User sees: Coloured circle fallback (item's primary colour) with name text. No broken image icon.
  Recovery path: Automatic — fallback renders immediately. No user action needed.
  Data preservation: N/A
  Auto-recovery: Browser will retry image on next page load from cache

Error: Local storage write failure
  Trigger: localStorage full or unavailable (private browsing on some browsers)
  User sees: Nothing — celebration plays normally. Progress held in session memory.
  Recovery path: If account exists, progress syncs to backend. If no account, subtle prompt in parent settings area.
  Data preservation: Session memory retains progress until page close.
  Auto-recovery: No — requires user to clear storage or create account.

Error: Quiz data inconsistency
  Trigger: Question references option ID that doesn't exist (data bug)
  User sees: Question is skipped silently, next question loads.
  Recovery path: Automatic — remaining questions still work.
  Data preservation: Item can still be completed with remaining questions.
  Auto-recovery: Data bug should be caught by AC-CAT-03 validation.
```

---

## Security Considerations

```
Concern: XSS via catalogue data
  Risk: If catalogue JSON is ever generated from user input (future feature), malicious content could execute
  Mitigation: All catalogue content is static and reviewed. Render fun facts as text nodes, never innerHTML. React's default escaping handles this.
  Validation: No innerHTML or dangerouslySetInnerHTML in card rendering components

Concern: Local storage manipulation
  Risk: Tech-savvy user modifies localStorage to unlock all stickers
  Mitigation: Accept this — it's a kids' educational app, not a competitive game. No server-side validation of achievements for local-only users. For account users, progress is validated server-side.
  Validation: N/A — by design, not a security risk

Concern: Image content safety
  Risk: Sourced images could contain inappropriate content
  Mitigation: All images are reviewed during catalogue curation. Pixabay SafeSearch enabled during sourcing. Images are bundled statically — no dynamic image loading from external sources.
  Validation: Manual review of all bundled images before deployment
```

---

## Edge Cases

```
Edge case: Very small screen (320px)
  Scenario: Old/small phone with 320px viewport
  Expected behavior: Card image scales to fit. Facts may scroll within the card area. Quiz options stack vertically. All tap targets remain >= 44px.
  Why it matters: Parents may hand kids an older phone. The experience should still work.

Edge case: Landscape orientation
  Scenario: Kid holds tablet/phone sideways
  Expected behavior: Card and quiz reflow to use horizontal space — image on left, facts/quiz on right. Still functional.
  Why it matters: Kids naturally rotate devices. Layout should not break.

Edge case: Rapid card flipping
  Scenario: Kid taps the card rapidly during flip animation
  Expected behavior: Taps during animation are ignored. Animation completes before next interaction is accepted.
  Why it matters: Rapid tapping during animation can cause visual glitches or double state changes.

Edge case: All questions answered incorrectly
  Scenario: Kid gets every question wrong
  Expected behavior: Sticker is still earned. The learning happened via corrections. No penalty, no retry required.
  Why it matters: Failing to earn a sticker after trying would be discouraging for a 5-year-old.

Edge case: Browser back button during quiz
  Scenario: Parent/kid hits browser back during a quiz
  Expected behavior: Returns to previous view (collection or home). Quiz progress for this card is lost — they'll start fresh on next visit.
  Why it matters: Browser back is unpredictable. Graceful handling prevents broken states.
```
