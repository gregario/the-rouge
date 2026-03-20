# Fruit & Veg — Design Document

## The Problem

Kids aged 5-8 have limited knowledge of fruit and vegetables beyond what appears on their plate. They don't know where a banana grows, that a strawberry is technically not a berry, or that carrots come in colours other than orange. Parents and family members want to teach them, but the tools available are either boring (plain flashcards), overwhelming (educational apps crammed with features), or designed for older kids.

There's no simple, delightful, purpose-built experience that teaches young children about fruit and vegetables through discovery rather than instruction. The existing workarounds — pointing at things in the supermarket, reading food packaging — are sporadic and unstructured.

## The User

**Primary:** Children aged 5-8 (early readers). They can read short sentences, tap buttons confidently, and are motivated by collection and discovery. They love stickers, surprises, and bright colours. They lose interest quickly if something feels like homework.

**Secondary:** Parents, aunts, uncles, grandparents — the adults who put the app in front of the child. They care about:
- Is this safe? (no ads, no chat, no in-app purchases)
- Is this educational? (not just entertainment)
- Can my child use it independently? (minimal supervision needed)
- Does it actually work? (will they learn something?)

**Trigger moment:** A family member wants to teach a child about healthy eating, or a child asks "what's that?" about an unfamiliar fruit/vegetable.

## The Emotional North Star

From "I don't know what that is" to "I know ALL about that — let me tell you!"

The child becomes the expert. They collect knowledge like stickers and proudly share what they've learned.

## The 10-Star Experience

| Stars | Experience |
|-------|-----------|
| 1 | A list of fruit names. Text only. |
| 2 | A list with photos. No interaction. |
| 3 | Basic flashcards — photo on front, facts on back. |
| 4 | Flashcards with a quiz after each one. |
| 5 | Quiz with multiple question types + correct/incorrect feedback. |
| 6 | Add achievements/stickers for completing cards. Progress tracking. |
| 7 | **Playful personality — fruits talk in first person. Bright, colourful design. Sticker book collection. Daily challenge. Celebration animations.** |
| 8 | Spaced repetition built into daily review. Category badges. Secret discoveries. Streak garden. Account sync. |
| 9 | Voice narration for pre-readers. AR mode — point camera at real fruit to identify it. Seasonal content that changes with real-world harvests. |
| 10 | Fully personalised learning path. Multiplayer family mode. Physical sticker book that syncs with the app. Partnership with supermarkets for in-store scavenger hunts. |

**Sweet spot: 7-8 stars.** The personality and daily loop (7) make it feel magical rather than educational. The spaced repetition and account sync (8) make the learning actually stick and the product durable. Stars 9-10 add real value but require capabilities (AR, voice, physical goods, partnerships) that are premature for v1.

## Feature Areas

### 1. The Card Experience
**Baseline:** Grid of cards. Tap to see photo. Flip to see facts. Static text.

**Our version:** Each fruit/veg has a personality. The card front shows a beautiful image with the name. Tap to flip. The back reveals fun facts written in first person from the fruit's perspective:
- "I'm **red** (or green, or yellow!)"
- "I grow on **trees** in **South America**"
- "I'm part of the **berry** family — surprise!"

Gentle flip animation. Bright coloured background that matches the fruit/veg. The whole experience feels like meeting a character, not reading a factsheet.

**User journey:**
1. Kid sees a card (from daily challenge or collection) — curiosity, "what's this one?"
2. Taps the card — anticipation
3. Card flips with animation — delight, discovery
4. Reads fun facts in the fruit's voice — surprise, learning
5. Quiz questions appear below — challenge, engagement
6. Answers correctly — celebration (confetti/stars animation)
7. Answers incorrectly — gentle correction in fruit's voice ("Nearly! I actually grow on trees") — no shame, just learning
8. Card complete — sticker earned, satisfaction

**Edge cases:**
- Slow network: All content is static/bundled, no network dependency for core experience
- Accessibility: Large tap targets, high contrast text on coloured backgrounds, alt text on all images
- Re-visiting a completed card: Can always re-read from collection, quiz resets for practice

**Competitive difference:** The first-person voice makes each fruit a character. It's not "facts about apples" — it's "Apple is talking to you." Near-zero cost to write, massive difference in engagement for this age group.

**Scope decision:** Expanded (first-person voice, animations, celebration feedback)
**Build estimate:** Human team: ~2 weeks / Rouge: ~1-2 cycles

### 2. The Quiz Mechanic
**Baseline:** Standard multiple-choice text questions.

**Our version:** Multiple question types keep it fresh and test different knowledge:
1. **Colour match** — "What colour am I?" with coloured circles to tap (no reading required — great for younger end of range)
2. **Where do I grow?** — "Do I grow on a tree, in the ground, or on a bush?" with simple illustrated icons
3. **True or false** — "I'm a berry — true or false?" (tests the surprise facts)
4. **Odd one out** — Show 3 items, one doesn't belong ("Which one doesn't grow in Europe?")

Each card gets 2-3 questions randomly selected from its question pool. Positive-only feedback — no scores, no lives, no fail states. Wrong answers show the correct answer gently in the fruit's voice.

