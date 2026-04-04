"""Build the V2 Process Map diagram for The Rouge.

Shows: Seeding -> Foundation -> Story Loop -> Milestone Eval -> Analyzing -> Vision Check -> Ship
With feedback loops, escalation paths, and artifact annotations.

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
BOX_H = 88
HERO_W = 304
HERO_H = 120
DIAMOND_W = 240
DIAMOND_H = 112
SMALL_W = 144
SMALL_H = 56
RANK_GAP = 80
COL_X = 420
FONT_SIZE = 18
LABEL_FONT = 15
STROKE_W = 2.5
ARROW_W = 2
ROUGHNESS = 1.0


def make_rect(nid, x, y, w, h, role, label, stroke_w=None, stroke_style="solid"):
    colors = C[role]
    rect_id = f"r_{nid}"
    text_id = f"t_{nid}"
    rect = {
        "type": "rectangle", "id": rect_id,
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": colors["stroke"], "backgroundColor": colors["fill"],
        "fillStyle": "hachure", "strokeWidth": stroke_w or STROKE_W,
        "strokeStyle": stroke_style, "roughness": ROUGHNESS,
        "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": [{"id": text_id, "type": "text"}],
        "link": None, "locked": False, "roundness": {"type": 3},
    }
    pad_x = int(w * 0.20)
    pad_y = int(h * 0.15)
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


def make_arrow(aid, sx, sy, points, label=None, color=None, stroke_style="solid"):
    els = []
    arrow = {
        "type": "arrow", "id": f"a_{aid}",
        "x": sx, "y": sy,
        "width": max(abs(max(p[0] for p in points) - min(p[0] for p in points)), 1),
        "height": max(abs(max(p[1] for p in points) - min(p[1] for p in points)), 1),
        "strokeColor": color or C["arrow"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": ARROW_W, "strokeStyle": stroke_style,
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
            "width": 120, "height": 24,
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


def make_annotation(nid, x, y, w, h, label):
    """Small annotation box with gray stroke, transparent fill."""
    rect_id = f"r_{nid}"
    text_id = f"t_{nid}"
    rect = {
        "type": "rectangle", "id": rect_id,
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": "#868e96", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": ROUGHNESS,
        "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": [{"id": text_id, "type": "text"}],
        "link": None, "locked": False, "roundness": {"type": 3},
    }
    text = {
        "type": "text", "id": text_id,
        "x": x + 8, "y": y + 4,
        "width": w - 16, "height": h - 8,
        "text": label, "originalText": label,
        "fontSize": 13, "fontFamily": 1,
        "textAlign": "center", "verticalAlign": "middle",
        "strokeColor": C["text"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": rect_id, "lineHeight": 1.25,
    }
    return [rect, text]


def make_label_text(tid, x, y, label, font_size=LABEL_FONT):
    """Standalone text label (not bound to a shape)."""
    return {
        "type": "text", "id": tid,
        "x": x, "y": y,
        "width": 160, "height": 24,
        "text": label, "originalText": label,
        "fontSize": font_size, "fontFamily": 1,
        "textAlign": "left", "verticalAlign": "top",
        "strokeColor": C["text"], "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": None, "lineHeight": 1.25,
    }


def build():
    shapes = []
    arrows = []
    pos = {}
    y = 40

    # --- Row 1: SEEDING (hero, green) ---
    els, p = make_rect("seeding", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "success",
                        "SEEDING\n(Interactive)\n7 disciplines")
    shapes.extend(els); pos["seeding"] = p
    y += HERO_H + RANK_GAP

    # --- Row 2: FOUNDATION BUILD (primary, blue) ---
    els, p = make_rect("found_build", COL_X - BOX_W // 2, y, BOX_W, BOX_H, "process",
                        "Foundation\nBuild")
    shapes.extend(els); pos["found_build"] = p

    # Row 2b: FOUNDATION EVAL (primary, blue) — right of Foundation Build
    fe_x = pos["found_build"]["x"] + BOX_W + 280 - BOX_W
    els, p = make_rect("found_eval", fe_x, y, BOX_W, BOX_H, "process",
                        "Foundation\nEval")
    shapes.extend(els); pos["found_eval"] = p
    y += BOX_H + RANK_GAP

    # --- Row 3: STORY BUILDING (hero, blue) ---
    els, p = make_rect("story", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "process",
                        "Story\nBuilding\n(TDD)")
    shapes.extend(els); pos["story"] = p
    # Thicken hero stroke
    for el in shapes:
        if el.get("id") == "r_story":
            el["strokeWidth"] = 3

    # Dashed group enclosure around Story Building
    group_pad = 24
    group_x = pos["story"]["x"] - group_pad
    group_y = pos["story"]["y"] - group_pad - 20  # extra for label
    group_w = pos["story"]["w"] + group_pad * 2
    group_h = pos["story"]["h"] + group_pad * 2 + 20
    shapes.append({
        "type": "rectangle", "id": "r_story_group",
        "x": group_x, "y": group_y, "width": group_w, "height": group_h,
        "strokeColor": "#868e96", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1.5,
        "strokeStyle": "dashed", "roughness": ROUGHNESS,
        "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "roundness": {"type": 3},
    })
    shapes.append(make_label_text("story_group_label", group_x + 8, group_y + 4,
                                   "Story Loop (inner, fast)", 13))
    y += HERO_H + RANK_GAP

    # --- Row 4: DEPLOY STAGING (small, blue) ---
    els, p = make_rect("deploy", COL_X - SMALL_W // 2, y, SMALL_W, SMALL_H, "process",
                        "Deploy\nStaging")
    shapes.extend(els); pos["deploy"] = p
    y += SMALL_H + RANK_GAP

    # --- Row 5: MILESTONE EVAL (hero, amber) ---
    els, p = make_rect("milestone_eval", COL_X - HERO_W // 2, y, HERO_W, HERO_H, "warning",
                        "Milestone Evaluation\nTest Integrity + Code Review\n+ Product Walk + Eval")
    shapes.extend(els); pos["milestone_eval"] = p

    # Row 5b: QA VERDICT (diamond, coral) — right of Milestone Eval
    qv_x = pos["milestone_eval"]["x"] + HERO_W + 320 - HERO_W
    els, p = make_diamond("qa_verdict", qv_x, y + (HERO_H - DIAMOND_H) // 2,
                           DIAMOND_W, DIAMOND_H, "decision", "QA\nVerdict")
    shapes.extend(els); pos["qa_verdict"] = p

    # Row 5c: MILESTONE FIX (primary, coral) — right of QA Verdict
    mf_x = pos["qa_verdict"]["x"] + DIAMOND_W + 280 - DIAMOND_W
    els, p = make_rect("milestone_fix", mf_x, y + (HERO_H - BOX_H) // 2,
                        BOX_W, BOX_H, "decision", "Milestone\nFix")
    shapes.extend(els); pos["milestone_fix"] = p
    y += HERO_H + RANK_GAP

    # --- Row 6: ANALYZING (primary, amber) ---
    els, p = make_rect("analyzing", COL_X - BOX_W // 2, y, BOX_W, BOX_H, "warning",
                        "Analyzing\nRoot cause +\nimprovement routing")
    shapes.extend(els); pos["analyzing"] = p

    # Row 6b: CHANGE SPEC (primary, blue) — left of Analyzing
    cs_x = pos["analyzing"]["x"] - 320
    els, p = make_rect("change_spec", cs_x, y, BOX_W, BOX_H, "process",
                        "Change Spec\nGeneration")
    shapes.extend(els); pos["change_spec"] = p

    # Row 6c: ESCALATION (primary, coral) — right of Analyzing
    esc_x = pos["analyzing"]["x"] + BOX_W + 320 - BOX_W
    els, p = make_rect("escalation", esc_x, y, BOX_W, BOX_H, "decision",
                        "Escalation\n(feedback.json)")
    shapes.extend(els); pos["escalation"] = p
    y += BOX_H + RANK_GAP

    # --- Row 7: VISION CHECK (primary, green) ---
    els, p = make_rect("vision_check", COL_X - BOX_W // 2, y, BOX_W, BOX_H, "success",
                        "Vision\nCheck")
    shapes.extend(els); pos["vision_check"] = p

    # Row 7b: SHIPPING (primary, blue) — right of Vision Check
    sh_x = pos["vision_check"]["x"] + BOX_W + 280 - BOX_W
    els, p = make_rect("shipping", sh_x, y, BOX_W, BOX_H, "process",
                        "Shipping\nversion + PR + deploy")
    shapes.extend(els); pos["shipping"] = p

    # Row 7c: FINAL REVIEW (primary, blue) — right of Shipping
    fr_x = pos["shipping"]["x"] + BOX_W + 280 - BOX_W
    els, p = make_rect("final_review", fr_x, y, BOX_W, BOX_H, "process",
                        "Final\nReview")
    shapes.extend(els); pos["final_review"] = p
    y += BOX_H + RANK_GAP

    # --- Row 8: COMPLETE (primary, green) — below Final Review ---
    els, p = make_rect("complete", pos["final_review"]["cx"] - BOX_W // 2, y, BOX_W, BOX_H,
                        "success", "Complete\nlearn-from-project")
    shapes.extend(els); pos["complete"] = p

    # --- Helpers ---
    def bot(n): return pos[n]["cx"], pos[n]["y"] + pos[n]["h"]
    def top(n): return pos[n]["cx"], pos[n]["y"]
    def rt(n):  return pos[n]["x"] + pos[n]["w"], pos[n]["cy"]
    def lt(n):  return pos[n]["x"], pos[n]["cy"]

    # =============================================
    # ARROWS — Main flow (straight down)
    # =============================================

    # Seeding → Foundation Build
    sx, sy = bot("seeding"); ex, ey = top("found_build")
    arrows.extend(make_arrow("seed_found", sx, sy, [[0, 0], [0, ey - sy]]))

    # Foundation Build → Story Building (label: PASS)
    sx, sy = bot("found_build"); ex, ey = top("story")
    arrows.extend(make_arrow("found_story", sx, sy, [[0, 0], [0, ey - sy]], "PASS"))

    # Story Building → Deploy Staging (label: batch complete)
    sx, sy = bot("story"); ex, ey = top("deploy")
    arrows.extend(make_arrow("story_deploy", sx, sy, [[0, 0], [0, ey - sy]], "batch complete"))

    # Deploy Staging → Milestone Eval
    sx, sy = bot("deploy"); ex, ey = top("milestone_eval")
    arrows.extend(make_arrow("deploy_eval", sx, sy, [[0, 0], [0, ey - sy]]))

    # =============================================
    # ARROWS — Horizontal
    # =============================================

    # Foundation Build → Foundation Eval (right)
    sx, sy = rt("found_build"); ex, ey = lt("found_eval")
    arrows.extend(make_arrow("found_to_eval", sx, sy, [[0, 0], [ex - sx, 0]]))

    # Milestone Eval → QA Verdict (right)
    sx, sy = rt("milestone_eval"); ex, ey = lt("qa_verdict")
    arrows.extend(make_arrow("eval_to_qa", sx, sy, [[0, 0], [ex - sx, 0]]))

    # =============================================
    # ARROWS — Decision routing from QA Verdict
    # =============================================

    # QA Verdict → Milestone Fix (right, FAIL)
    sx, sy = rt("qa_verdict"); ex, ey = lt("milestone_fix")
    arrows.extend(make_arrow("qa_fail", sx, sy, [[0, 0], [ex - sx, 0]], "FAIL"))

    # QA Verdict → Analyzing (down, PASS)
    sx, sy = bot("qa_verdict")
    ex, ey = top("analyzing")
    # Route: down from diamond bottom, then left to analyzing center, then down
    arrows.extend(make_arrow("qa_pass", sx, sy,
        [[0, 0], [0, (ey - sy) * 0.5], [ex - sx, (ey - sy) * 0.5], [ex - sx, ey - sy]], "PASS"))

    # =============================================
    # ARROWS — Feedback loops
    # =============================================

    # Foundation Eval → Foundation Build (loop back left, dashed red, FAIL)
    sx, sy = rt("found_eval")
    tx, ty = rt("found_build")
    # Go up from top of found_eval, across to above found_build, down into top
    fe_top_x, fe_top_y = top("found_eval")
    fb_top_x, _ = top("found_build")
    arrows.extend(make_arrow("eval_fail", fe_top_x, fe_top_y,
        [[0, 0], [0, -40], [fb_top_x - fe_top_x, -40], [fb_top_x - fe_top_x, 0]],
        "FAIL", "#c92a2a", "dashed"))

    # Milestone Fix → Milestone Eval (loop back above, retry)
    mf_top_x, mf_top_y = top("milestone_fix")
    me_top_x, _ = top("milestone_eval")
    # Go up from milestone fix top, left across to milestone eval, down into top
    arrows.extend(make_arrow("fix_retry", mf_top_x, mf_top_y,
        [[0, 0], [0, -40], [me_top_x - mf_top_x, -40], [me_top_x - mf_top_x, 0]],
        "retry"))

    # Story Building → Story Building (self-loop on right side, next story)
    sr_x, sr_y = rt("story")
    loop_off = 96
    arrows.extend(make_arrow("story_self", sr_x, sr_y,
        [[0, 0], [loop_off, 0], [loop_off, -40], [0, -40]], "next story"))

    # =============================================
    # ARROWS — From Analyzing
    # =============================================

    # Analyzing → Change Spec (left, deepen/broaden)
    sx, sy = lt("analyzing"); ex, ey = rt("change_spec")
    arrows.extend(make_arrow("ana_change", sx, sy, [[0, 0], [ex - sx, 0]], "deepen/broaden"))

    # Analyzing → Escalation (right, notify-human)
    sx, sy = rt("analyzing"); ex, ey = lt("escalation")
    arrows.extend(make_arrow("ana_escalate", sx, sy, [[0, 0], [ex - sx, 0]], "notify-human"))

    # Analyzing → Vision Check (down, all milestones done)
    sx, sy = bot("analyzing"); ex, ey = top("vision_check")
    arrows.extend(make_arrow("ana_vision", sx, sy, [[0, 0], [0, ey - sy]], "all milestones\ndone"))

    # Analyzing → Story Building (loop back up-right, promote + next milestone)
    sx, sy = rt("analyzing")
    tx, ty = rt("story")
    route_off = 96
    arrows.extend(make_arrow("ana_story", sx, sy,
        [[0, 0], [route_off, 0], [route_off, ty - sy], [0, ty - sy]],
        "promote +\nnext milestone"))

    # =============================================
    # ARROWS — Change Spec routing
    # =============================================

    # Change Spec → Story Building (up)
    sx, sy = top("change_spec")
    tx, ty = lt("story")
    # Go up to story level, then right into story left edge
    arrows.extend(make_arrow("change_story", sx, sy,
        [[0, 0], [0, ty - sy], [tx - sx, ty - sy]]))

    # =============================================
    # ARROWS — Vision Check + Shipping + Final Review
    # =============================================

    # Vision Check → Shipping (right, aligned)
    sx, sy = rt("vision_check"); ex, ey = lt("shipping")
    arrows.extend(make_arrow("vision_ship", sx, sy, [[0, 0], [ex - sx, 0]], "aligned"))

    # Vision Check → Escalation (right-up diagonal, diverging)
    sx, sy = rt("vision_check")
    ex, ey = lt("escalation")
    # Route up-right from vision check to escalation (one row up)
    arrows.extend(make_arrow("vision_escalate", sx, sy,
        [[0, 0], [40, 0], [40, ey - sy], [ex - sx, ey - sy]],
        "diverging"))

    # Shipping → Final Review (right)
    sx, sy = rt("shipping"); ex, ey = lt("final_review")
    arrows.extend(make_arrow("ship_final", sx, sy, [[0, 0], [ex - sx, 0]]))

    # Final Review → Complete (down, ship)
    sx, sy = bot("final_review"); ex, ey = top("complete")
    arrows.extend(make_arrow("final_complete", sx, sy, [[0, 0], [0, ey - sy]], "ship"))

    # Final Review → Change Spec (loop back left-up, refine)
    sx, sy = lt("final_review")
    tx, ty = top("change_spec")
    # Go left to change_spec x, then up to change_spec top
    arrows.extend(make_arrow("final_change", sx, sy,
        [[0, 0], [tx - sx, 0], [tx - sx, ty - sy]],
        "refine"))

    # Final Review → Escalation (up, major-rework)
    sx, sy = top("final_review")
    tx, ty = bot("escalation")
    arrows.extend(make_arrow("final_escalate", sx, sy,
        [[0, 0], [0, ty - sy]], "major-rework"))

    # =============================================
    # SIDE ELEMENTS — Key Artifacts (right column)
    # =============================================

    art_x = COL_X + 500
    art_y = 60
    art_w = 176  # wider than SMALL_W to fit "global_improvements.json"
    art_h = 40
    art_gap = 8

    shapes.append(make_label_text("artifacts_title", art_x, art_y - 28, "KEY ARTIFACTS", LABEL_FONT))

    artifact_names = [
        "state.json",
        "cycle_context.json",
        "vision.json",
        "global_improvements.json",
        "journey.json",
        "feedback.json",
    ]
    for i, name in enumerate(artifact_names):
        ay = art_y + i * (art_h + art_gap)
        shapes.extend(make_annotation(f"art_{i}", art_x, ay, art_w, art_h, name))

    # =============================================
    # LEFT ANNOTATION — Improvement Flow
    # =============================================

    imp_x = pos["change_spec"]["x"] - 8
    imp_y = pos["change_spec"]["y"] + pos["change_spec"]["h"] + 16
    imp_text = "IMPROVEMENT FLOW\nimprovement_items[]\nthis-milestone \u2192 deepen\nglobal \u2192 persist\nfuture \u2192 drop"
    shapes.extend(make_annotation("improvement", imp_x, imp_y, 220, 104, imp_text))

    return {
        "type": "excalidraw",
        "version": 2,
        "source": "rouge-v2-process-map",
        "elements": shapes + arrows,
        "appState": {"viewBackgroundColor": C["bg"]},
        "files": {},
    }


if __name__ == "__main__":
    scene = build()
    out = Path(__file__).parent / "v2-process-map.excalidraw"
    out.write_text(json.dumps(scene, indent=2))
    print(f"Generated: {out}")
