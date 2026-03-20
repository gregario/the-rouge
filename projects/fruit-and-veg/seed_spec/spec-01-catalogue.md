# SPEC: Catalogue Data Model

## Overview
Static curated JSON catalogue of ~60-80 fruit and vegetables. All content is bundled — no external API calls at runtime. This spec defines the data structures that all other feature areas build on.

---

## Data Model

### Entity: CatalogueItem
```
Fields:
  - id: string — unique kebab-case slug (e.g., "banana", "dragon-fruit"). Immutable once created.
  - name: string — display name (e.g., "Banana", "Dragon Fruit"). Supports Unicode.
  - image: string — relative path to bundled image file (e.g., "/images/catalogue/banana.webp")
  - category: enum ["fruit", "vegetable", "berry"] — primary classification
  - subcategory: enum ["tropical", "citrus", "stone-fruit", "root", "leafy", "legume", "allium", "gourd", "common", "exotic"] — secondary classification
  - colours: string[] — one or more colours (e.g., ["yellow"], ["red", "green", "yellow"] for apple)
  - growsOn: enum ["tree", "bush", "vine", "ground", "underground"] — how it grows
  - origin: string — simplified geographic origin (e.g., "South America", "Southeast Asia", "Europe")
  - season: enum ["spring", "summer", "autumn", "winter", "all-year"] — primary harvest season
  - funFacts: FunFact[] — 3-4 facts written in first-person kid-friendly voice
  - questions: Question[] — pool of 4-5 quiz questions
  - surpriseFact: string | null — optional "did you know?" fact for delight moments
  - difficulty: enum ["easy", "medium"] — easy = common items kids likely know, medium = less familiar items

Constraints:
  - id must be unique across all items
  - funFacts must contain 3-4 items
  - questions must contain 4-5 items
  - colours must contain at least 1 item
  - image file must exist at the referenced path
```

### Entity: FunFact
```
Fields:
  - text: string — first-person fact (e.g., "I grow on tall trees in South America!")
  - highlightWord: string — the key word/phrase to visually emphasise (e.g., "South America")
  - factType: enum ["origin", "colour", "growth", "family", "nutrition", "surprise"] — categorises the fact
```

### Entity: Question
```
Fields:
  - id: string — unique within the item (e.g., "banana-q1")
  - type: enum ["colour-match", "where-grow", "true-false", "odd-one-out"] — question type
  - questionText: string — the question in first-person voice (e.g., "What colour am I?")
  - options: QuestionOption[] — 3-4 answer options
  - correctOptionId: string — id of the correct option
  - explanationCorrect: string — celebration text (e.g., "Yes! I'm yellow!")
  - explanationIncorrect: string — gentle correction (e.g., "Nearly! I'm actually yellow")
```

### Entity: QuestionOption
```
Fields:
  - id: string — unique within the question (e.g., "a", "b", "c")
  - text: string | null — text label (null for colour-match type)
  - colour: string | null — hex colour code (for colour-match type only)
  - icon: string | null — icon identifier (for where-grow type, e.g., "tree", "ground", "bush")
```

### Entity: DailySchedule
```
Fields:
  - date: string — ISO date (YYYY-MM-DD)
  - featuredItemId: string — id of the Fruit of the Day
  - reviewItemIds: string[] — ids of 2 review items (previously completed by this user)

Constraints:
  - featuredItemId must not have been featured in the last 7 days
  - reviewItemIds must reference items the user has previously completed
  - If user has fewer than 2 completed items, show 1 or 0 review cards accordingly
```

---

## Catalogue Content Requirements

### Category Distribution (target ~75 items)
| Category | Subcategory | Count | Examples |
|----------|-------------|-------|---------|
| Fruit | Common | 10 | Apple, banana, orange, grape, pear, peach, plum, cherry, melon, kiwi |
| Fruit | Tropical | 8 | Mango, pineapple, coconut, papaya, passion fruit, guava, lychee, starfruit |
| Fruit | Citrus | 5 | Lemon, lime, grapefruit, tangerine, kumquat |
| Fruit | Stone fruit | 4 | Apricot, nectarine, date, fig |
| Berry | — | 8 | Strawberry, blueberry, raspberry, blackberry, cranberry, gooseberry, dragon fruit, pomegranate |
| Vegetable | Root | 8 | Carrot, potato, beetroot, sweet potato, turnip, radish, parsnip, ginger |
| Vegetable | Leafy | 6 | Spinach, lettuce, kale, cabbage, watercress, rocket |
| Vegetable | Legume | 4 | Peas, green beans, broad beans, lentils |
| Vegetable | Allium | 4 | Onion, garlic, leek, spring onion |
| Vegetable | Gourd | 4 | Courgette, pumpkin, butternut squash, cucumber |
| Vegetable | Common | 8 | Broccoli, cauliflower, sweetcorn, pepper, tomato, avocado, mushroom, aubergine |
| Vegetable | Exotic | 6 | Artichoke, asparagus, fennel, okra, pak choi, yam |

