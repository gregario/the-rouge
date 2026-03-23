# SPEC: Daily Challenge

## Overview
The Wordle-inspired daily loop: one featured Fruit of the Day (new discovery) + 2 review cards (spaced repetition of previously learned items). Completing all 3 earns a daily stamp that feeds the streak.

---

## Data Model

### Entity: DailyChallenge (computed, not stored in catalogue)
```
Fields:
  - date: string — ISO date (YYYY-MM-DD), device local time
  - featuredItemId: string — catalogue item ID for Fruit of the Day
  - reviewItemIds: string[] — 0-2 catalogue item IDs for review (depends on how many the user has completed)
  - completedCards: string[] — which of today's cards the user has finished (tracks partial completion)
  - isComplete: boolean — true when all cards (featured + reviews) are done

Constraints:
  - featuredItemId must be an item the user has NOT completed
  - If user has completed all items, featuredItemId is a random completed item (re-discovery mode)
  - reviewItemIds must be items the user HAS completed
  - reviewItemIds are selected by "least recently completed" for spaced repetition effect
  - Daily challenge resets at midnight local device time
```

### Daily Selection Algorithm
```
1. Determine today's date (device local time)
2. Check if a daily challenge exists for today in session storage
   - If yes: use it (don't regenerate mid-day)
   - If no: generate new
3. Featured item selection:
   a. Filter catalogue to uncompleted items
   b. If none remain → pick random completed item (re-discovery mode)
   c. From uncompleted: prefer "easy" difficulty items until user has 10+ completions, then mix in "medium"
   d. Use date as seed for deterministic selection (same user, same day = same featured item, even across page reloads)
4. Review item selection:
   a. Filter catalogue to completed items
   b. Sort by completedAt ascending (oldest first = most in need of review)
   c. Pick top 2 (or 1 if only 1 completed, or 0 if brand new user)
5. Store generated challenge in sessionStorage (persists for browser session, regenerates daily)
```

---

## User Journeys

### Journey: Complete Daily Challenge (Full)
```
Entry point: Home screen (default landing)
Goal: Complete all 3 daily cards
Preconditions: User has at least 2 previously completed items

Step 1: Kid lands on home screen
  → System: Today's daily challenge is generated/loaded
  → Screen: Featured Fruit of the Day card with gold border at top, prominent. Below: 2 smaller review cards. Text: "Today's Challenge" with the date. Progress dots (○ ○ ○ or ● for completed cards).
  → Click count: 0 (landing page)

Step 2: Kid taps Fruit of the Day card
  → System: Opens card experience (standard discovery journey)
  → Screen: Full card view with gold border indicating "today's special"
  → Click count: 1

Step 3-6: Standard card discovery journey (flip → quiz → complete)
  → System: On completion, returns to home. First progress dot fills (●).
  → Screen: Home screen with first card now showing checkmark overlay. Review cards still active.

Step 7: Kid taps first review card
  → System: Opens card experience (re-visit journey — quiz is for practice)
  → Screen: Card view, familiar item with completed badge

Step 8-10: Standard review journey (flip → quiz → "You remembered!")
  → System: On completion, returns to home. Second dot fills.

Step 11-13: Same for second review card. Third dot fills.

Step 14: All 3 cards complete
  → System: Daily stamp animation plays. Streak increments (if consecutive). dailyStamps array updated.
  → Screen: "Daily Challenge Complete!" celebration. Stamp visual (like a passport stamp). Streak counter updates. "Come back tomorrow for a new fruit!"

Total clicks: ~14 — JUSTIFIED: This is 3 complete card journeys (5 each) minus navigation. The daily challenge IS the product session — it's the whole point of the visit. Each click is a meaningful interaction, not navigation overhead.
```

### Journey: Partial Completion (Kid Leaves Mid-Challenge)
```
Entry point: Home screen, some cards already done today
Preconditions: 1 or 2 of today's cards completed

Step 1: Kid returns to home screen
  → System: Loads today's challenge with progress preserved
  → Screen: Completed cards show checkmark overlay. Remaining cards are active. Progress dots reflect state (e.g., ● ● ○). Text: "2 more to go!" or "1 more to go!"
  → Click count: 0

Step 2: Kid taps remaining card
  → System: Standard card journey
  → Flow continues normally
```

