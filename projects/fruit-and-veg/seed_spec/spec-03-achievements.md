# SPEC: Achievements & Collection (The Sticker Book)

## Overview
The collection and achievement system that drives retention. Three layers: sticker collection (progress), category badges (milestones), and streak tracking (daily habit). All state stored locally and synced to backend if account exists.

---

## Data Model

### Entity: UserProgress
```
Fields:
  - completedItems: string[] — array of catalogue item IDs that have been completed
  - completedAt: Record<string, string> — map of item ID → ISO datetime of first completion
  - categoryBadges: string[] — array of earned category badge IDs (e.g., "badge-tropical", "badge-root")
  - currentStreak: number — consecutive days played (resets on miss)
  - longestStreak: number — all-time longest streak
  - lastPlayedDate: string — ISO date (YYYY-MM-DD) of last daily challenge completion
  - dailyStamps: string[] — array of ISO dates where all 3 daily cards were completed
  - totalQuizCorrect: number — lifetime correct answers
  - totalQuizAnswered: number — lifetime total answers

Constraints:
  - completedItems contains no duplicates
  - currentStreak >= 0
  - longestStreak >= currentStreak
  - lastPlayedDate is a valid ISO date or null (never played)
```

### Entity: CategoryBadge
```
Fields:
  - id: string — e.g., "badge-tropical", "badge-berry"
  - name: string — display name (e.g., "Tropical Explorer")
  - description: string — kid-friendly description (e.g., "You learned ALL the tropical fruits!")
  - category: string — matches CatalogueItem.subcategory
  - requiredItemIds: string[] — all item IDs in this category
  - icon: string — path to badge image

Constraints:
  - Badge is earned when ALL requiredItemIds are in user's completedItems
  - Badge earning is checked after every item completion
  - Once earned, a badge is never revoked (even if catalogue changes)
```

---

## User Journeys

### Journey: View Collection
```
Entry point: Bottom nav — "My Collection" icon
Goal: See all items, browse progress, find items to learn
Preconditions: None (works with zero progress)

Step 1: Kid taps Collection icon in bottom nav
  → System: Loads collection grid view
  → Screen: Grid of all items. Completed items show colourful sticker images. Uncompleted items show grey silhouettes. Category tabs along the top. Count display: "12 / 75 collected"
  → Click count: 1

Step 2: Kid taps a category tab (e.g., "Tropical")
  → System: Filters grid to show only items in that category
  → Screen: Filtered grid. Category completion shown: "3 / 8 tropical fruits". If badge earned, badge icon displayed.
  → Click count: 2

Step 3: Kid taps an item (completed or silhouette)
  → System: Opens the card experience for that item
  → Screen: Card front view (image + name). If uncompleted, full discovery journey begins. If completed, re-visit journey.
  → Click count: 3

Total clicks: 3 ✓
```

### Journey: Earn a Category Badge
```
Entry point: Completing the last item in a category (during quiz)
Goal: Automatic — badge awarded on completion
Preconditions: All other items in the category already completed

Step 1: Kid completes quiz for the last item in a category
  → System: Normal sticker celebration plays first. Then badge unlock is detected.
  → Screen: Sticker celebration overlay (standard)

Step 2: After sticker celebration dismisses (auto or tap)
  → System: Badge celebration overlay appears — bigger and more special than a sticker
  → Screen: Full-screen badge reveal. Badge icon zooms in with golden glow effect. Text: "Amazing! You earned the [Category] Explorer badge!" Confetti is more intense. "See my garden" button appears.
  → Click count: N/A — automatic after sticker celebration

Total clicks: 0 additional (triggered by existing quiz completion flow)
```

### Journey: View Streak / Garden
```
Entry point: Bottom nav — "My Garden" icon
Goal: See achievements, streak, badges
Preconditions: None (works with zero progress)

Step 1: Kid taps Garden icon in bottom nav
  → System: Loads garden/achievements view
  → Screen: Three sections vertically:
    1. Streak display — current streak number with flame/flower icon, "X days in a row!" text, longest streak shown smaller below
    2. Badges — grid of category badges (earned = full colour, unearned = grey outline with "?" icon). Tap for details.
    3. Stats — simple counts: "You've learned X fruits and veggies!" "You've answered Y questions!"
  → Click count: 1

Step 2: Kid taps an earned badge
  → System: Badge detail overlay shows
  → Screen: Badge icon large, name, description, list of items in the category (all checkmarked)
  → Click count: 2

Total clicks: 2 ✓
```