**User journey:**
1. Quiz appears after card flip — natural continuation
2. Question is visual and simple — confidence
3. Kid taps an answer — commitment
4. Correct: celebration animation + encouraging text — pride
5. Incorrect: gentle reveal of correct answer — learning without shame
6. All questions done — sticker unlocked — achievement

**Edge cases:**
- Kid taps randomly: No penalty, they still see correct answers and learn passively
- Same card revisited: Questions randomised from pool, won't be identical every time

**Scope decision:** Expanded (multiple question types, visual answers)
**Build estimate:** Human team: ~1.5 weeks / Rouge: ~1 cycle

### 3. Achievements & Collection (The Sticker Book)
**Baseline:** List of badges for milestones.

**Our version:** A multi-layered collection system that drives retention:

- **Fruit Stickers** — Every completed fruit/veg adds its sticker to the collection book. Uncompleted items show as silhouettes. Visual progress — colour vs grey.
- **Category Badges** — Complete all items in a category (berries, root veg, tropical, leafy greens, etc.) to earn a category badge.
- **Streak Flowers** — Each day the kid plays, a flower grows in their garden. Miss a day? The flower doesn't die (no punishment), but the streak counter resets. This is the Wordle-style retention hook.
- **Secret Discoveries** — Hidden achievements for surprising things: "You learned a fruit you've probably never eaten!" (dragonfruit, starfruit). Kids love secrets.

No leaderboards, no competition, no social features. Personal collection only — "look what I found" energy.

**User journey:**
1. Complete a card — sticker appears with celebration
2. Visit collection — see growing grid of colourful stickers among silhouettes
3. Notice a category almost complete — motivation to seek out remaining items
4. Earn a category badge — major celebration, special animation
5. Discover a secret achievement — surprise and delight

**Scope decision:** Expanded (sticker book, categories, streaks, secrets)
**Build estimate:** Human team: ~2 weeks / Rouge: ~1-2 cycles

### 4. Daily Challenge
**Baseline:** Random card each day.

**Our version:** Fruit of the Day + 2 review cards.

- **Fruit of the Day** — One new fruit/veg featured daily with a gold border. This is the headline — "what's today's fruit?!" Creates anticipation and routine.
- **Review Cards** — 2 previously-learned items for spaced repetition. The quiz re-tests knowledge. Keeps learning durable.
- **Daily Stamp** — Complete all 3 cards to earn today's stamp. Feeds into the streak garden.

With ~80 items and review rotation, content lasts 6+ months before feeling stale.

**User journey:**
1. Open app — see today's featured fruit with gold border — excitement, "what's new?"
2. Complete the featured card — new sticker earned
3. See 2 familiar review cards — confidence, "I know this one!"
4. Complete all 3 — daily stamp earned, streak grows
5. Come back tomorrow — new fruit waiting

**Scope decision:** Expanded (daily feature + review + streak)
**Build estimate:** Human team: ~1.5 weeks / Rouge: ~1 cycle

### 5. Navigation & Structure
**Baseline:** Standard app navigation.

**Our version:** Three places, three big icons. Dead simple.

1. **Home** — Today's daily challenge (Fruit of the Day + 2 review cards). Landing page every visit.
2. **My Collection** — Sticker book grid. All fruit/veg shown. Category tabs (Fruits / Vegetables / Berries / Tropical / Root Veg). Tap any item to learn it or re-read it.
3. **My Garden** — Achievements view. Streak flowers, category badges, secret discoveries.

Bottom navigation bar with three large, colourful icons. No hamburger menus, no dropdowns, no settings pages. A 5-year-old navigates with zero help.

**Scope decision:** Baseline (this is already the right level)
**Build estimate:** Human team: ~1 week / Rouge: ~1 cycle

### 6. Onboarding & First-Time Experience
**Baseline:** Tutorial screens explaining the app.

**Our version:** No tutorial. The first card IS the onboarding. Kid lands on today's Fruit of the Day immediately. Tap, flip, quiz, sticker. They now understand the entire app through doing.

After the first sticker, the collection view opens briefly to show 1 colourful sticker among ~79 silhouettes. Instant motivation.

**Scope decision:** Baseline (no-tutorial is less work AND better UX)
**Build estimate:** Human team: ~0.5 weeks / Rouge: ~0 extra cycles

### 7. Accounts & Progress Sync
**Baseline:** Local storage only.

**Our version:** Optional lightweight accounts.

- Progress saves locally from the start — zero friction
- "Save my progress" prompt appears after earning a few stickers (when they have something worth saving)
- Parent handles account creation — kid never sees a form
- Progress syncs via backend using standard Rouge hosting process
- Enables cross-device access (tablet at home, phone on the go)

**Legal note:** Collecting parent email for a kids' product requires COPPA/GDPR-K compliance. Flagged for LEGAL/PRIVACY discipline.

**Scope decision:** Expanded (accounts + sync)
**Build estimate:** Human team: ~2 weeks / Rouge: ~2-3 cycles

