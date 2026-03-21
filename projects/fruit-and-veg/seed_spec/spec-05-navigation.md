# SPEC: Navigation & Structure

## Overview
Three-screen app with bottom tab navigation. Dead simple — a 5-year-old navigates with zero help. Home (daily challenge), Collection (sticker book), Garden (achievements).

---

## Screen Map

```
┌─────────────────────────────┐
│         APP SHELL           │
│  ┌───────────────────────┐  │
│  │                       │  │
│  │     CONTENT AREA      │  │
│  │   (Home / Collection  │  │
│  │    / Garden / Card)   │  │
│  │                       │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │  🏠    📚    🌱       │  │
│  │ Home  Book  Garden    │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Screen: Home (`/`)
- Default landing page on every visit
- Daily challenge: Fruit of the Day + review cards
- See spec-04-daily-challenge.md for full details

### Screen: Collection (`/collection`)
- Sticker book grid with category tabs
- See spec-03-achievements.md for full details

### Screen: Garden (`/garden`)
- Streak display, category badges, stats
- See spec-03-achievements.md for full details

### Screen: Card View (`/card/:itemId`)
- Full-screen card experience (discovery or re-visit)
- See spec-02-card-experience.md for full details
- Accessed FROM Home or Collection, returns TO the originating screen

---

## Data Model

### Entity: NavigationState
```
Fields:
  - activeTab: enum ["home", "collection", "garden"] — currently selected tab
  - previousTab: enum ["home", "collection", "garden"] — tab to return to from card view
  - cardReturnTarget: enum ["home", "collection"] — where to go when card view is dismissed

Constraints:
  - activeTab defaults to "home" on app load
  - Card view is NOT a tab — it's an overlay/route that sits above the tab structure
  - Browser back from card view returns to the originating tab
```

---

## User Journeys

### Journey: Tab Navigation
```
Entry point: Any screen
Goal: Switch between Home, Collection, and Garden
Preconditions: None

Step 1: Kid taps a tab icon in bottom nav
  → System: Content area transitions to selected screen (instant swap, no loading)
  → Screen: Selected tab highlights (bold, colour fill). Content updates immediately.
  → Click count: 1

Total clicks: 1 ✓
```

### Journey: Card View → Return
```
Entry point: Card view (opened from Home or Collection)
Goal: Return to previous screen after viewing/completing a card
Preconditions: User is in card view

Step 1: Kid completes card (sticker celebration) and taps "Next card" or "See collection"
  → System: Returns to originating screen (Home or Collection)
  → Screen: Previous screen with updated state (completion reflected)
  → Click count: 1

OR

Step 1: Kid taps browser back button
  → System: Card view dismisses, returns to originating screen
  → Screen: Previous screen (Home or Collection)
  → Click count: 1

OR

Step 1: Kid taps a bottom nav tab while in card view
  → System: Card view dismisses, navigates to selected tab
  → Screen: Selected tab's screen
  → Click count: 1

Total clicks: 1 ✓
```

---

## Interaction Patterns

### Element: Bottom Tab Bar
```
Type: navigation bar (fixed bottom)
States:
  - Default: Three icons with labels. Unselected tabs: muted colour. Selected tab: bright colour, bold label, slight scale-up.
  - Active/Pressed: Tab icon bounces slightly on tap.
Position: Fixed to bottom of viewport. Always visible EXCEPT during card view (card view is full-screen).
Height: 64px minimum (accommodate small fingers)
Background: White/light with subtle top border
```

### Element: Tab Icon
```
Type: navigation item
States:
  - Unselected: Grey/muted icon + label
  - Selected: Bright coloured icon + bold label + subtle background highlight
  - Notification dot: Not used in v1 (no notifications)
Size: Icon 28px, label 12px. Total tap target: 64x64px minimum.
Click/Tap: Switches to that tab's content
Keyboard: Tab key cycles through tabs. Enter/Space activates.
```

### Transitions
```
Tab switch: Instant content swap (no animation — speed over polish for primary navigation)
Card view open: Card scales up from tapped position (origin-aware animation, 300ms)
Card view close: Card scales down to original position or fades out (300ms)
Celebration overlays: Fade in (200ms), content animates within
```

---

## Acceptance Criteria

```
AC-NAV-01: App defaults to Home tab
  GIVEN a user opens the app (fresh or returning)
  WHEN the app loads
  THEN the Home tab is selected and daily challenge is displayed
  MEASUREMENT: Home tab has "active" class. Home content is visible.

AC-NAV-02: Tab switching is instant
  GIVEN the user is on any tab
  WHEN they tap another tab
  THEN content switches in under 100ms with no loading state
  MEASUREMENT: New tab content visible within 100ms of tap (performance measurement)

AC-NAV-03: Bottom nav is always visible on main screens
  GIVEN the user is on Home, Collection, or Garden
  WHEN they scroll the content
  THEN the bottom nav bar remains fixed and visible
  MEASUREMENT: Nav bar element has position:fixed and is within viewport bounds

AC-NAV-04: Bottom nav hides during card view
  GIVEN the user opens a card from any screen
  WHEN card view is displayed
  THEN the bottom nav bar is not visible (card is full-screen)
  MEASUREMENT: Nav bar element is hidden or off-screen during card view

AC-NAV-05: Browser back works from card view
  GIVEN the user is in card view
  WHEN they press browser back
  THEN card view closes and they return to the screen they came from
  MEASUREMENT: History state pops correctly. Previous tab content is visible.

AC-NAV-06: Swipe down dismisses card view
  GIVEN the user is in card view (full-screen, nav hidden per AC-NAV-04)
  WHEN the user swipes down or taps the close button
  THEN card view closes and they return to the screen they came from
  MEASUREMENT: Card view dismissed. Previous tab content and bottom nav are visible.

AC-NAV-07: Selected tab is visually distinct
  GIVEN the user is on a specific tab
  WHEN they look at the bottom nav
  THEN the active tab is visually differentiated (colour, weight, size)
  MEASUREMENT: Active tab element has distinct CSS class with different colour/font-weight

AC-NAV-08: All tap targets are minimum 44x44px
  GIVEN the bottom nav bar
  WHEN tab dimensions are measured
  THEN each tab's tappable area is at least 44x44px
  MEASUREMENT: Computed element dimensions >= 44x44

AC-NAV-09: URL routing matches screen state
  GIVEN the user navigates to /collection directly
  WHEN the app loads
  THEN the Collection tab is selected and collection content is displayed
  MEASUREMENT: URL path matches screen. Deep links work for /, /collection, /garden, /card/:id

AC-NAV-10: Card view preserves return context
  GIVEN a user opens a card from Collection
  WHEN they complete the card and tap "back" or complete
  THEN they return to Collection (not Home), with their scroll position preserved
  MEASUREMENT: Active tab after card dismissal matches origin tab. Scroll position restored.
```

---

## Edge Cases

```
Edge case: Deep link to card
  Scenario: User opens /card/banana directly (shared link)
  Expected behavior: Card view opens. Bottom nav hidden. Back button/close returns to Home (default tab since no origin context).
  Why it matters: Shared links should work, even without navigation context.

Edge case: Very small screen (320px width)
  Scenario: Three tabs on a 320px screen
  Expected behavior: Tabs compress. Icons may shrink slightly. Labels remain visible. Tap targets remain >= 44px.
  Why it matters: Older devices should still be navigable.

Edge case: Keyboard-only navigation
  Scenario: Child or parent using keyboard (accessibility)
  Expected behavior: Tab key moves through bottom nav tabs. Enter activates. All content within each screen is also keyboard-navigable.
  Why it matters: Accessibility requirement and good practice.
```