### Journey: Brand New User (Zero Completions)
```
Entry point: Home screen, first-ever visit
Preconditions: No items completed

Step 1: Kid lands on home
  → System: Daily challenge generated with featured item only. No review cards (nothing to review).
  → Screen: Single Fruit of the Day card, prominently displayed. No review section. Encouraging text: "Meet your first fruit!" Progress: single dot (○).
  → Click count: 0

Step 2: On completion of the featured card
  → System: Daily stamp earned (only 1 card needed since no reviews available). Streak starts.
  → Screen: Daily challenge complete! "Come back tomorrow to learn another fruit!"
```

### Journey: All Items Completed (Re-Discovery Mode)
```
Entry point: Home screen, every item in catalogue completed
Preconditions: completedItems.length === catalogue.length

Step 1: Kid lands on home
  → System: Featured item is a random completed item. Review items are 2 random completed items.
  → Screen: "Re-Discovery Mode!" banner. Featured card shows a completed item with text: "Let's see how much you remember!" No gold border (it's not new). Review cards as normal.

Daily stamp still earnable. Streak still counts. The product doesn't dead-end.
```

---

## Interaction Patterns

### Element: Fruit of the Day Card (Home Screen)
```
Type: card (tappable, featured)
States:
  - Default: Larger than review cards. Gold border/glow. Item image + name. "TODAY'S FRUIT" label. Star icon.
  - Completed today: Checkmark overlay. Gold border stays. Label changes to "DONE ✓". Still tappable (re-visit).
  - Hover: Scale 1.03, glow intensifies.
  - Active/Pressed: Scale 0.97.
Click/Tap: Opens card experience
```

### Element: Review Card (Home Screen)
```
Type: card (tappable, secondary)
States:
  - Default: Smaller than featured. Standard border. Item image + name. "REVIEW" label.
  - Completed today: Checkmark overlay. Label changes to "REVIEWED ✓". Still tappable.
  - Hover: Scale 1.03.
  - Active/Pressed: Scale 0.97.
Click/Tap: Opens card experience (re-visit flow)
```

### Element: Progress Dots
```
Type: static indicator
States:
  - Incomplete: Empty circle (○), light colour
  - Complete: Filled circle (●), bright colour matching the item's primary colour
  - All complete: All dots filled, connecting line turns gold, triggers celebration
Display: Horizontal row, centered, below the cards
```

### Element: Daily Stamp Celebration
```
Type: modal overlay (auto-progress)
States:
  - Appear: Stamp icon drops from above with a "thunk" animation. Text appears: "Daily Challenge Complete!"
  - Streak update: After 1s, streak counter animates (number increments, flame/flower grows)
  - Dismiss: "Come back tomorrow!" text + close button appear after 2s. Auto-dismiss after 5s.
Click/Tap: Tap anywhere to dismiss early
```

---

## Acceptance Criteria

