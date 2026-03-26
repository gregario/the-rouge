"""Build the Karpathy Loop diagram for the Rouge README.

Shows: Seed → Foundation → Build/Evaluate/Analyse loop → Ship
With backwards flow from Analyse back to Foundation.

Uses the warm-hand-drawn style from the Substack diagram pipeline.
"""

import json
import random
from pathlib import Path

def seed():
    return random.randint(1, 999999)

# Colour palette — warm organic
C = {
    "process":  {"fill": "#a5d8ff", "stroke": "#1864ab"},  # Blue — main flow
    "decision": {"fill": "#ffc9c9", "stroke": "#c92a2a"},  # Coral — decision points
    "success":  {"fill": "#b2f2bb", "stroke": "#2b8a3e"},  # Green — outputs
    "warning":  {"fill": "#ffe066", "stroke": "#e67700"},  # Amber — evaluation
    "arrow":    "#495057",
    "text":     "#212529",
    "label":    "#495057",
    "bg":       "#ffffff",
}

# Layout (8px grid)
BOX_W = 216
BOX_H = 80
HERO_W = 264
HERO_H = 96
DIAMOND_W = 240
DIAMOND_H = 112
RANK_GAP = 72
COL_X = 420
FONT_SIZE = 18
LABEL_FONT = 15
STROKE_W = 2.5
ROUGHNESS = 1.0


