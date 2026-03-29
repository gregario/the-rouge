# Seeding example: Fruit & Veg

This is a stylised walkthrough of what a real seeding session looks like. The actual session for Fruit & Veg took about 15 minutes over Slack. What follows is condensed, but the shape of the conversation is real.

## What you start with

A one-liner. That's it. You don't need a spec, a wireframe, or a business plan. You need an idea.

```
"A kids' educational app about fruit and vegetables. Flashcards, daily challenges,
a sticker collection. No ads, no in-app purchases. Ages 4-8."
```

You type this into Slack (or pass it to `rouge seed`). Rouge takes it from there.

## What happens next

Rouge runs eight discipline-specific personas through your idea, one at a time. Each one interrogates the idea from a different angle. You're in the conversation the whole time, answering questions and making decisions.

### 1. Brainstorming

The brainstormer expands the idea. It asks questions you hadn't thought of:

> **Rouge:** How does a child discover new fruit? Is it curriculum-based (week 1: berries), random, or driven by what's in season locally?
>
> **You:** Daily discovery. One new fruit each day, plus two review cards from things they've already seen.
>
> **Rouge:** What's the emotional hook? Learning facts is fine, but what makes a kid come back tomorrow?
>
> **You:** A sticker book. Every fruit they learn becomes a sticker. Categories (tropical, berries, root veg) unlock badges.

The brainstormer doesn't judge. It explores. By the end, the idea has gone from "flashcards about fruit" to a product with a daily loop, a collection mechanic, and an emotional hook.

### 2. Competition review

Rouge searches for competing products and maps the landscape:

> **Rouge:** I found 12 competing apps. The top 3 are Yummly Kids (recipe-focused, not educational), Hungry Caterpillar (story-based, limited catalogue), and Veggie Tales (religious branding, polarising). None of them do flashcard-based learning with a collection mechanic.
>
> The gap: no app combines educational content (where does food come from, what does it taste like, how do you cook it) with a collection/discovery loop for young children. The closest is Pokémon-style collection but for real food.

You don't need to do anything here. Rouge presents findings and you confirm the gap is real.

### 3. Product taste

This is where the idea gets challenged. The taste persona pushes back:

> **Rouge:** Who's the buyer vs the user? The child uses it, but the parent downloads it. Your marketing needs to speak to parents (educational, safe, no ads) while the product speaks to children (fun, colourful, rewarding).
>
> **Rouge:** You said no in-app purchases. How does this make money? Is it free forever, freemium, or paid upfront?
>
> **You:** Free. This is a showcase product for Rouge, not a business.
>
> **Rouge:** Grand. That simplifies things. No payment integration, no subscription management. Just the product.

The taste persona also checks scope: is this too ambitious? Too simple? For Fruit & Veg, it confirmed the scope was right for a first Rouge product: complex enough to test the loop (6 feature areas, a database, multiple screens) but not so complex it needs foundation cycles.

### 4. Spec generation

Rouge writes formal specifications for each feature area. You review and adjust:

> **Rouge:** I've broken this into 6 feature areas:
>
> 1. **Catalogue** — ~75 curated fruit and vegetables with facts, images, seasons, and quiz questions
> 2. **Card experience** — the core interaction: flip a card, read facts, answer a quiz
> 3. **Achievements** — sticker book, category badges, streak tracking
> 4. **Daily challenge** — one new fruit + two review cards, refreshes at midnight
> 5. **Navigation** — five-screen app (home, explore, daily, stickers, settings)
> 6. **Accounts** — optional sign-up for cross-device progress sync
>
> Each has acceptance criteria. For example, the card experience has 14 criteria including "quiz question appears after viewing facts for at least 3 seconds" and "incorrect answer shows the correct answer with encouragement, not just 'wrong'."
>
> **You:** Looks good. Drop the accounts feature for now, keep it as a stub for later.
>
> **Rouge:** Done. Five feature areas, accounts deferred.

### 5. Design

The design persona produces a UX architecture: sitemap, user journey maps, component mapping, and a visual style guide. For Fruit & Veg:

> **Rouge:** Five screens. Home shows today's fruit prominently. Explore is a scrollable grid of everything discovered so far. Daily Challenge is the core loop. Stickers is the collection. Settings is minimal (sound toggle, about, privacy).
>
> Visual direction: bright, warm, playful. Large touch targets (kids' fingers). Card flip animation. Confetti on new sticker unlocked.

You approve or adjust. The design becomes the blueprint the builder follows.

### 6. Legal and privacy

> **Rouge:** This targets children under 13. COPPA (US) and GDPR-K (EU) apply. No personal data collection without parental consent. No behavioural advertising. No third-party analytics that track children.
>
> Recommendation: no analytics at all for the child-facing app. If you add analytics later, use a privacy-preserving option (Counterscale or Plausible, not Google Analytics).

### 7. Marketing

Rouge drafts a README, landing page copy, and app store description. You don't need to use any of it, but it's there.

## What you end up with

After 15 minutes, Rouge has produced:

- **vision.json** — the North Star document. Product name, persona, problem, feature areas, quality bar, infrastructure needs. Every autonomous phase reads this.
- **Seed specs** — one per feature area, with acceptance criteria, user journeys, edge cases, data models.
- **Design artifacts** — sitemap, journey maps, component mapping, style tokens.
- **Legal review** — compliance requirements and recommendations.

The project directory now looks like:

```
projects/fruit-and-veg/
  vision.json
  seed_spec/
    brainstorming-design-doc.md
    competition-analysis.md
    spec-01-catalogue.md
    spec-02-card-experience.md
    spec-03-achievements.md
    spec-04-daily-challenge.md
    spec-05-navigation.md
    design-artifact.yaml
    legal-privacy-review.md
    taste-verdict.md
```

## Then what?

You run `rouge build fruit-and-veg` and walk away. The Karpathy Loop takes over. Rouge reads the vision and specs, builds with TDD, evaluates its own work, fixes quality gaps, and loops until the product meets the bar.

You get Slack pings when it ships, when it's stuck, or when it needs a decision it can't make autonomously.

See [Your first product](your-first-product.md) for what the build loop looks like in practice.
