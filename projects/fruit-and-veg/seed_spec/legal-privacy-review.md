# LEGAL/PRIVACY Review — Fruit & Veg

## Summary

Low-risk profile. No social features, no ads, no child-directed data collection. The parent creates the account — the child never provides personal information. Key compliance areas are COPPA (US), UK Age Appropriate Design Code, and GDPR Article 8 (EU).

## COPPA (US — Children's Online Privacy Protection Act)

### Applicability
COPPA applies to websites/apps directed at children under 13 that collect personal information. Fruit & Veg is directed at children aged 5-8.

### Our Approach: Parent-Mediated Account Creation
- The CHILD never provides personal information — no name, no email, no age input
- The PARENT provides their own email to enable progress sync
- Learning progress (cards completed, quiz results, achievements) is not personally identifiable on its own
- No photos, no chat, no user-generated content, no location data

### Requirements
1. **Privacy policy** — Must be clear, prominent, and written in plain language. Must describe:
   - What information is collected (parent email, learning progress)
   - How it is used (account authentication, progress sync)
   - Whether it is shared with third parties (no)
   - How to request deletion
2. **Verifiable parental consent** — Since the parent is the one providing their email, the "consent" is implicit in the account creation flow. However, we should include:
   - Clear statement that this is a children's educational site
   - Confirmation checkbox that the account creator is a parent/guardian
   - Email verification (parent must click a link to activate)
3. **Data minimisation** — Collect only what's needed:
   - Parent email (for auth)
   - Learning progress (for sync)
   - Nothing else. No analytics, no tracking, no cookies beyond session.
4. **Deletion rights** — Parent must be able to delete the account and all associated data

### Practical Implementation
- Privacy policy page (linked from account creation and footer)
- "I am the parent/guardian" checkbox on account creation
- Email verification flow
- Account deletion option in settings
- No third-party analytics or tracking SDKs

## UK Age Appropriate Design Code (Children's Code)

### Applicability
Applies to "information society services" likely to be accessed by children in the UK. This product is specifically for children, so it applies.

### Key Requirements We Must Meet
1. **Best interests of the child** — Design decisions prioritise the child's wellbeing ✓ (educational, no manipulative patterns)
2. **Data minimisation** — Don't collect more than needed ✓ (only parent email + progress)
3. **No detrimental use** — Data not used in ways detrimental to child ✓ (no profiling, no targeted content)
4. **High privacy by default** — Privacy settings default to maximum ✓ (no sharing, no social)
5. **No nudge techniques** — No dark patterns to encourage data sharing ✓ (no prompts to add more info)
6. **Transparency** — Privacy information appropriate to child's age — provide a simplified "how we use your info" for kids alongside the parent-facing privacy policy

### Practical Implementation
- Kid-friendly privacy blurb: "We save your stickers and progress so you don't lose them! Your grown-up's email keeps your account safe."
- No push notifications or re-engagement prompts directed at the child
- Streak mechanic should not create anxiety — streak resets are gentle (flower doesn't die)

## GDPR Article 8 (EU — Consent for Children)

### Applicability
Consent for data processing of children varies by EU country (13-16 years). Since our users are 5-8, parental consent is always required.

### Our Approach
- Parent provides consent by creating the account
- We collect minimal data (email + progress)
- Right to erasure (account deletion)
- Data portability not practically relevant at this scale

## Pixabay License

### Current License Terms
- Pixabay images are released under their Content License (formerly CC0, now custom)
- **Commercial use: permitted** — can be used in commercial products
- **Modification: permitted** — can crop, resize, edit
- **Attribution: not required** (but appreciated)
- **No additional restrictions for children's products** — no age-related clauses
- **Redistribution: images cannot be sold as-is** — must be part of a larger work (our app qualifies)
- **AI training: restricted** — cannot use to train AI models (not relevant to us)

### Recommendation
Bundle images statically. Download during build, include in deployment. No runtime API calls to Pixabay. This is cleaner and avoids any rate limit or availability issues.

## Required Legal Documents

### 1. Privacy Policy
- Who we are (site operator)
- What we collect (parent email, learning progress)
- Why we collect it (account auth, progress sync)
- How long we keep it (until account deletion)
- Third-party sharing (none)
- Children's privacy (COPPA/UK Code compliance statement)
- Data deletion (how to request)
- Cookie usage (session only, no tracking)
- Contact information

### 2. Terms of Use
- Light terms appropriate for a free educational site
- Age requirement (children must use with parent/guardian awareness)
- Acceptable use (educational purposes)
- Limitation of liability (standard)
- Content accuracy disclaimer (educational content, not medical/nutritional advice)

### 3. Cookie Policy
- Minimal — session cookies only for authentication
- No third-party cookies
- No analytics cookies
- Simple banner: "We only use essential cookies to keep you logged in"

## Flags for Other Disciplines

1. **DESIGN** — Account creation flow must include parent/guardian confirmation and email verification
2. **SPEC** — Data model must support full account deletion (cascade delete all user data)
3. **SPEC** — No analytics/tracking SDKs — if metrics are needed, use privacy-preserving server-side counts only

## Risk Assessment

**Overall legal risk: LOW**
- No child-directed data collection (parent creates account)
- No social features, ads, or tracking
- Minimal data footprint
- Clear consent flow
- Standard legal documents cover requirements

The main compliance work is writing the three documents (privacy policy, terms, cookie policy) and implementing the parent-mediated account flow correctly.

## Loop-Back Triggers

None. No legal blockers. Minor design requirements (parent flow) flagged above.