### Journey: Sad Path — Zero Progress (First Visit)
```
Entry point: Collection or Garden view, brand new user
Preconditions: No items completed, no account

Collection view:
  → Screen: All items shown as grey silhouettes. Counter shows "0 / 75 collected". A friendly prompt at top: "Tap any fruit to start learning!" with an arrow pointing to the first silhouette.

Garden view:
  → Screen: Streak shows "0 days". Badges section shows all badges as grey with "?" icons. Stats show "Start your first card to begin!" A prominent button: "Go to today's fruit!" links to home.
```

---

## Interaction Patterns

### Element: Collection Grid Item (Completed)
```
Type: card (tappable)
States:
  - Default: Colourful sticker image (item photo in sticker frame), item name below in small text
  - Hover: Scale 1.05, subtle glow/shadow
  - Active/Pressed: Scale 0.95
Click/Tap: Opens card view for re-visit
Keyboard: Tab-focusable, Enter/Space opens card
```

### Element: Collection Grid Item (Uncompleted)
```
Type: card (tappable)
States:
  - Default: Grey silhouette shape (recognisable outline of the fruit/veg), "?" in center
  - Hover: Silhouette lightens slightly, "?" pulses gently
  - Active/Pressed: Scale 0.95
Click/Tap: Opens card view for discovery
Keyboard: Tab-focusable, Enter/Space opens card
```

### Element: Category Tab
```
Type: tab button
States:
  - Default: Category name, pill-shaped, muted colour
  - Active: Bold text, bright colour fill, underline
  - Hover: Background tint
  - Badge indicator: If category badge earned, small star/badge icon on the tab
Click/Tap: Filters collection grid to this category
Keyboard: Arrow keys move between tabs, Enter selects
```

### Element: Streak Display
```
Type: static display (not tappable)
States:
  - Zero streak: Grey text, sad flower/seedling icon. "Start a streak today!"
  - Active streak (1-6): Growing flower icon (taller with each day). "X days in a row!"
  - Week streak (7+): Full bloom flower with sparkles. "Amazing — X days!"
  - Streak broken today: Gentle message — "Welcome back! Start a new streak today!" (NOT "You lost your streak")
Display: Large number, flame/flower icon, supportive text. Longest streak shown smaller below.
```

---

## Acceptance Criteria