```
AC-DAILY-01: Home screen shows daily challenge
  GIVEN a user opens the app
  WHEN the home screen loads
  THEN a Fruit of the Day card and 0-2 review cards are displayed for today's date
  MEASUREMENT: Featured card element exists. Date matches device local date.

AC-DAILY-02: Featured item is uncompleted
  GIVEN a user has uncompleted items remaining
  WHEN the daily challenge is generated
  THEN the featured item is one the user has NOT previously completed
  MEASUREMENT: featuredItemId NOT IN completedItems array

AC-DAILY-03: Review items are previously completed
  GIVEN a user has 2+ completed items
  WHEN the daily challenge is generated
  THEN both review items are ones the user HAS previously completed
  MEASUREMENT: All reviewItemIds IN completedItems array

AC-DAILY-04: Review items prioritise oldest completions
  GIVEN a user has 10+ completed items
  WHEN review items are selected
  THEN the 2 items with the oldest completedAt timestamps are chosen
  MEASUREMENT: reviewItemIds correspond to the 2 smallest completedAt values

AC-DAILY-05: New user sees only featured card
  GIVEN a brand new user with 0 completed items
  WHEN home screen loads
  THEN only 1 featured card is shown, no review cards
  MEASUREMENT: Featured card visible. Review card section absent or empty.

AC-DAILY-06: Daily challenge is consistent within a day
  GIVEN a user views the home screen at 9am
  WHEN they return at 3pm on the same day
  THEN the same featured item and review items are shown
  MEASUREMENT: featuredItemId and reviewItemIds match between page loads on same date

AC-DAILY-07: Daily challenge resets at midnight
  GIVEN the device date changes to a new day
  WHEN the user loads the home screen
  THEN a new daily challenge is generated with a different featured item
  MEASUREMENT: New date produces different featuredItemId (with high probability)

AC-DAILY-08: Partial progress persists within a day
  GIVEN a user completes 1 of 3 daily cards
  WHEN they leave and return to the home screen (same day)
  THEN the completed card shows a checkmark, remaining cards are still active
  MEASUREMENT: completedCards array persists in sessionStorage, checkmark visible on completed card

AC-DAILY-09: All cards complete triggers daily stamp
  GIVEN user has completed 2 of 3 daily cards
  WHEN they complete the third
  THEN daily stamp celebration plays, today's date added to dailyStamps
  MEASUREMENT: Stamp celebration overlay appears. dailyStamps includes today's date.

AC-DAILY-10: Re-discovery mode activates when catalogue exhausted
  GIVEN all catalogue items are completed
  WHEN home screen loads
  THEN "Re-Discovery Mode" banner is shown, featured item is a random completed item
  MEASUREMENT: Banner element visible with "Re-Discovery" text. featuredItemId IN completedItems.

AC-DAILY-11: Difficulty progression
  GIVEN a user has fewer than 10 completed items
  WHEN the featured item is selected
  THEN it is an item with difficulty "easy"
  MEASUREMENT: catalogue[featuredItemId].difficulty === "easy"

AC-DAILY-12: Featured item not repeated within 7 days
  GIVEN a user has played for 7 consecutive days
  WHEN daily challenges are generated
  THEN no featured item ID appears twice in the 7-day window
  MEASUREMENT: Last 7 featuredItemIds contain no duplicates (assumes catalogue > 7 uncompleted items)
```

---

## Error States

```
Error: Date/time manipulation
  Trigger: User changes device date forward to get new daily challenges
  User sees: New daily challenge for the spoofed date
  Recovery path: Accept it — this is a kids' learning app, not a competitive game. If they want to learn more, let them. Streak tracking uses stored dates, so rapid date changes will create gaps.
  Data preservation: Normal. No prevention needed.

Error: Midnight transition while app is open
  Trigger: Kid is using the app at 11:59pm and it rolls to midnight
  User sees: Current card/quiz continues normally. Home screen refreshes with new daily challenge on next navigation to home.
  Recovery path: Automatic — no mid-interaction disruption.
  Data preservation: In-progress quiz continues. Completion counts for the day it was started.
```

---

## Edge Cases

```
Edge case: User with exactly 1 completed item
  Scenario: Second visit, 1 prior completion
  Expected behavior: Featured card (new item) + 1 review card. Third slot is empty or absent. Daily stamp requires completing both available cards (not 3).
  Why it matters: The daily challenge should always feel completable. Requiring 3 when only 2 exist would be frustrating.

Edge case: Very large catalogue (future expansion to 200+ items)
  Scenario: Catalogue grows beyond 80 items
  Expected behavior: Daily selection algorithm still works. Review selection still picks oldest. No performance issues with array operations.
  Why it matters: The data model should not assume a fixed catalogue size.

Edge case: Two devices, same account, different timezones
  Scenario: iPad at home (GMT), phone travelling (GMT+5)
  Expected behavior: Each device generates its daily challenge based on its own local date. Progress syncs — if the featured item was completed on one device, the other shows it completed. The daily stamp tracks device-local dates.
  Why it matters: Account sync must handle timezone-divergent daily challenges gracefully.
```
