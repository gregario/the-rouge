"""Build the V3 Process Map diagram for The Rouge.

Four distinct horizontal panels stacked vertically:
  Panel 1: ROUGE SPEC (green) — Human Idea → Seeding Swarm (with artifact annotation)
  Panel 2: FOUNDATION (blue) — Foundation Build ↔ Foundation Eval
  Panel 3: STORY BUILDING LOOP (blue/amber) — TDD → Deploy → Milestone Eval → QA → Analyzing
  Panel 4: FINAL SHIP (green/blue) — Vision Check → Shipping → Final Review → Complete

Design rules applied:
  - Inputs enter TOP or LEFT of a box
  - Outputs exit BOTTOM or RIGHT of a box
  - Arrows always point INTO the destination (arrowhead touches box edge)
  - Annotations overlap bottom-right corner of parent box (consistent style)
  - No arrow passes through any box — route around
  - 8px grid alignment
"""

import json
import random
from pathlib import Path


def seed():
    return random.randint(1, 999999)


# Colour palette — warm organic
C = {
    "process":  {"fill": "#a5d8ff", "stroke": "#1864ab"},
    "decision": {"fill": "#ffc9c9", "stroke": "#c92a2a"},
    "success":  {"fill": "#b2f2bb", "stroke": "#2b8a3e"},
    "warning":  {"fill": "#ffe066", "stroke": "#e67700"},
    "arrow":    "#495057",
    "text":     "#212529",
    "label":    "#495057",
    "bg":       "#ffffff",
}

# Layout constants (8px grid)
BOX_W = 216
BOX_H = 88
HERO_W = 280
HERO_H = 104
SMALL_W = 144
SMALL_H = 48
RANK_GAP = 80
FONT_SIZE = 18
LABEL_FONT = 14
TITLE_FONT = 22
STROKE_W = 2.5
ARROW_W = 2
ROUGHNESS = 1.0
PANEL_PAD = 40
PANEL_GAP = 56


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
    pad_x = max(int(w * 0.20), 16)
    pad_y = max(int(h * 0.15), 12)
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
            "x": mid_x + 8, "y": mid_y - 18,
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
    """Small annotation box — gray stroke, transparent fill, small font."""
    rect_id = f"r_{nid}"
    text_id = f"t_{nid}"
    rect = {
        "type": "rectangle", "id": rect_id,
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": "#868e96", "backgroundColor": "#f8f9fa",
        "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": 0.5,
        "opacity": 80, "angle": 0,
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
        "fontSize": 12, "fontFamily": 1,
        "textAlign": "left", "verticalAlign": "middle",
        "strokeColor": "#495057", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": rect_id, "lineHeight": 1.25,
    }
    return [rect, text]


