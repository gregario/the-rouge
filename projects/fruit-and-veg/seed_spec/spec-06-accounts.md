# SPEC: Accounts & Progress Sync

## Overview
Optional lightweight account system. Progress saves locally from the start (zero friction). Parent can optionally create an account to enable cross-device sync. The child never interacts with account creation — it's a parent-only flow accessible from a settings area.

---

## Data Model

### Entity: Account
```
Fields:
  - id: string — UUID, generated server-side
  - parentEmail: string — parent's email address, used for auth
  - displayName: string — child's first name or nickname (entered by parent, shown in app as "Hi, [name]!")
  - createdAt: string — ISO datetime
  - lastSyncAt: string — ISO datetime of last successful sync

Constraints:
  - parentEmail must be unique (one account per email)
  - parentEmail must be verified via email link before sync activates
  - displayName max 30 characters, alphanumeric + spaces only
  - No child PII collected — no child email, no age, no surname
```

### Entity: SyncedProgress
```
Fields:
  - accountId: string — FK to Account
  - completedItems: string[] — array of completed catalogue item IDs
  - completedAt: Record<string, string> — item ID → ISO datetime
  - categoryBadges: string[] — earned badge IDs
  - currentStreak: number
  - longestStreak: number
  - lastPlayedDate: string — ISO date
  - dailyStamps: string[] — ISO dates
  - totalQuizCorrect: number
  - totalQuizAnswered: number
  - updatedAt: string — ISO datetime of last change

Constraints:
  - One SyncedProgress per Account
  - Server is source of truth when conflicts arise (last-write-wins with timestamp)
  - All fields mirror the local UserProgress entity
```

### Sync Strategy
```
1. Local-first: All progress is always saved to localStorage immediately.
2. Background sync: If account exists and is verified, sync to backend after every meaningful state change (card completion, daily stamp).
3. Conflict resolution: Last-write-wins using updatedAt timestamp. On login from a new device, server data overwrites local (with confirmation prompt if local has progress).
4. Offline resilience: App works fully offline. Sync queues changes and pushes when back online.
5. Sync payload: Full UserProgress object (not incremental diffs). The dataset is small (<10KB) — no need for delta sync.
```

---

## User Journeys

### Journey: Parent Creates Account
```
Entry point: Settings icon (small, top-right corner of any screen — unobtrusive)
Goal: Create an account to save child's progress
Preconditions: No account exists. Child has some progress worth saving.

Step 1: Parent taps settings icon (small gear, top-right)
  → System: Settings panel slides in
  → Screen: Simple settings area. "Save Progress" section prominently displayed with text: "Create an account to save [child]'s stickers and progress across devices." Email input field. "I am the parent/guardian" checkbox.
  → Click count: 1

Step 2: Parent enters email and checks the guardian checkbox
  → System: Validates email format. Checkbox must be checked.
  → Screen: Email field, checked checkbox, "Create Account" button activates
  → Click count: 2 (type + check)

Step 3: Parent taps "Create Account"
  → System: Sends verification email. Creates unverified account record server-side. Shows pending state.
  → Screen: "Check your email! We've sent a verification link to [email]. Your progress will start syncing once verified." A "Resend" link appears after 30 seconds.
  → Click count: 3

Step 4: Parent clicks verification link in email
  → System: Account marked as verified. First sync triggered — local progress pushed to server.
  → Screen (in app, on next load or via polling): "Account verified! Progress is now being saved." Green checkmark. Settings shows "Signed in as [email]".

Total clicks: 3 ✓
```

### Journey: Sign In on New Device
```
Entry point: Settings icon on a device with no account
Goal: Load existing progress on a new device
Preconditions: Account exists and is verified

Step 1: Parent taps settings icon
  → Screen: Same settings panel. "Already have an account? Sign in" link.
  → Click count: 1

Step 2: Parent taps "Sign in" and enters email
  → System: Sends a magic link (passwordless auth — no passwords for simplicity and security)
  → Screen: "Check your email for a sign-in link!"
  → Click count: 2

Step 3: Parent clicks magic link in email
  → System: Auth token set. Server progress loaded.
  → Screen: Prompt if local device has existing progress: "This device has some progress already. Keep device progress or load your saved progress?" Options: "Load saved" / "Keep this device's" / "Merge (keep highest)"
  → Click count: 3

Total clicks: 3 ✓
```

### Journey: Delete Account
```
Entry point: Settings panel (signed in)
Goal: Remove account and all server-side data
Preconditions: Account exists

Step 1: Parent taps settings icon
  → Screen: Settings with "Signed in as [email]". "Delete Account" link at bottom in subdued text.
  → Click count: 1

Step 2: Parent taps "Delete Account"
  → System: Confirmation dialog
  → Screen: "Are you sure? This will delete your account and all saved progress from our servers. Progress on this device will be kept locally. This cannot be undone."
  → Click count: 2

Step 3: Parent taps "Yes, delete"
  → System: Server-side: hard delete Account and SyncedProgress. Client-side: remove auth token, keep local progress.
  → Screen: "Account deleted. Your progress on this device is still saved locally."
  → Click count: 3

Total clicks: 3 ✓
```