```
AC-ACH-01: Collection grid shows all catalogue items
  GIVEN the collection view is open
  WHEN all items are rendered
  THEN the grid contains exactly the same count as the catalogue, each with correct name
  MEASUREMENT: Grid item count === catalogue item count. Each grid item text matches a catalogue name.

AC-ACH-02: Completed items show colour, uncompleted show grey
  GIVEN a user has completed 5 items
  WHEN they view the collection
  THEN 5 items are rendered with colourful images, remaining items are grey silhouettes
  MEASUREMENT: Count elements with "completed" class === 5. Count elements with "silhouette" class === total - 5.

AC-ACH-03: Category filtering works
  GIVEN the collection view is open
  WHEN the user taps a category tab
  THEN only items in that category are shown, count updates to "X / Y [category]"
  MEASUREMENT: Visible grid items all have matching category. Counter text matches filtered count.

AC-ACH-04: Progress counter is accurate
  GIVEN a user has completed N items
  WHEN collection view is open
  THEN counter shows "N / [total] collected"
  MEASUREMENT: Counter text matches completedItems.length / catalogue.length

AC-ACH-05: Category badge earned on full completion
  GIVEN a user has completed all items in a category except one
  WHEN they complete the last item
  THEN a badge celebration overlay appears with the category badge name and icon
  MEASUREMENT: Badge overlay visible. Badge ID added to categoryBadges array.

AC-ACH-06: Streak increments on daily play
  GIVEN a user played yesterday (lastPlayedDate === yesterday)
  WHEN they complete today's daily challenge
  THEN currentStreak increments by 1, lastPlayedDate updates to today
  MEASUREMENT: currentStreak === previousStreak + 1. lastPlayedDate === today.

AC-ACH-07: Streak resets after missed day
  GIVEN a user's lastPlayedDate is 2+ days ago
  WHEN they complete today's daily challenge
  THEN currentStreak resets to 1 (not 0 — they played today), lastPlayedDate updates
  MEASUREMENT: currentStreak === 1. longestStreak unchanged (or updated if previous was higher).

AC-ACH-08: Longest streak tracks all-time best
  GIVEN currentStreak exceeds longestStreak
  WHEN streak is updated
  THEN longestStreak updates to match currentStreak
  MEASUREMENT: longestStreak >= currentStreak always. longestStreak === max(historical streaks).

AC-ACH-09: Zero state shows encouraging prompts
  GIVEN a brand new user with no progress
  WHEN they view collection or garden
  THEN helpful prompts appear directing them to start ("Tap any fruit to start learning!")
  MEASUREMENT: Empty state prompt elements are visible. No "0" counters without context.

AC-ACH-10: Sticker book tapping opens cards
  GIVEN the collection view is displayed
  WHEN user taps any item (completed or silhouette)
  THEN the card experience opens for that item
  MEASUREMENT: Card view renders with correct item data after tap

AC-ACH-11: Badge detail shows constituent items
  GIVEN a user has earned a category badge
  WHEN they tap the badge in the garden view
  THEN a detail overlay shows all items in that category with checkmarks
  MEASUREMENT: Overlay lists all requiredItemIds with completed indicators

AC-ACH-12: Daily stamp earned on completing all 3 daily cards
  GIVEN today's daily challenge has 3 cards
  WHEN user completes all 3
  THEN today's date is added to dailyStamps, and stamp visual appears
  MEASUREMENT: dailyStamps array includes today's ISO date
```

---

## Error States

```
Error: Progress data corruption
  Trigger: localStorage contains malformed JSON for user progress
  User sees: Nothing — app initialises with empty progress state
  Recovery path: Automatic — fresh start. If account exists, progress reloads from backend on next sync.
  Data preservation: Corrupted local data is discarded. Backend data (if any) is source of truth.

Error: Badge calculation mismatch
  Trigger: Catalogue is updated (items added/removed) and badge requirements change
  User sees: Nothing — badges already earned are never revoked
  Recovery path: New items appear in collection as uncompleted. Badge requirements recalculated against current catalogue.
  Data preservation: Earned badges persist. CompletedItems persist. Only new items are affected.
```

---

## Edge Cases

```
Edge case: Exactly one item completed
  Scenario: Kid completes their first-ever item
  Expected behavior: Collection shows 1 colourful sticker among all grey silhouettes. Counter: "1 / 75 collected". First-sticker celebration should feel extra special.
  Why it matters: The "one sticker among many empty slots" moment is the primary motivation hook — it must look right.

Edge case: All items completed
  Scenario: Kid completes every single item in the catalogue
  Expected behavior: Collection is fully colourful. Special "Complete Collection!" celebration. Counter: "75 / 75 collected — Amazing!" Garden shows all badges earned.
  Why it matters: Completion should feel like a major achievement, not just another sticker.

Edge case: Streak across timezone changes
  Scenario: Family travels, device timezone changes
  Expected behavior: Streak is calculated using the device's local date. A timezone change mid-day does not break the streak (we check "did they play on a date that is consecutive to lastPlayedDate in local time").
  Why it matters: A lost streak due to timezone change would frustrate both kid and parent.

Edge case: Multiple completions in one day
  Scenario: Kid completes 10 items in one sitting
  Expected behavior: All stickers earned. Streak only increments once (per day, not per item). Daily stamp requires the 3 daily challenge cards specifically, not just any 3 cards.
  Why it matters: Binge sessions shouldn't inflate streaks or bypass the daily challenge mechanic.
```