def make_label_text(tid, x, y, label, font_size=LABEL_FONT):
    return {
        "type": "text", "id": tid,
        "x": x, "y": y, "width": 240, "height": 28,
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


def make_panel(nid, x, y, w, h):
    return {
        "type": "rectangle", "id": f"panel_{nid}",
        "x": x, "y": y, "width": w, "height": h,
        "strokeColor": "#868e96", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1.5,
        "strokeStyle": "dashed", "roughness": ROUGHNESS,
        "opacity": 60, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "roundness": {"type": 3},
    }


# =========================================================================
# Edge helpers: inputs=top/left, outputs=bottom/right
# =========================================================================

def build():
    shapes = []
    arrows = []
    pos = {}

    # Edge accessors
    def bot(n):   return pos[n]["cx"], pos[n]["y"] + pos[n]["h"]
    def top_(n):  return pos[n]["cx"], pos[n]["y"]
    def rt(n):    return pos[n]["x"] + pos[n]["w"], pos[n]["cy"]
    def lt_(n):   return pos[n]["x"], pos[n]["cy"]
    def top_l(n): return pos[n]["x"] + 24, pos[n]["y"]  # top-left input
    def bot_r(n): return pos[n]["x"] + pos[n]["w"] - 24, pos[n]["y"] + pos[n]["h"]  # bottom-right output

    OX = 100  # origin x — room for left-side routing
    py = 40   # panel y cursor

    # =====================================================================
    # PANEL 1: ROUGE SPEC
    # =====================================================================
    p1_w = 720
    p1_h = 184
    shapes.append(make_panel("p1", OX, py, p1_w, p1_h))
    shapes.append(make_label_text("p1_title", OX + 16, py + 10, "ROUGE SPEC", TITLE_FONT))

    # Human Idea
    ny = py + 64
    nx = OX + PANEL_PAD + 16
    els, p = make_rect("human_idea", nx, ny, SMALL_W, SMALL_H, "success", "Human Idea")
    shapes.extend(els); pos["human_idea"] = p

    # Seeding Swarm (hero)
    nx += SMALL_W + 80
    els, p = make_rect("seeding", nx, ny - (HERO_H - SMALL_H) // 2, HERO_W, HERO_H,
                        "success", "Seeding Swarm\n7 Disciplines")
    shapes.extend(els); pos["seeding"] = p
    for el in shapes:
        if el.get("id") == "r_seeding": el["strokeWidth"] = 3

    # Annotation: artifacts — overlaps bottom-right corner of Seeding Swarm (FIX #1, #14)
    ann_x = pos["seeding"]["x"] + pos["seeding"]["w"] - 48
    ann_y = pos["seeding"]["y"] + pos["seeding"]["h"] - 12
    shapes.extend(make_annotation("seed_art", ann_x, ann_y, 176, 48,
                                   "vision.json  seed_spec\nstate.json"))

    # Arrows
    sx, sy = rt("human_idea"); ex = pos["seeding"]["x"]
    arrows.extend(make_arrow("p1_idea_seed", sx, sy, [[0, 0], [ex - sx, 0]]))

    # =====================================================================
    # PANEL 2: FOUNDATION
    # =====================================================================
    py += p1_h + PANEL_GAP
    p2_w = 620
    p2_h = 184
    shapes.append(make_panel("p2", OX, py, p2_w, p2_h))
    shapes.append(make_label_text("p2_title", OX + 16, py + 10, "FOUNDATION", TITLE_FONT))

    ny = py + 64
    nx = OX + PANEL_PAD + 32  # FIX #2: nudged right so "n" doesn't overlap FAIL arrow

    els, p = make_rect("fb", nx, ny, BOX_W, BOX_H, "process", "Foundation\nBuild")
    shapes.extend(els); pos["fb"] = p

    nx += BOX_W + 120
    els, p = make_rect("fe", nx, ny, BOX_W, BOX_H, "process", "Foundation\nEval")
    shapes.extend(els); pos["fe"] = p

    # Build → Eval (output right → input left)
    sx, sy = rt("fb"); ex = pos["fe"]["x"]
    arrows.extend(make_arrow("p2_fwd", sx, sy, [[0, 0], [ex - sx, 0]]))

    # Eval FAIL → Build (FIX #8: exit RIGHT of eval, go up, re-enter TOP of build)
    fe_rx, fe_ry = rt("fe")
    fb_tx, fb_ty = top_("fb")
    route_up = -48
    arrows.extend(make_arrow("p2_fail", fe_rx, fe_ry,
        [[0, 0], [48, 0], [48, route_up + (fb_ty - fe_ry)],
         [fb_tx - fe_rx, route_up + (fb_ty - fe_ry)], [fb_tx - fe_rx, fb_ty - fe_ry]],
        "FAIL", "#c92a2a", "dashed"))

    # =====================================================================
    # PANEL 3: STORY BUILDING LOOP
    # =====================================================================
    py += p2_h + PANEL_GAP
    p3_w = 1400  # wide enough for all elements with routing clearance
    p3_h = 760   # tall enough for 3 rows + annotations + routing
    shapes.append(make_panel("p3", OX, py, p3_w, p3_h))
    shapes.append(make_label_text("p3_title", OX + 16, py + 10, "STORY BUILDING LOOP", TITLE_FONT))

    # --- Row 1: Story Building → Deploy → Milestone Eval ---
    r1y = py + 64
    # Story Building: positioned so Change Spec (row 3) can be directly below for straight arrow
    story_x = OX + PANEL_PAD + 40
    els, p = make_rect("story", story_x, r1y, HERO_W, HERO_H, "process",
                        "Story\nBuilding\n(TDD)")
    shapes.extend(els); pos["story"] = p
    for el in shapes:
        if el.get("id") == "r_story": el["strokeWidth"] = 3

    # Deploy
    deploy_x = story_x + HERO_W + 120
    deploy_y = r1y + (HERO_H - SMALL_H) // 2
    els, p = make_rect("deploy", deploy_x, deploy_y, SMALL_W, SMALL_H, "process",
                        "Deploy\nStaging")
    shapes.extend(els); pos["deploy"] = p

    # Milestone Evaluation
    me_x = deploy_x + SMALL_W + 120
    els, p = make_rect("me", me_x, r1y, HERO_W, HERO_H, "warning",
                        "Milestone\nEvaluation")
    shapes.extend(els); pos["me"] = p

    # ME annotation: overlaps bottom-right corner (FIX #3, #14)
    me_ann_x = pos["me"]["x"] + pos["me"]["w"] - 56
    me_ann_y = pos["me"]["y"] + pos["me"]["h"] - 12
    shapes.extend(make_annotation("me_ann", me_ann_x, me_ann_y, 200, 56,
                                   "Test Integrity\nCode Review\nProduct Walk\nEvaluation"))

    # Next story: FIX #6 — exit BOTTOM of story, loop LEFT, re-enter LEFT of story
    story_bx, story_by = bot("story")
    story_lx, story_ly = lt_("story")
    arrows.extend(make_arrow("story_self", story_bx - 40, story_by,
        [[0, 0], [0, 32], [-80 - 40, 32], [-80 - 40, story_ly - story_by],
         [story_lx - (story_bx - 40), story_ly - story_by]],
        "next story"))

    # Story → Deploy (output right → input left)
    sx, sy = rt("story"); ex = pos["deploy"]["x"]
    arrows.extend(make_arrow("p3_s_d", sx, sy, [[0, 0], [ex - sx, 0]], "batch\ncomplete"))

    # Deploy → ME (output right → input left)
    sx, sy = rt("deploy"); ex = pos["me"]["x"]
    arrows.extend(make_arrow("p3_d_me", sx, sy, [[0, 0], [ex - sx, 0]]))

    # --- Row 2: QA Verdict + Milestone Fix ---
    r2y = r1y + HERO_H + RANK_GAP + 56  # extra space for ME annotation
    qa_dw, qa_dh = 160, 80  # smaller diamond
    qa_x = pos["me"]["cx"] - qa_dw // 2
    els, p = make_diamond("qa", qa_x, r2y, qa_dw, qa_dh, "decision", "QA\nVerdict")
    shapes.extend(els); pos["qa"] = p

    # ME → QA (output bottom → input top)
    sx, sy = bot("me"); _, ey = top_("qa")
    arrows.extend(make_arrow("p3_me_qa", sx, sy, [[0, 0], [0, ey - sy]]))

    # Milestone Fix — right of QA with gap
    mf_x = pos["qa"]["x"] + qa_dw + 96
    mf_y = r2y + (qa_dh - BOX_H) // 2
    els, p = make_rect("mf", mf_x, mf_y, BOX_W, BOX_H, "decision", "Milestone\nFix")
    shapes.extend(els); pos["mf"] = p

    # QA → MF (output right, FAIL)
    sx, sy = rt("qa"); ex = pos["mf"]["x"]
    arrows.extend(make_arrow("p3_qa_fail", sx, sy, [[0, 0], [ex - sx, 0]], "FAIL"))

    # MF → ME retry: FIX #9 — clean route. Exit TOP of MF, go straight up, enter RIGHT of ME
    mf_tx, mf_ty = top_("mf")
    me_rx, me_ry = rt("me")
    # Straight up to ME right-edge level, then left into ME
    arrows.extend(make_arrow("p3_mf_retry", mf_tx, mf_ty,
        [[0, 0], [0, me_ry - mf_ty], [me_rx - mf_tx, me_ry - mf_ty]],
        "retry"))

    # --- Row 3: Analyzing + Change Spec + Escalation ---
    r3y = r2y + qa_dh + RANK_GAP + 24

    # Analyzing — below QA
    ana_x = pos["qa"]["cx"] - BOX_W // 2
    els, p = make_rect("ana", ana_x, r3y, BOX_W, BOX_H, "warning", "Analyzing")
    shapes.extend(els); pos["ana"] = p

    # Analyzing annotation: overlaps bottom-right (FIX #4, #14)
    ana_ann_x = pos["ana"]["x"] + pos["ana"]["w"] - 40
    ana_ann_y = pos["ana"]["y"] + pos["ana"]["h"] - 8
    shapes.extend(make_annotation("ana_ann", ana_ann_x, ana_ann_y, 192, 44,
                                   "Root cause\nimprovement routing\nconfidence_adjusted"))

    # QA → Analyzing (output bottom, PASS → input top)
    sx, sy = bot("qa"); _, ey = top_("ana")
    arrows.extend(make_arrow("p3_qa_pass", sx, sy, [[0, 0], [0, ey - sy]], "PASS"))

    # Change Spec — directly below Story Building so arrow is straight vertical (FIX #7)
    cs_x = pos["story"]["cx"] - BOX_W // 2
    cs_y = r3y
    els, p = make_rect("cs", cs_x, cs_y, BOX_W, BOX_H, "process", "Change Spec\nGeneration")
    shapes.extend(els); pos["cs"] = p

    # Analyzing → Change Spec (output left → input right)
    sx, sy = lt_("ana"); ex, _ = rt("cs")
    arrows.extend(make_arrow("p3_ana_cs", sx, sy, [[0, 0], [ex - sx, 0]], "deepen/broaden"))

    # Change Spec → Story (FIX #7: straight UP, input enters LEFT of Story)
    # Since cs_cx aligns with story_cx, go straight up then enter left
    sx, sy = top_("cs"); s_lx, s_ly = lt_("story")
    # Go up to story level, then right into left edge
    arrows.extend(make_arrow("p3_cs_story", sx, sy,
        [[0, 0], [0, s_ly - sy], [s_lx - sx, s_ly - sy]]))

    # Escalation — right of Analyzing, with enough gap to not overlap annotation
    esc3_x = pos["mf"]["x"]  # align with milestone fix column
    esc3_y = r3y
    els, p = make_rect("esc3", esc3_x, esc3_y, BOX_W, BOX_H, "decision", "Escalation")
    shapes.extend(els); pos["esc3"] = p

    # Analyzing → Escalation (output right)
    sx, sy = rt("ana"); ex = pos["esc3"]["x"]
    arrows.extend(make_arrow("p3_ana_esc", sx, sy, [[0, 0], [ex - sx, 0]], "notify-human"))

    # Promote + next milestone: FIX #10 — route along RIGHT panel edge, no box crossing
    # Exit BOTTOM of analyzing, route right to panel edge, up to story level, LEFT into story TOP
    promote_route_x = OX + p3_w - PANEL_PAD  # right panel edge interior
    sx, sy = bot("ana")
    s_tx, s_ty = top_("story")
    # Go down a bit, right to panel edge, up to above story, left to story top
    arrows.extend(make_arrow("p3_promote", sx + 40, sy,
        [[0, 0], [0, 40], [promote_route_x - (sx + 40), 40],
         [promote_route_x - (sx + 40), s_ty - sy - 40],
         [s_tx - (sx + 40), s_ty - sy - 40], [s_tx - (sx + 40), s_ty - sy]],
        "promote +\nnext milestone"))

    # =====================================================================
    # PANEL 4: FINAL SHIP
    # =====================================================================
    py += p3_h + PANEL_GAP
    p4_w = 1400
    p4_h = 360  # FIX #12: tall enough for escalation + annotation
    shapes.append(make_panel("p4", OX, py, p4_w, p4_h))
    shapes.append(make_label_text("p4_title", OX + 16, py + 10, "FINAL SHIP", TITLE_FONT))

    r4y = py + 64
    r4x = OX + PANEL_PAD + 60

    els, p = make_rect("vc", r4x, r4y, BOX_W, BOX_H, "success", "Vision\nCheck")
    shapes.extend(els); pos["vc"] = p
    # VC annotation: overlaps bottom-right (FIX #5, #14)
    vc_ann_x = pos["vc"]["x"] + pos["vc"]["w"] - 40
    vc_ann_y = pos["vc"]["y"] + pos["vc"]["h"] - 8
    shapes.extend(make_annotation("vc_ann", vc_ann_x, vc_ann_y, 184, 44,
                                   "analytical only\nreads prior data\nglobal_improvements.json"))

    r4x += BOX_W + 120  # wider gap so annotation doesn't overlap Shipping
    els, p = make_rect("ship", r4x, r4y, BOX_W, BOX_H, "process",
                        "Shipping\nversion + PR\n+ deploy")
    shapes.extend(els); pos["ship"] = p

    r4x += BOX_W + 100
    els, p = make_rect("fr", r4x, r4y, BOX_W, BOX_H, "process", "Final\nReview")
    shapes.extend(els); pos["fr"] = p
    # FR annotation: overlaps bottom-right (FIX #5, #14)
    fr_ann_x = pos["fr"]["x"] + pos["fr"]["w"] - 40
    fr_ann_y = pos["fr"]["y"] + pos["fr"]["h"] - 8
    shapes.extend(make_annotation("fr_ann", fr_ann_x, fr_ann_y, 192, 44,
                                   "customer walkthrough\nscreenshots\nglobal_improvements.json"))

    r4x += BOX_W + 100
    els, p = make_rect("done", r4x, r4y, BOX_W, BOX_H, "success",
                        "Complete\nlearn-from-project")
    shapes.extend(els); pos["done"] = p

    # VC → Ship (right → left)
    sx, sy = rt("vc"); ex = pos["ship"]["x"]
    arrows.extend(make_arrow("p4_vc_ship", sx, sy, [[0, 0], [ex - sx, 0]], "aligned"))

    # Ship → FR (right → left)
    sx, sy = rt("ship"); ex = pos["fr"]["x"]
    arrows.extend(make_arrow("p4_ship_fr", sx, sy, [[0, 0], [ex - sx, 0]]))

    # FR → Complete (right → left)
    sx, sy = rt("fr"); ex = pos["done"]["x"]
    arrows.extend(make_arrow("p4_fr_done", sx, sy, [[0, 0], [ex - sx, 0]], "ship"))

    # Escalation in Panel 4 — below and between Ship and FR (FIX #12: inside panel)
    esc4_x = pos["ship"]["cx"]  # between ship and FR
    esc4_y = r4y + BOX_H + RANK_GAP + 40
    els, p = make_rect("esc4", esc4_x, esc4_y, BOX_W, BOX_H, "decision", "Escalation")
    shapes.extend(els); pos["esc4"] = p

    # FR → Escalation (output bottom → input top)  FIX: major-rework
    sx, sy = bot("fr")
    ex, ey = top_("esc4")
    arrows.extend(make_arrow("p4_fr_esc", sx, sy,
        [[0, 0], [0, 24], [ex - sx, 24], [ex - sx, ey - sy]], "major-rework"))

    # VC → Escalation (FIX #13: route BELOW VC annotation, not through Ship)
    # Exit bottom of VC, go down past annotation, right to escalation
    sx, sy = bot("vc")
    ex, ey = lt_("esc4")
    # Route below VC annotation (ann is at vc_ann_y + 44)
    below_ann = vc_ann_y + 44 + 16
    arrows.extend(make_arrow("p4_vc_esc", sx, sy,
        [[0, 0], [0, below_ann - sy], [ex - sx, below_ann - sy], [ex - sx, ey - sy]],
        "diverging"))

    # FR → Change Spec (refine) FIX #11: route along LEFT edge, enter CS BOTTOM (going back up)
    sx, sy = lt_("fr")
    tx, ty = bot("cs")
    route_left = OX - 24  # left of all panels
    arrows.extend(make_arrow("p4_refine", sx, sy,
        [[0, 0], [route_left - sx, 0], [route_left - sx, ty - sy], [tx - sx, ty - sy]],
        "refine"))

    # =====================================================================
    # INTERLINKING ARROWS BETWEEN PANELS
    # =====================================================================

    # Panel 1 → Panel 2: Seeding bottom → Foundation Build top (input)
    sx, sy = bot("seeding")
    tx, ty = top_("fb")
    arrows.extend(make_arrow("link_p1_p2", sx, sy,
        [[0, 0], [0, (ty - sy) * 0.5], [tx - sx, (ty - sy) * 0.5], [tx - sx, ty - sy]]))

    # Panel 2 → Panel 3: Foundation Eval bottom → Story Building top (PASS, input)
    sx, sy = bot("fe")
    tx, ty = top_("story")
    arrows.extend(make_arrow("link_p2_p3", sx, sy,
        [[0, 0], [0, (ty - sy) * 0.4], [tx - sx, (ty - sy) * 0.4], [tx - sx, ty - sy]],
        "PASS"))

    # Panel 3 → Panel 4: Analyzing bottom → Vision Check top (all milestones done)
    sx, sy = bot("ana")
    tx, ty = top_("vc")
    # Route: go down from ana, route left to VC column, down into VC top
    arrows.extend(make_arrow("link_p3_p4", sx - 40, sy,
        [[0, 0], [0, 56], [tx - (sx - 40), 56], [tx - (sx - 40), ty - sy]],
        "all milestones\ndone"))

    # =====================================================================
    # SIDE COLUMN: KEY ARTIFACTS
    # =====================================================================
    art_x = OX + p3_w + 60
    art_y = 80
    art_w = 200
    art_h = 36
    art_gap = 8

    shapes.append(make_label_text("art_title", art_x, art_y - 28, "KEY ARTIFACTS", TITLE_FONT))

    for i, name in enumerate([
        "state.json", "cycle_context.json", "vision.json",
        "global_improvements.json", "journey.json", "feedback.json",
    ]):
        shapes.extend(make_annotation(f"art_{i}", art_x, art_y + i * (art_h + art_gap),
                                       art_w, art_h, name))

    return {
        "type": "excalidraw",
        "version": 2,
        "source": "rouge-v3-process-map",
        "elements": shapes + arrows,
        "appState": {"viewBackgroundColor": C["bg"]},
        "files": {},
    }


if __name__ == "__main__":
    scene = build()
    out = Path(__file__).parent / "v3-process-map.excalidraw"
    out.write_text(json.dumps(scene, indent=2))
    print(f"Generated: {out}")