### Journey: Sad Path — Sync Fails
```
Entry point: Any card completion while signed in
Preconditions: Account exists, network unavailable

Step 1: Kid completes a card
  → System: Saves to localStorage (succeeds). Attempts background sync (fails).
  → Screen: No error shown to child. Small subtle sync icon in settings area shows "offline" state (cloud with X).
  → Recovery: Sync retries on next state change or when network is detected. Queued changes persist in localStorage.
  → Data preservation: All progress preserved locally. Syncs automatically when connection restores.
```

---

## Interaction Patterns

### Element: Settings Icon
```
Type: button (icon only)
States:
  - Default: Small gear icon, muted colour. Top-right corner. 32x32px icon within 44x44px tap target.
  - No account: Gear icon only, no indicator
  - Account active + synced: Gear icon with tiny green dot
  - Account active + sync pending: Gear icon with tiny amber dot
  - Hover: Slightly brighter
Click/Tap: Opens settings panel
```

### Element: Settings Panel
```
Type: slide-in panel (from right)
States:
  - No account: Shows "Save Progress" prompt with email input
  - Pending verification: Shows verification pending message with resend link
  - Signed in: Shows email, last sync time, sign out, delete account
  - Syncing: Subtle spinner next to last sync time
Dismiss: Tap outside panel, swipe right, or tap X button
```

### Element: Email Input
```
Type: text input
States:
  - Default: Placeholder "parent@example.com", standard border
  - Focus: Border highlights, placeholder clears
  - Valid: Green border after valid email format detected
  - Invalid: Red border + "Please enter a valid email" on blur
  - Disabled: During account creation API call
Keyboard: type="email" for mobile keyboard optimisation
```

### Element: Guardian Checkbox
```
Type: checkbox
States:
  - Unchecked: Empty box + label "I am the parent or guardian"
  - Checked: Filled box with checkmark
  - Required indicator: If user tries to submit without checking, border flashes red + "Please confirm you are a parent or guardian"
```

---

## Acceptance Criteria

```
AC-ACCT-01: Settings accessible from any screen
  GIVEN the user is on Home, Collection, or Garden
  WHEN they tap the settings icon
  THEN the settings panel opens
  MEASUREMENT: Settings panel element becomes visible with correct content

AC-ACCT-02: Account creation requires email and guardian checkbox
  GIVEN the settings panel is open (no account)
  WHEN email is entered but checkbox is unchecked
  THEN "Create Account" button remains disabled
  MEASUREMENT: Button has disabled attribute when checkbox unchecked

AC-ACCT-03: Verification email sent on account creation
  GIVEN valid email and checked guardian checkbox
  WHEN user taps "Create Account"
  THEN API call succeeds, verification pending state shown, email sent
  MEASUREMENT: API returns 201. UI shows verification pending message.

AC-ACCT-04: Account activates after email verification
  GIVEN account is in pending verification state
  WHEN parent clicks the verification link
  THEN account status changes to verified, first sync occurs
  MEASUREMENT: Account record has verified=true. SyncedProgress created with current local data.

AC-ACCT-05: Progress syncs after card completion
  GIVEN a verified account exists
  WHEN the user completes a card
  THEN progress is saved locally AND synced to backend
  MEASUREMENT: localStorage updated. API POST to sync endpoint returns 200 with matching data.

AC-ACCT-06: Sign-in on new device loads progress
  GIVEN a verified account with 10 completed items
  WHEN parent signs in on a new device
  THEN server progress is loaded and collection shows 10 completed items
  MEASUREMENT: completedItems.length === 10 after sign-in. Collection grid shows 10 coloured items.

AC-ACCT-07: Conflict resolution prompts user
  GIVEN a new device has local progress AND server has different progress
  WHEN parent signs in
  THEN a prompt asks "Load saved / Keep device / Merge"
  MEASUREMENT: Conflict resolution dialog appears with three options

AC-ACCT-08: Account deletion removes all server data
  GIVEN a verified account
  WHEN parent confirms account deletion
  THEN Account and SyncedProgress are hard-deleted from server. Local progress preserved.
  MEASUREMENT: API DELETE returns 200. Subsequent GET for account returns 404. localStorage still contains progress.

AC-ACCT-09: Offline mode works without disruption
  GIVEN a verified account and no network connection
  WHEN kid completes cards
  THEN progress saves locally, no error shown to child, sync indicator shows offline
  MEASUREMENT: localStorage updates succeed. No error toast/modal visible. Sync icon shows offline state.

AC-ACCT-10: Resend verification available
  GIVEN account is pending verification
  WHEN 30 seconds have passed since creation
  THEN a "Resend verification email" link appears
  MEASUREMENT: Resend link element becomes visible after 30s delay

AC-ACCT-11: Magic link sign-in (passwordless)
  GIVEN a verified account exists
  WHEN parent enters email and taps "Sign in"
  THEN a magic link email is sent (no password field)
  MEASUREMENT: No password input exists. API sends email. Sign-in completes via link.

AC-ACCT-12: No child-facing account UI
  GIVEN any app state
  WHEN the child interacts with Home, Collection, Garden, or Card views
  THEN no account-related UI (email, sign-in, settings prompts) appears in the main content area
  MEASUREMENT: No account-related elements in main content DOM. Settings icon is unobtrusive (32px, corner).

AC-ACCT-13: Display name shown in app
  GIVEN an account with displayName "Lily"
  WHEN the app loads
  THEN the home screen shows "Hi, Lily!" greeting
  MEASUREMENT: Greeting element contains the displayName text

AC-ACCT-14: Email validation
  GIVEN the email input field
  WHEN an invalid email is entered and focus leaves
  THEN an error message "Please enter a valid email" appears
  MEASUREMENT: Error element visible. Email input has error styling (red border).
```

