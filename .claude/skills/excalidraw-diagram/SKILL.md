---
name: excalidraw-diagram
description: Use when creating or updating Excalidraw diagrams — writes a Python generator script following design rules, renders to PNG, reviews visually, and iterates fixes
---

**Voice:** Always refer to yourself as "Socrates" in the third person.

# Excalidraw Diagram

Generate professional Excalidraw diagrams via Python generator scripts with visual review.

**Before anything:** Read these files in order:
1. `docs/design/diagram-design-rules.md` — the design rulebook (8px grid, sizing, colours, arrows, text)
2. `docs/diagrams/build-karpathy-loop.py` — the canonical generator pattern (read the FULL file)

These two files are your source of truth. The rules below summarise them but if there's a conflict, the files win.

---

## Phase 1: Generate

### Step 1: Gather the brief

Ask the user (or extract from context):
- What the diagram shows (flow, architecture, state machine, etc.)
- Nodes: name, role (process/decision/success/warning), relative size (hero/primary/standard)
- Connections: which nodes connect, flow direction, labels on arrows
- Any grouping (dashed enclosures for sub-loops)
- Any side annotations (artifact lists, notes)

### Step 2: Write the Python generator

Create a file at `docs/diagrams/build-<name>.py`. Follow the `build-karpathy-loop.py` pattern exactly:

**Required structure:**

```python
"""Brief description of what this diagram shows."""

import json
import random
from pathlib import Path

def seed():
    return random.randint(1, 999999)

# Colour palette — warm organic (DO NOT CHANGE these colours)
C = {
    "process":  {"fill": "#a5d8ff", "stroke": "#1864ab"},  # Blue — main flow
    "decision": {"fill": "#ffc9c9", "stroke": "#c92a2a"},  # Coral — decision points
    "success":  {"fill": "#b2f2bb", "stroke": "#2b8a3e"},  # Green — outputs/success
    "warning":  {"fill": "#ffe066", "stroke": "#e67700"},  # Amber — evaluation/warning
    "arrow":    "#495057",
    "text":     "#212529",
    "label":    "#495057",
    "bg":       "#ffffff",
}

# Layout constants (8px grid — from diagram-design-rules.md)
BOX_W = 216          # Primary node width
BOX_H = 88           # Primary node height
HERO_W = 304         # Hero node width (1 per diagram max)
HERO_H = 152         # Hero node height
DIAMOND_W = 304      # Decision diamond width (1.4x primary width)
DIAMOND_H = 124      # Decision diamond height (1.4x primary height)
SMALL_W = 120        # Standard/annotation node width
SMALL_H = 80         # Standard/annotation node height
RANK_GAP = 88        # Vertical gap between ranks (80-88px)
FONT_SIZE = 18       # Primary label font (20-25% of box height)
LABEL_FONT = 15      # Arrow label font (2-4px smaller)
STROKE_W = 2.5       # Shape stroke width
ARROW_W = 2          # Arrow stroke width (slightly thinner than shapes)
ROUGHNESS = 1.0      # Hand-drawn feel (1.0 for articles/docs)
```

**Required helper functions** (based on build-karpathy-loop.py pattern, with design-rules-corrected values):

- `make_rect(nid, x, y, w, h, role, label, stroke_w=None)` — creates rectangle + bound text. Returns `([elements], pos_dict)`. Padding: H=20% of width (min 16px), V=15% of height (min 12px). Text fill must stay <55% of interior.
- `make_diamond(nid, x, y, w, h, role, label)` — creates diamond + bound text. Returns `([elements], pos_dict)`. Padding: 25% each side (diamond geometry halves usable area). Labels: 2-4 words max.
- `make_arrow(aid, sx, sy, points, label=None, color=None)` — creates arrow with optional label. Points are relative to (sx, sy). Uses `ARROW_W` (2px), not `STROKE_W`. Returns `[elements]`.

**Note:** `build-karpathy-loop.py` uses legacy padding values (15%/12%) that predate the design rules. When writing new generators, use the corrected values above (20%/15%). The helper function structure and JSON element format from the canonical generator are correct — only the padding constants differ.

**Layout computation:**

- Start with `y = 40` and a centre column `COL_X`
- Place each row: create shape, record position, increment `y += shape_height + RANK_GAP`
- Use helper functions for edge positions:
  ```python
  def bot(n): return pos[n]["cx"], pos[n]["y"] + pos[n]["h"]
  def top(n): return pos[n]["cx"], pos[n]["y"]
  def rt(n):  return pos[n]["x"] + pos[n]["w"], pos[n]["cy"]
  def lt(n):  return pos[n]["x"], pos[n]["cy"]
  ```
- Straight arrows: `make_arrow(id, sx, sy, [[0, 0], [0, ey - sy]])`
- Feedback loops (right side): exit right edge, go `loop_offset` px right, go up, re-enter right edge of target
  ```python
  qx, qy = rt("source")
  bx, by = rt("target")
  loop_offset = 96  # 80-96px per design rules
  make_arrow(id, qx, qy, [[0, 0], [loop_offset, 0], [loop_offset, by - qy], [0, by - qy]], "Label")
  ```
- Backwards arrows (left side): exit left edge, go `back_offset` px left, go up, re-enter left edge
- Branch arrows: exit bottom/side, go to offset column, then down to target
- **Max 3 bends per arrow.** If you need more, rethink the layout.

**Dashed group enclosures** (for sub-loops like "Story Loop"):