### Image Requirements
- Format: WebP (with JPG fallback)
- Size: 400x400px minimum, square aspect ratio
- Style: Clean photo on white or transparent background — consistent across all items
- Source: Pixabay API (programmatic download during build), bundled statically
- Fallback: If image unavailable, use a coloured silhouette matching the item's primary colour

### Content Voice
All first-person facts follow this voice:
- Written as if the fruit/veg is talking to the child
- Short sentences (max 12 words)
- Exclamation marks for surprise facts
- Highlight the most interesting/unexpected word in bold
- Avoid: nutritional jargon, complex geography, anything scary or negative

Example (Strawberry):
```
"I'm red and covered in tiny seeds — can you count them?"
"I grow close to the ground, not up in trees!"
"Surprise! I'm not actually a berry — weird, right?"
"I'm sweetest in summer when the sun is warm"
```

---

## Acceptance Criteria

### Data Integrity
```
AC-CAT-01: All catalogue items load
  GIVEN the app is loaded
  WHEN the catalogue data is parsed
  THEN all items (minimum 60) load without error
  MEASUREMENT: JSON parse succeeds, item count >= 60

AC-CAT-02: All images exist
  GIVEN the catalogue is loaded
  WHEN each item's image path is resolved
  THEN every image file exists and loads within 2 seconds
  MEASUREMENT: HTTP 200 for every image path, load time < 2000ms

AC-CAT-03: All questions have valid correct answers
  GIVEN any catalogue item
  WHEN its questions are loaded
  THEN each question's correctOptionId matches one of its options' ids
  MEASUREMENT: Programmatic validation — iterate all items, assert correctOptionId ∈ options[].id

AC-CAT-04: Category distribution is balanced
  GIVEN the full catalogue
  WHEN items are grouped by category
  THEN fruits >= 25, vegetables >= 25, berries >= 6
  MEASUREMENT: Count items per category

AC-CAT-05: Fun facts meet content requirements
  GIVEN any catalogue item
  WHEN its funFacts are loaded
  THEN there are 3-4 facts, each under 80 characters, each with a highlightWord that appears in the text
  MEASUREMENT: Programmatic validation of array length, character count, and substring match

AC-CAT-06: Questions cover multiple types per item
  GIVEN any catalogue item with 4+ questions
  WHEN its questions are loaded
  THEN at least 2 different question types are represented
  MEASUREMENT: Count distinct type values in questions array

AC-CAT-07: No duplicate item IDs
  GIVEN the full catalogue
  WHEN all item IDs are collected
  THEN there are no duplicates
  MEASUREMENT: Set(ids).size === items.length

AC-CAT-08: Colour-match questions have colour values
  GIVEN a question of type "colour-match"
  WHEN its options are loaded
  THEN every option has a non-null colour field with valid hex code
  MEASUREMENT: Regex match /^#[0-9a-fA-F]{6}$/ on all option.colour values
```

---

## Edge Cases

```
Edge case: Item with multiple colours
  Scenario: Apple has colours ["red", "green", "yellow"]
  Expected behavior: Colour-match question accepts any of the item's colours as correct. Display shows all colour options.
  Why it matters: Several common fruits/veg come in multiple colours. A child answering "green" for apple should not be marked wrong.

Edge case: Very similar items
  Scenario: Tangerine vs orange, courgette vs cucumber
  Expected behavior: Quiz distractors should not pair easily-confused items unless the question specifically tests distinguishing them.
  Why it matters: Unfair questions frustrate kids and undermine trust in the product.

Edge case: Items kids may not recognise
  Scenario: Kumquat, fennel, pak choi
  Expected behavior: These are marked difficulty: "medium" and are less likely to appear in early daily challenges. The image must be clear and recognisable.
  Why it matters: Encountering too many unfamiliar items early can discourage a child.

Edge case: Missing image fallback
  Scenario: An image file fails to load (corrupt file, path error)
  Expected behavior: Show a coloured circle/silhouette with the item's primary colour and name text overlay
  Why it matters: A broken image breaks the entire card experience.
```