def make_rect(nid, x, y, w, h, role, label, stroke_w=None):
    colors = C[role]
    rect_id = f"r_{nid}"
    text_id = f"t_{nid}"
    rect = {
        "type": "rectangle", "id": rect_id,
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": colors["stroke"], "backgroundColor": colors["fill"],
        "fillStyle": "hachure", "strokeWidth": stroke_w or STROKE_W,
        "strokeStyle": "solid", "roughness": ROUGHNESS,
        "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": [{"id": text_id, "type": "text"}],
        "link": None, "locked": False, "roundness": {"type": 3},
    }
    pad_x = int(w * 0.15)
    pad_y = int(h * 0.12)
    text = {
        "type": "text", "id": text_id,
        "x": x + pad_x, "y": y + pad_y,
        "width": w - pad_x * 2, "height": h - pad_y * 2,
        "text": label, "originalText": label,
        "fontSize": FONT_SIZE, "fontFamily": 1,
        "textAlign": "center", "verticalAlign": "middle",
        "strokeColor": C["text"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": rect_id, "lineHeight": 1.25,
    }
    return [rect, text], {"x": x, "y": y, "w": w, "h": h, "cx": x + w // 2, "cy": y + h // 2}


def make_diamond(nid, x, y, w, h, role, label):
    colors = C[role]
    did = f"d_{nid}"
    tid = f"dt_{nid}"
    diamond = {
        "type": "diamond", "id": did,
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": colors["stroke"], "backgroundColor": colors["fill"],
        "fillStyle": "hachure", "strokeWidth": STROKE_W,
        "strokeStyle": "solid", "roughness": ROUGHNESS,
        "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": [{"id": tid, "type": "text"}],
        "link": None, "locked": False, "roundness": None,
    }
    pad_x = int(w * 0.25)
    pad_y = int(h * 0.25)
    text = {
        "type": "text", "id": tid,
        "x": x + pad_x, "y": y + pad_y,
        "width": w - pad_x * 2, "height": h - pad_y * 2,
        "text": label, "originalText": label,
        "fontSize": FONT_SIZE - 2, "fontFamily": 1,
        "textAlign": "center", "verticalAlign": "middle",
        "strokeColor": C["text"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": did, "lineHeight": 1.25,
    }
    return [diamond, text], {"x": x, "y": y, "w": w, "h": h, "cx": x + w // 2, "cy": y + h // 2}


def make_arrow(aid, sx, sy, points, label=None, color=None):
    els = []
    arrow = {
        "type": "arrow", "id": f"a_{aid}",
        "x": sx, "y": sy,
        "width": max(abs(max(p[0] for p in points) - min(p[0] for p in points)), 1),
        "height": max(abs(max(p[1] for p in points) - min(p[1] for p in points)), 1),
        "strokeColor": color or C["arrow"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": ROUGHNESS, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "points": points,
        "startBinding": None, "endBinding": None,
        "startArrowhead": None, "endArrowhead": "arrow",
    }
    els.append(arrow)
    if label:
        mid_idx = len(points) // 2
        mid_x = sx + (points[mid_idx - 1][0] + points[mid_idx][0]) / 2
        mid_y = sy + (points[mid_idx - 1][1] + points[mid_idx][1]) / 2
        els.append({
            "type": "text", "id": f"al_{aid}",
            "x": mid_x + 10, "y": mid_y - 20,
            "width": 80, "height": 24,
            "text": label, "originalText": label,
            "fontSize": LABEL_FONT, "fontFamily": 1,
            "textAlign": "left", "verticalAlign": "top",
            "strokeColor": color or C["label"], "backgroundColor": "transparent",
            "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
            "roughness": 0, "opacity": 100, "angle": 0,
            "seed": seed(), "version": 1, "versionNonce": seed(),
            "isDeleted": False, "groupIds": [],
            "boundElements": None, "link": None, "locked": False,
            "containerId": None, "lineHeight": 1.25,
        })
    return els


def build():
    shapes = []
    arrows = []
    pos = {}
    y = 40

    # Row 1: Seed (hero, green — human input)
    els, p = make_rect("seed", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "success", "Seed product\n(interactive)")
    shapes.extend(els); pos["seed"] = p
    y += HERO_H + RANK_GAP

    # Row 2: Foundation cycle (blue)
    els, p = make_rect("foundation", COL_X - BOX_W // 2, y, BOX_W, BOX_H, "process", "Foundation\ncycle")
    shapes.extend(els); pos["foundation"] = p
    y += BOX_H + RANK_GAP

    # Row 3: Build feature (hero, blue — core action)
    els, p = make_rect("build", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "process", "Build feature\n(TDD)")
    shapes.extend(els); pos["build"] = p
    # Thicken hero stroke
    for el in shapes:
        if el.get("id") == "r_build":
            el["strokeWidth"] = 3
    y += HERO_H + RANK_GAP

    # Row 4: Evaluate (amber — quality gate)
    els, p = make_rect("evaluate", COL_X - BOX_W // 2, y, BOX_W, BOX_H, "warning", "Evaluate\n(5 lenses)")
    shapes.extend(els); pos["evaluate"] = p
    y += BOX_H + RANK_GAP

    # Row 5: Quality met? (diamond)
    els, p = make_diamond("quality", COL_X - DIAMOND_W // 2, y, DIAMOND_W, DIAMOND_H, "decision", "Quality\nmet?")
    shapes.extend(els); pos["quality"] = p
    y += DIAMOND_H + RANK_GAP

    # Row 6: Ship (green — success)
    els, p = make_rect("ship", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "success", "Ship to\nproduction")
    shapes.extend(els); pos["ship"] = p

    # --- Helpers ---
    def bot(n): return pos[n]["cx"], pos[n]["y"] + pos[n]["h"]
    def top(n): return pos[n]["cx"], pos[n]["y"]
    def rt(n): return pos[n]["x"] + pos[n]["w"], pos[n]["cy"]
    def lt(n): return pos[n]["x"], pos[n]["cy"]

    # --- Straight down arrows ---
    for src, dst in [("seed", "foundation"), ("foundation", "build"),
                     ("build", "evaluate"), ("evaluate", "quality")]:
        sx, sy = bot(src)
        ex, ey = top(dst)
        arrows.extend(make_arrow(f"{src}_{dst}", sx, sy, [[0, 0], [0, ey - sy]]))

    # quality -> ship (Yes, straight down)
    sx, sy = bot("quality")
    ex, ey = top("ship")
    arrows.extend(make_arrow("quality_ship", sx, sy, [[0, 0], [0, ey - sy]], "Yes"))

    # quality -> build (No — feedback loop, right side)
    qx, qy = rt("quality")
    bx, by = rt("build")
    loop_offset = 120
    arrows.extend(make_arrow("quality_build", qx, qy,
        [[0, 0], [loop_offset, 0], [loop_offset, by - qy], [0, by - qy]], "No"))

    # quality -> foundation (Decomposition wrong — backwards flow, LEFT side)
    # This is the Scale 2 pivot: analyse detects structural issue, inserts foundation
    qx_l, qy_l = lt("quality")
    fx_l, fy_l = lt("foundation")
    back_offset = -140
    arrows.extend(make_arrow("quality_foundation", qx_l, qy_l,
        [[0, 0], [back_offset, 0], [back_offset, fy_l - qy_l], [0, fy_l - qy_l]],
        "Restructure", "#c92a2a"))

    return {
        "type": "excalidraw",
        "version": 2,
        "source": "rouge-readme-diagram",
        "elements": shapes + arrows,
        "appState": {"viewBackgroundColor": C["bg"]},
        "files": {},
    }


if __name__ == "__main__":
    scene = build()
    out = Path(__file__).parent / "karpathy-loop.excalidraw"
    out.write_text(json.dumps(scene, indent=2))
    print(f"Generated: {out}")
