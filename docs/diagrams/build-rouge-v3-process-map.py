"""Build the V3 Process Map diagram for The Rouge.

Four distinct horizontal panels stacked vertically:
  Panel 1: ROUGE SPEC (green) — Human Idea → Seeding Swarm (8 Disciplines) with artifact annotation
  Panel 2: FOUNDATION (blue) — Foundation Build ↔ Foundation Eval (with infrastructure_manifest annotation)
  Panel 3: STORY BUILDING LOOP (blue/amber) — Story Building → Deploy → Milestone Eval → QA → Analyzing
             + SAFETY LAYER annotation + promote annotation with git tag
  Panel 4: FINAL SHIP + SELF-IMPROVEMENT — Vision Check → Shipping → Final Review → Complete → Self-Improvement

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

    # Seeding Swarm (hero) — V3: "8 Disciplines"
    nx += SMALL_W + 80
    els, p = make_rect("seeding", nx, ny - (HERO_H - SMALL_H) // 2, HERO_W, HERO_H,
                        "success", "Seeding Swarm\n8 Disciplines")
    shapes.extend(els); pos["seeding"] = p
    for el in shapes:
        if el.get("id") == "r_seeding": el["strokeWidth"] = 3

    # V3 annotation: task_ledger.json / infrastructure_manifest.json / vision.json
    # No state.json reference
    ann_x = pos["seeding"]["x"] + pos["seeding"]["w"] - 48
    ann_y = pos["seeding"]["y"] + pos["seeding"]["h"] - 12
    shapes.extend(make_annotation("seed_art", ann_x, ann_y, 200, 56,
                                   "task_ledger.json\ninfrastructure_manifest.json\nvision.json"))

    # Arrows
    sx, sy = rt("human_idea"); ex = pos["seeding"]["x"]
    arrows.extend(make_arrow("p1_idea_seed", sx, sy, [[0, 0], [ex - sx, 0]]))

    # =====================================================================
    # PANEL 2: FOUNDATION (simplified)
    # =====================================================================
    py += p1_h + PANEL_GAP
    p2_w = p1_w  # same width as Rouge Spec panel
    p2_h = 184
    shapes.append(make_panel("p2", OX, py, p2_w, p2_h))
    shapes.append(make_label_text("p2_title", OX + 16, py + 10, "FOUNDATION", TITLE_FONT))

    ny = py + 64
    nx = OX + PANEL_PAD + 32  # nudged right so "n" doesn't overlap FAIL arrow

    els, p = make_rect("fb", nx, ny, BOX_W, BOX_H, "process", "Foundation\nBuild")
    shapes.extend(els); pos["fb"] = p

    # V3: small annotation on Foundation Build about infrastructure_manifest
    fb_ann_x = pos["fb"]["x"] + pos["fb"]["w"] - 40
    fb_ann_y = pos["fb"]["y"] + pos["fb"]["h"] - 8
    shapes.extend(make_annotation("fb_ann", fb_ann_x, fb_ann_y, 216, 44,
                                   "Reads infrastructure_manifest\n(decisions already made)"))

    nx += BOX_W + 120
    els, p = make_rect("fe", nx, ny, BOX_W, BOX_H, "process", "Foundation\nEval")
    shapes.extend(els); pos["fe"] = p

    # Build → Eval (output right → input left)
    sx, sy = rt("fb"); ex = pos["fe"]["x"]
    arrows.extend(make_arrow("p2_fwd", sx, sy, [[0, 0], [ex - sx, 0]]))

    # Eval FAIL → Build (exit RIGHT of eval, go up, re-enter TOP of build)
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
    p3_h = 800   # extra height for SAFETY LAYER annotation at bottom
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

    # ME annotation: overlaps bottom-right corner
    me_ann_x = pos["me"]["x"] + pos["me"]["w"] - 56
    me_ann_y = pos["me"]["y"] + pos["me"]["h"] - 12
    shapes.extend(make_annotation("me_ann", me_ann_x, me_ann_y, 200, 56,
                                   "Test Integrity\nCode Review\nProduct Walk\nEvaluation"))

    # Next story: exit CENTRE BOTTOM of story, loop LEFT outside, re-enter LEFT of story
    story_bx, story_by = bot("story")
    story_lx, story_ly = lt_("story")
    loop_left_x = pos["story"]["x"] - 72  # route left of story box
    arrows.extend(make_arrow("story_self", story_bx, story_by,
        [[0, 0], [0, 32], [loop_left_x - story_bx, 32],
         [loop_left_x - story_bx, story_ly - story_by],
         [story_lx - story_bx, story_ly - story_by]],
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

    # QA → MF (output right, FAIL — red dashed)
    sx, sy = rt("qa"); ex = pos["mf"]["x"]
    arrows.extend(make_arrow("p3_qa_fail", sx, sy, [[0, 0], [ex - sx, 0]], "FAIL",
                              "#c92a2a", "dashed"))

    # MF → ME retry: exit TOP of MF, go straight up, enter RIGHT of ME
    mf_tx, mf_ty = top_("mf")
    me_rx, me_ry = rt("me")
    arrows.extend(make_arrow("p3_mf_retry", mf_tx, mf_ty,
        [[0, 0], [0, me_ry - mf_ty], [me_rx - mf_tx, me_ry - mf_ty]],
        "retry"))

    # --- Row 3: Analyzing + Change Spec + Escalation ---
    r3y = r2y + qa_dh + RANK_GAP + 24

    # Analyzing — below QA
    ana_x = pos["qa"]["cx"] - BOX_W // 2
    els, p = make_rect("ana", ana_x, r3y, BOX_W, BOX_H, "warning", "Analyzing")
    shapes.extend(els); pos["ana"] = p

    # Analyzing annotation: overlaps bottom-right
    ana_ann_x = pos["ana"]["x"] + pos["ana"]["w"] - 40
    ana_ann_y = pos["ana"]["y"] + pos["ana"]["h"] - 8
    shapes.extend(make_annotation("ana_ann", ana_ann_x, ana_ann_y, 192, 44,
                                   "Root cause\nimprovement routing\nconfidence_adjusted"))

    # QA → Analyzing (output bottom, PASS → input top)
    sx, sy = bot("qa"); _, ey = top_("ana")
    arrows.extend(make_arrow("p3_qa_pass", sx, sy, [[0, 0], [0, ey - sy]], "PASS"))

    # Change Spec — directly below Story Building so arrow is straight vertical
    cs_x = pos["story"]["cx"] - BOX_W // 2
    cs_y = r3y
    els, p = make_rect("cs", cs_x, cs_y, BOX_W, BOX_H, "process", "Change Spec\nGeneration")
    shapes.extend(els); pos["cs"] = p

    # Analyzing → Change Spec (output left → input right)
    sx, sy = lt_("ana"); ex, _ = rt("cs")
    arrows.extend(make_arrow("p3_ana_cs", sx, sy, [[0, 0], [ex - sx, 0]], "deepen/broaden"))

    # Change Spec → Story: go UP from CS top, merge with loop_left_x, into story left edge
    cs_tx, cs_ty = top_("cs")
    s_lx, s_ly = lt_("story")
    halfway_y = cs_ty + (s_ly - cs_ty) * 0.5
    arrows.extend(make_arrow("p3_cs_story", cs_tx, cs_ty,
        [[0, 0], [0, halfway_y - cs_ty],
         [loop_left_x - cs_tx, halfway_y - cs_ty],
         [loop_left_x - cs_tx, s_ly - cs_ty],
         [s_lx - cs_tx, s_ly - cs_ty]]))

    # Escalation — right of Analyzing, align with milestone fix column
    esc3_x = pos["mf"]["x"]
    esc3_y = r3y
    els, p = make_rect("esc3", esc3_x, esc3_y, BOX_W, BOX_H, "decision", "Escalation")
    shapes.extend(els); pos["esc3"] = p

    # Analyzing → Escalation (output right)
    sx, sy = rt("ana"); ex = pos["esc3"]["x"]
    arrows.extend(make_arrow("p3_ana_esc", sx, sy, [[0, 0], [ex - sx, 0]], "notify-human"))

    # V3: Promote path — route along RIGHT panel edge with git tag annotation
    promote_route_x = OX + p3_w - PANEL_PAD  # right panel edge interior
    sx, sy = bot("ana")
    s_tx, s_ty = top_("story")
    arrows.extend(make_arrow("p3_promote", sx + 40, sy,
        [[0, 0], [0, 40], [promote_route_x - (sx + 40), 40],
         [promote_route_x - (sx + 40), s_ty - sy - 40],
         [s_tx - (sx + 40), s_ty - sy - 40], [s_tx - (sx + 40), s_ty - sy]],
        "promote +\nnext milestone"))

    # V3: Small annotation on the promote path — git tag milestone/{name}
    # Positioned near the top of the promote route, right side
    promote_tag_x = promote_route_x - 8
    promote_tag_y = py + 64  # near story row level
    shapes.extend(make_annotation("promote_tag", promote_tag_x, promote_tag_y, 176, 28,
                                   "git tag milestone/{name}"))

    # V3: SAFETY LAYER — prominent annotation overlapping bottom of Panel 3
    safety_w = 480
    safety_h = 80
    safety_x = OX + (p3_w - safety_w) // 2  # centred horizontally in panel
    safety_y = py + p3_h - safety_h - 16    # overlaps bottom of panel
    # Use a distinct warning-styled annotation for prominence
    safety_rect_id = "r_safety"
    safety_text_id = "t_safety"
    safety_label = "SAFETY LAYER\nMilestone lock | Spin detection\nCost caps | Story dedup\nDeploy blocking | Audit trail"
    shapes.append({
        "type": "rectangle", "id": safety_rect_id,
        "x": safety_x, "y": safety_y, "width": safety_w, "height": safety_h,
        "strokeColor": "#e67700", "backgroundColor": "#fff3bf",
        "fillStyle": "solid", "strokeWidth": 2,
        "strokeStyle": "solid", "roughness": 0.5,
        "opacity": 90, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": [{"id": safety_text_id, "type": "text"}],
        "link": None, "locked": False, "roundness": {"type": 3},
    })
    shapes.append({
        "type": "text", "id": safety_text_id,
        "x": safety_x + 12, "y": safety_y + 6,
        "width": safety_w - 24, "height": safety_h - 12,
        "text": safety_label, "originalText": safety_label,
        "fontSize": 13, "fontFamily": 1,
        "textAlign": "center", "verticalAlign": "middle",
        "strokeColor": "#7c4f00", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "seed": seed(), "version": 1, "versionNonce": seed(),
        "isDeleted": False, "groupIds": [],
        "boundElements": None, "link": None, "locked": False,
        "containerId": safety_rect_id, "lineHeight": 1.25,
    })

    # =====================================================================
    # PANEL 4: FINAL SHIP + SELF-IMPROVEMENT
    # =====================================================================
    py += p3_h + PANEL_GAP
    p4_w = 1400
    p4_h = 480  # extra height for Self-Improvement box below Complete
    shapes.append(make_panel("p4", OX, py, p4_w, p4_h))
    shapes.append(make_label_text("p4_title", OX + 16, py + 10, "FINAL SHIP + SELF-IMPROVEMENT", TITLE_FONT))

    r4y = py + 64
    r4x = OX + PANEL_PAD + 60

    els, p = make_rect("vc", r4x, r4y, BOX_W, BOX_H, "success", "Vision\nCheck")
    shapes.extend(els); pos["vc"] = p
    # VC annotation: overlaps bottom-right
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
    # FR annotation: overlaps bottom-right
    fr_ann_x = pos["fr"]["x"] + pos["fr"]["w"] - 40
    fr_ann_y = pos["fr"]["y"] + pos["fr"]["h"] - 8
    shapes.extend(make_annotation("fr_ann", fr_ann_x, fr_ann_y, 192, 44,
                                   "customer walkthrough\nscreenshots\nglobal_improvements.json"))

    r4x += BOX_W + 100
    els, p = make_rect("done", r4x, r4y, BOX_W, BOX_H, "success",
                        "Complete\nlearn-from-project")
    shapes.extend(els); pos["done"] = p

    # V3: Self-Improvement box — below Complete
    si_x = pos["done"]["x"]
    si_y = r4y + BOX_H + RANK_GAP + 24
    els, p = make_rect("si", si_x, si_y, BOX_W, BOX_H, "success", "Self-Improvement")
    shapes.extend(els); pos["si"] = p
    for el in shapes:
        if el.get("id") == "r_si": el["strokeWidth"] = 3

    # V3: Self-Improvement annotation
    si_ann_x = pos["si"]["x"] + pos["si"]["w"] - 40
    si_ann_y = pos["si"]["y"] + pos["si"]["h"] - 8
    shapes.extend(make_annotation("si_ann", si_ann_x, si_ann_y, 200, 56,
                                   "worktree isolation\nallowlist/blocklist\nhuman review PR"))

    # VC → Ship (right → left)
    sx, sy = rt("vc"); ex = pos["ship"]["x"]
    arrows.extend(make_arrow("p4_vc_ship", sx, sy, [[0, 0], [ex - sx, 0]], "aligned"))

    # Ship → FR (right → left)
    sx, sy = rt("ship"); ex = pos["fr"]["x"]
    arrows.extend(make_arrow("p4_ship_fr", sx, sy, [[0, 0], [ex - sx, 0]]))

    # FR → Complete (right → left)
    sx, sy = rt("fr"); ex = pos["done"]["x"]
    arrows.extend(make_arrow("p4_fr_done", sx, sy, [[0, 0], [ex - sx, 0]], "ship"))

    # V3: Complete → Self-Improvement (output bottom → input top), labeled "proposals"
    sx, sy = bot("done")
    _, ey = top_("si")
    arrows.extend(make_arrow("p4_done_si", sx, sy, [[0, 0], [0, ey - sy]], "proposals"))

    # Escalation in Panel 4 — below and between Ship and FR
    esc4_x = pos["ship"]["cx"]
    esc4_y = r4y + BOX_H + RANK_GAP + 40
    els, p = make_rect("esc4", esc4_x, esc4_y, BOX_W, BOX_H, "decision", "Escalation")
    shapes.extend(els); pos["esc4"] = p

    # FR → Escalation (output bottom → input top)
    sx, sy = bot("fr")
    ex, ey = top_("esc4")
    arrows.extend(make_arrow("p4_fr_esc", sx, sy,
        [[0, 0], [0, 24], [ex - sx, 24], [ex - sx, ey - sy]], "major-rework"))

    # VC → Escalation: route BELOW all boxes in Panel 4
    sx, sy = bot("vc")
    ex, ey = lt_("esc4")
    arrows.extend(make_arrow("p4_vc_esc", sx, sy,
        [[0, 0], [0, ey - sy], [ex - sx, ey - sy]],
        "diverging"))

    # FR → Change Spec (refine): exit TOP of FR, route left, up to CS LEFT input (red dashed)
    fr_tx, fr_ty = top_("fr")
    cs_lx, cs_ly = lt_("cs")
    route_left = OX - 24  # left of all panels
    arrows.extend(make_arrow("p4_refine", fr_tx, fr_ty,
        [[0, 0], [0, -32], [route_left - fr_tx, -32],
         [route_left - fr_tx, cs_ly - fr_ty], [cs_lx - fr_tx, cs_ly - fr_ty]],
        "refine", "#c92a2a", "dashed"))

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

    # Panel 3 → Panel 4: Analyzing CENTRE BOTTOM → Vision Check top
    sx, sy = bot("ana")
    tx, ty = top_("vc")
    arrows.extend(make_arrow("link_p3_p4", sx, sy,
        [[0, 0], [0, 56], [tx - sx, 56], [tx - sx, ty - sy]],
        "all milestones\ndone"))

    # =====================================================================
    # SIDE COLUMN: KEY ARTIFACTS (V3 updated list)
    # =====================================================================
    art_x = OX + p3_w + 60
    art_y = 80
    art_w = 240
    art_h = 36
    art_gap = 8

    shapes.append(make_label_text("art_title", art_x, art_y - 28, "KEY ARTIFACTS", TITLE_FONT))

    for i, name in enumerate([
        "task_ledger.json",
        "checkpoints.jsonl",
        "cycle_context.json",
        "learnings.md",
        "infrastructure_manifest.json",
        "tools.jsonl",
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
    out = Path(__file__).parent / "rouge-v3-process-map.excalidraw"
    out.write_text(json.dumps(scene, indent=2))
    print(f"Generated: {out}")