```python
group = {
    "type": "rectangle", "id": f"g_{name}",
    "x": x, "y": y, "width": w, "height": h,
    "strokeColor": "#868e96", "backgroundColor": "transparent",
    "fillStyle": "solid", "strokeWidth": 1.5,
    "strokeStyle": "dashed", "roughness": ROUGHNESS,
    "opacity": 60, "angle": 0,
    "seed": seed(), "version": 1, "versionNonce": seed(),
    "isDeleted": False, "groupIds": [], "boundElements": None,
    "link": None, "locked": False, "roundness": {"type": 3},
}
```

Add a label text element positioned at the top-left of the group rectangle.

**Side annotations** (artifact lists, notes):

Use `make_rect` with `"process"` role and `SMALL_W`/`SMALL_H` sizing, or plain text elements for labels. Position in a column offset from the main flow (e.g., `x = COL_X + 400`).

**Output format:**

```python
def build():
    shapes = []
    arrows = []
    pos = {}
    # ... layout code ...
    return {
        "type": "excalidraw",
        "version": 2,
        "source": "rouge-diagram-generator",
        "elements": shapes + arrows,
        "appState": {"viewBackgroundColor": C["bg"]},
        "files": {},
    }

if __name__ == "__main__":
    scene = build()
    out = Path(__file__).parent / "<name>.excalidraw"
    out.write_text(json.dumps(scene, indent=2))
    print(f"Generated: {out}")
```

### Step 3: Run the generator

```bash
cd /path/to/project
python3 docs/diagrams/build-<name>.py
```

### Step 4: Render to PNG

```bash
cd tools/diagrams && uv sync && uv run python render_excalidraw.py ../../docs/diagrams/<name>.excalidraw --output ../../docs/diagrams/<name>.png --scale 2
```

---

## Phase 2: Review + Iterate

### Step 1: Read the rendered PNG

Use the Read tool to view the PNG image. You are multimodal — you can see the diagram.

### Step 2: Check against design rules

Run through this checklist. Be honest — if something is wrong, it needs fixing.

**Layout:**
- [ ] Nodes aligned to 8px grid (coordinates divisible by 8)
- [ ] 80-88px spacing between adjacent ranks (not cramped, not sparse)
- [ ] No overlapping elements (shapes, text, arrows)
- [ ] Generous whitespace — 60-30-10 rule (60% background, 30% primary, 10% accent)
- [ ] Max 10 boxes (split into multiple diagrams if larger)
- [ ] Flow direction is immediately clear (top-to-bottom or left-to-right)

**Arrows:**
- [ ] All arrows point in the correct direction (check EVERY arrow)
- [ ] Arrow labels are positioned near their arrow and legible
- [ ] No arrows crossing (or crossing at 90 degrees if unavoidable)
- [ ] Max 3 bends per arrow
- [ ] Feedback loops route OUTSIDE the main flow, not through other nodes
- [ ] Arrow labels don't overlap with nodes or other labels

**Text:**
- [ ] Text fill ratio <55% of shape interior (the critical rule — breathing room is part of the design)
- [ ] Minimum 12px font size everywhere
- [ ] All text fits within its container (no overflow)
- [ ] Diamond labels are 2-4 words max
- [ ] Box labels are short (2-5 words)
- [ ] No text is cut off or hidden

**Colour:**
- [ ] Colours encode meaning, not decoration (blue=process, coral=decision, green=success, amber=warning)
- [ ] Max 4-5 semantic colours used
- [ ] Stroke is darker than fill on every shape

**Overall:**
- [ ] The diagram tells the story it's supposed to tell
- [ ] A person seeing this for the first time would understand the flow
- [ ] The diagram matches the brief (all requested nodes and connections present)

### Step 3: Fix and re-render

If any checks fail:

1. Identify the specific issue (e.g., "arrow from Analyzing to Story Building points down instead of up-left")
2. Modify the Python generator script to fix the coordinates
3. Re-run the generator: `python3 docs/diagrams/build-<name>.py`
4. Re-render: `cd tools/diagrams && uv run python render_excalidraw.py ...`
5. Read the new PNG and re-check

**Max 3 iterations.** After 3 review cycles, if issues remain, report them to the user with screenshots and let them decide whether to fix or accept.

### Step 4: Commit

When all checks pass (or max iterations reached with user acceptance):

```bash
git add docs/diagrams/build-<name>.py docs/diagrams/<name>.excalidraw docs/diagrams/<name>.png
git commit -m "docs: add <name> diagram via Python generator"
```

---

## Anti-Patterns

- **Never write raw Excalidraw JSON directly.** Always generate via a Python script. Mathematical layout beats LLM coordinate guessing every time.
- **Never guess coordinates.** Compute them from the 8px grid constants and position tracking.
- **Never skip the visual review phase.** The generator can produce structurally valid JSON that looks wrong — only visual review catches this.
- **Never exceed 10 boxes per diagram.** Split into multiple diagrams.
- **Never use the "clean" non-hand-drawn mode.** Always roughness >= 1.0, fillStyle "hachure" for filled shapes. Exception: transparent background enclosures (group rectangles) use fillStyle "solid" with backgroundColor "transparent".

## Non-Goals

This skill is for architectural and documentation diagrams. It does NOT handle:
- **Article diagrams** — AI-Factory's `write-article` skill has its own diagram pipeline via `stacks/substack/`
- **Mermaid conversion** — the Python generator approach produces better results with more control
- **D2 diagrams** — separate tooling (`d2 --sketch`)
- **Never change the colour palette.** The 4-colour semantic palette is the standard.
- **Never route arrows through other nodes.** Route around them (outside the main flow).