### 8. The Catalogue (Content)
**Baseline:** A basic list of items with names and photos.

**Our version:** A curated static JSON catalogue of ~60-80 fruit and vegetables. Each entry contains:
- Name
- Beautiful image (sourced from Pixabay, bundled statically)
- 3-4 fun facts written in first-person kid-friendly voice
- Origin / where it grows
- Colour(s)
- How it grows (tree, bush, ground, vine)
- Category (fruit / vegetable / berry / root / leafy / tropical)
- Season
- A pool of 4-5 questions with correct answers and plausible distractors

No external API dependencies. All content is static and bundled with the app. Data seeded from Fruityvice (nutrition/taxonomy) and enriched with manually curated facts. Images sourced programmatically from Pixabay (free, no attribution, SafeSearch enabled).

**Category breakdown (approximate):**
- Common fruits: ~20 (apple, banana, orange, grape, strawberry, etc.)
- Tropical fruits: ~10 (mango, pineapple, dragonfruit, passion fruit, etc.)
- Berries: ~8 (blueberry, raspberry, blackberry, cranberry, etc.)
- Common vegetables: ~15 (carrot, potato, broccoli, peas, sweetcorn, etc.)
- Root vegetables: ~8 (beetroot, turnip, radish, sweet potato, etc.)
- Leafy greens: ~8 (spinach, lettuce, kale, cabbage, etc.)
- Other: ~10 (mushroom, avocado, pepper, tomato, courgette, etc.)

**Scope decision:** Expanded (full catalogue with rich content per item)
**Build estimate:** Human team: ~2 weeks (content writing) / Rouge: ~1 cycle (content generation is Rouge's strength)

## What Makes This Different

This isn't a flashcard app with a fruit skin. It's a discovery experience where each fruit and vegetable is a character the child meets, learns about, and collects. The first-person voice ("I grow on trees in South America!") transforms passive fact-reading into an interaction. The sticker book transforms learning into collecting. The daily challenge transforms one-time use into a daily habit.

The closest analogy isn't other educational apps — it's Pokémon. You discover characters, learn about them, collect them, complete your collection. The difference is that every "character" is real, and the knowledge transfers directly to the dinner table and the supermarket.

Most kids' educational apps fail because they're either too game-like (all engagement, no learning) or too educational (all learning, no engagement). This product sits precisely in the middle: the learning IS the game mechanic. You can't progress without actually knowing things about fruit and vegetables.

## Temporal Arc

**Day 1:** Open the app. See today's fruit. Flip the card. Learn 3 fun facts. Answer 2 questions. Earn first sticker. See the collection with 79 empty slots. Want to come back.

**Week 1:** Daily routine established. 5-7 stickers collected. First category starting to fill up. Streak garden has a few flowers. Kid starts recognising fruit in real life — "that's a mango, it grows in India!"

**Month 1:** 25-30 items learned. First category badge earned. Secret discovery unlocked. The collection is visually satisfying — more colour than grey. Knowledge is durable thanks to review cards. Kid is the "fruit expert" in the family.

**Year 1:** Full collection complete (with the ~80 item catalogue, this happens around month 3-4 with daily play). The product has delivered its core value. Future expansions could add: seasonal specials, new categories (herbs, nuts, grains), fun facts updates, recipe connections.

## Open Questions

1. **[COMPETITION]** Are there existing kids' fruit/veg learning apps? What do they do well/poorly?
2. **[TASTE]** Is ~80 items the right catalogue size? Too few feels thin, too many overwhelms.
3. **[LEGAL/PRIVACY]** COPPA/GDPR-K compliance for optional accounts with parent email.
4. **[LEGAL/PRIVACY]** Pixabay image licensing for commercial use in a kids' product — any restrictions?
5. **[DESIGN]** Exact colour palette, illustration style, and animation specifications.
6. **[SPEC]** Data model for the catalogue JSON, question pool structure, achievement trigger definitions.

## Scope Summary

| Area | Scope | Human Estimate | Rouge Estimate |
|------|-------|---------------|----------------|
| Card Experience | Expanded | ~2 weeks | ~1-2 cycles |
| Quiz Mechanic | Expanded | ~1.5 weeks | ~1 cycle |
| Achievements & Collection | Expanded | ~2 weeks | ~1-2 cycles |
| Daily Challenge | Expanded | ~1.5 weeks | ~1 cycle |
| Navigation & Structure | Baseline | ~1 week | ~1 cycle |
| Onboarding | Baseline | ~0.5 weeks | ~0 extra |
| Accounts & Progress Sync | Expanded | ~2 weeks | ~2-3 cycles |
| Catalogue Content | Expanded | ~2 weeks | ~1 cycle |
| **Total** | | **~12.5 weeks** | **~8-11 cycles** |

## Confidence Assessment

**8/10.** The vision is clear, the user is well-defined, and the feature set is coherent. The product has a genuine insight (discovery-as-collection) and a clear retention loop (daily challenge + streaks). Open questions are bounded and addressable by other disciplines. The main risk is catalogue content quality — but that's an execution risk, not a vision risk.