---

## Security Considerations

```
Concern: Magic link token security
  Risk: Token in email link could be intercepted or reused
  Mitigation: Tokens expire after 15 minutes. Single-use — invalidated after first click. Transmitted over HTTPS only.
  Validation: Attempt to use expired/used token returns 401.

Concern: Account enumeration
  Risk: Attacker could test if an email has an account by observing different responses
  Mitigation: Same response for "account exists, email sent" and "no account found" — "If an account exists, we've sent a link." Rate limit: max 3 sign-in attempts per email per hour.
  Validation: Response is identical for existing and non-existing emails.

Concern: COPPA-compliant data handling
  Risk: Storing parent email for a children's product has regulatory requirements
  Mitigation: Only parent email is collected. No child PII. Privacy policy is clear. Deletion is complete (hard delete). See legal-privacy-review.md.
  Validation: Account deletion cascade verified — no orphaned records.

Concern: Session token storage
  Risk: Token stored in localStorage is accessible to XSS
  Mitigation: Use httpOnly cookie for auth token (not localStorage). Short session lifetime (7 days). Refresh via re-authentication only.
  Validation: No auth tokens visible in localStorage or sessionStorage.

Concern: Data isolation
  Risk: User A accessing User B's progress via API
  Mitigation: All API endpoints validate account ownership via session token. No endpoints accept arbitrary account IDs.
  Validation: API calls with mismatched tokens return 403.
```

---

## API Surface

```
POST /api/accounts
  Body: { email, displayName, guardianConfirmed: true }
  Response: 201 { accountId, status: "pending_verification" }

POST /api/accounts/verify
  Body: { token }
  Response: 200 { accountId, status: "verified", sessionToken (httpOnly cookie) }

POST /api/accounts/sign-in
  Body: { email }
  Response: 200 { message: "If an account exists, we've sent a sign-in link." }

POST /api/accounts/sign-in/verify
  Body: { token }
  Response: 200 { accountId, sessionToken (httpOnly cookie) }

GET /api/progress
  Auth: session cookie
  Response: 200 { ...SyncedProgress }

PUT /api/progress
  Auth: session cookie
  Body: { ...UserProgress }
  Response: 200 { ...SyncedProgress, updatedAt }

DELETE /api/accounts
  Auth: session cookie
  Response: 200 { deleted: true }
```

---

## Edge Cases

```
Edge case: Parent creates account before child has any progress
  Scenario: Parent sets up account on first visit, before any cards completed
  Expected behavior: Account is created. Synced progress is empty. As child plays, progress syncs normally.
  Why it matters: Some parents will want to set up account proactively.

Edge case: Multiple children sharing a device
  Scenario: Two siblings use the same tablet
  Expected behavior: v1 supports one profile per browser. Separate browsers or private/incognito for second child. Future: profile switching.
  Why it matters: Common household scenario. v1 limitation is acceptable — note for v2.

Edge case: Parent enters child's email instead of their own
  Scenario: Parent types kid@school.edu
  Expected behavior: We cannot detect this. The guardian checkbox attestation covers our COPPA obligation. The verification email will go to whatever address is provided.
  Why it matters: We rely on parent attestation, not email domain detection.

Edge case: Account exists but verification link expired
  Scenario: Parent creates account but clicks verification link after 24 hours
  Expected behavior: Link shows "This link has expired." with a "Resend verification" button.
  Why it matters: Parents are busy. Expired links should be easy to recover from.
```
