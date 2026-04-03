# Diagram Design Rulebook

Concrete rules for generating professional-grade diagrams programmatically. Based on Tufte, Hazeflow, coleam00, and typographic research.

## Shape sizing (8px grid)

| Type | Width | Height | Use |
|------|-------|--------|-----|
| Hero | 304 | 152 | 1 per diagram max, primary element |
| Primary | 216 | 88 | Main flow nodes |
| Standard | 120 | 80 | Secondary elements |
| Diamond | 1.4x rect | 1.4x rect | Decision points — geometry demands it |

**Why 1.4x for diamonds:** A diamond's usable text area is ~50% of its bounding box (the inscribed rectangle). To fit the same text as a rectangle, multiply both dimensions by sqrt(2) ≈ 1.41.

## Padding inside shapes

Horizontal padding = 20% of width (min 16px). Vertical padding = 15% of height (min 12px). Use 8px grid: 8, 16, 24, 32.

**The critical rule:** Text bounding box should occupy no more than 55% of the shape's interior area. The rest is breathing room.

For diamonds: 25% padding on each side (because usable area is already halved by geometry).

## Spacing between nodes

| Relationship | Spacing |
|-------------|---------|
| Adjacent nodes (across ranks) | 80-88px |
| Branch offset from centre | 264px |
| Arrow gap from node edge | 2-4px |
| Arrow clearance (routing around nodes) | 20-30px |

Rule of thumb: spacing between nodes = 40-60% of node width.

## Stroke width

| Element | Width | Notes |
|---------|-------|-------|
| Shape borders | 2-2.5px | Standard for hand-drawn |
| Arrows | 2px | Slightly thinner than shapes |
| Divider lines | 1px | Structural, not primary |
| Emphasis | 3px | Sparingly |

**Never exceed 3px for shapes under 200px tall.**

## Font sizing

Font size = 20-25% of box height for single-line labels. For multi-line, 18-20%.

| Box height | Font size | Ratio |
|-----------|-----------|-------|
| 60px | 14px | 23% |
| 80px | 16-18px | 20-23% |
| 88px | 18px | 20% |
| 100px | 20px | 20% |

Typographic scale ratio: 1.25 (Major Third). Each level: 12 → 15 → 19 → 24 → 30.

Arrow labels: 2-4px smaller than node labels.

## Arrow routing

- Prefer straight horizontal/vertical. Diagonal only for branch splits/merges.
- Feedback loops: exit right side, route right with 80-96px offset, turn up, re-enter right side of target. Never route through other nodes.
- Max 3 bends per arrow. More = rethink the layout.
- Arrows should never cross if avoidable. When unavoidable, cross at 90 degrees.

## Colour rules

- **Max 4-5 semantic colours** per diagram
- **Stroke always darker than fill** for contrast
- **60-30-10 rule**: 60% whitespace/background, 30% primary accent (fills, arrows), 10% secondary accent (highlights)
- Colour encodes meaning, not decoration. If a colour doesn't mean something, remove it.

## Roughness

| Value | Effect | Use |
|-------|--------|-----|
| 0 | Clean, professional | Technical documentation |
| 1.0 | Controlled hand-drawn | Articles, presentations |
| 1.5 | Sketchy, organic | Blog posts, whiteboard feel |
| 2.0 | Very rough | Brainstorm, early ideas |

For Substack articles: roughness 1.0-1.2 with hachure fills.

## Fill styles

- **solid**: Clean, professional. Use with roughness 0.
- **hachure**: Cross-hatched marker shading. Organic, warm. Use with roughness 1.0+.
- **cross-hatch**: Denser than hachure. Use sparingly for emphasis.
- **transparent**: No fill, just outlines. Turner/whiteboard style.

## Tufte's principles applied

1. **Data-ink ratio**: Every pixel conveys information. No decorative borders, gradients, shadows, 3D.
2. **Chartjunk elimination**: No clip-art icons that don't convey meaning.
3. **Small multiples**: If comparing flows, use identical layouts with only the differences highlighted.

## Text comfort checklist

Before rendering, verify:
- [ ] Text fill ratio < 55% of shape interior
- [ ] Minimum 12px font size everywhere
- [ ] Diamond labels are 2-4 words max
- [ ] No text overflows its container
- [ ] Contractions used where natural ("don't" not "do not")
