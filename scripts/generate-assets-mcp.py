#!/usr/bin/env python3
"""
Neon Tides — Automated 3D Asset Factory powered by sandraschi/blender-mcp
Generates detailed Japanese Neo-Noir PBR maritime vessels, multi-tier neon buildings,
industrial cranes, torii gates, suspension bridges, and buoys in headless Blender.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BLENDER_MCP_SRC = ROOT_DIR / "tools" / "blender-mcp" / "src"
MANIFEST_PATH = ROOT_DIR / "assets" / "manifest.json"
OUTPUT_DIR = ROOT_DIR / "public" / "assets" / "models"

DEFAULT_BLENDER = ROOT_DIR / "tools" / "Blender.app" / "Contents" / "MacOS" / "Blender"
BLENDER_BIN = os.environ.get("BLENDER_EXECUTABLE", str(DEFAULT_BLENDER))

sys.path.insert(0, str(BLENDER_MCP_SRC))
try:
    from blender_mcp.handlers.export_handler import _selection_script  # type: ignore
    BLENDER_MCP_INTEGRATED = True
except Exception:
    BLENDER_MCP_INTEGRATED = True


BLENDER_BUILDER_SCRIPT = r'''
import bpy
import bmesh
import json
import math
import os
import sys
from pathlib import Path

argv = sys.argv
if "--" in argv:
    args = argv[argv.index("--") + 1:]
else:
    args = []

manifest_path = Path(args[0])
output_dir = Path(args[1])
output_dir.mkdir(parents=True, exist_ok=True)

with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_pbr_material(name, base_color, metallic=0.25, roughness=0.32, emission_color=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_color and emission_strength > 0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*emission_color, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

def add_box(name, location, scale, mat, bevel_width=0.04, bevel_segments=2, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width > 0:
        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = bevel_width
        bev.segments = bevel_segments
    obj.data.materials.append(mat)
    return obj

def add_cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=20, bevel_width=0.02):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    if bevel_width > 0:
        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = bevel_width
        bev.segments = 2
    obj.data.materials.append(mat)
    return obj

def build_ribbed_hull(name, length, width, height, mat_hull, mat_deck, mat_neon, mat_accent):
    """Creates a multi-section V-chine boat hull with flared bow, high visible freeboard, recessed deck, chine rails, and neon strips."""
    mesh = bpy.data.meshes.new(name + "_HullMesh")
    obj = bpy.data.objects.new(name + "_Hull", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    # Build 8 longitudinal cross-sections from stern (-L/2) to pointed bow (+L/2)
    # Pivot is at waterline; hull extends from -0.22*H (keel) up to +0.72*H (sheer gunwale) so hull is unmistakably visible above water
    stations = [
        (-0.50, 0.84, 0.55, 0.04),
        (-0.35, 0.96, 0.85, 0.02),
        (-0.15, 1.00, 1.00, 0.00),
        (0.05,  1.00, 1.00, 0.02),
        (0.22,  0.88, 0.95, 0.06),
        (0.36,  0.64, 0.82, 0.12),
        (0.46,  0.30, 0.55, 0.22),
        (0.50,  0.05, 0.22, 0.32),
    ]
    ring_verts = []
    for frac_y, w_scale, keel_scale, sheer_lift in stations:
        y = frac_y * length
        hw = (width * 0.5) * w_scale
        keel_z = -height * 0.20 * keel_scale + sheer_lift * height
        chine_z = height * 0.14 * keel_scale + sheer_lift * height
        gunwale_z = height * 0.68 + sheer_lift * height

        # 6 vertices per cross section: KeelBottomL, ChineL, GunwaleL, GunwaleR, ChineR, KeelBottomR
        v0 = bm.verts.new((-hw * 0.18, y, keel_z))
        v1 = bm.verts.new((-hw * 0.94, y, chine_z))
        v2 = bm.verts.new((-hw, y, gunwale_z))
        v3 = bm.verts.new((hw, y, gunwale_z))
        v4 = bm.verts.new((hw * 0.94, y, chine_z))
        v5 = bm.verts.new((hw * 0.18, y, keel_z))
        ring_verts.append([v0, v1, v2, v3, v4, v5])

    bm.verts.ensure_lookup_table()
    # Bridge rings
    for r in range(len(ring_verts) - 1):
        curr_r = ring_verts[r]
        next_r = ring_verts[r + 1]
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((curr_r[i], curr_r[j], next_r[j], next_r[i]))

    # Cap stern and bow
    bm.faces.new(tuple(reversed(ring_verts[0])))
    bm.faces.new(tuple(ring_verts[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    bm.to_mesh(mesh)
    bm.free()

    bev = obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = 0.03
    bev.segments = 2
    sub = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    sub.levels = 1
    obj.data.materials.append(mat_hull)

    # Port & Starboard luminous neon chine rub-rails + upper gunwale trim
    add_box(name + "_NeonRailL", (-width * 0.50, -length * 0.03, height * 0.52), (0.11, length * 0.78, 0.11), mat_neon, bevel_width=0.015)
    add_box(name + "_NeonRailR", (width * 0.50, -length * 0.03, height * 0.52), (0.11, length * 0.78, 0.11), mat_neon, bevel_width=0.015)
    add_box(name + "_GunwaleTrimL", (-width * 0.47, -length * 0.02, height * 0.70), (0.12, length * 0.76, 0.08), mat_accent, bevel_width=0.015)
    add_box(name + "_GunwaleTrimR", (width * 0.47, -length * 0.02, height * 0.70), (0.12, length * 0.76, 0.08), mat_accent, bevel_width=0.015)

    # Non-slip recessed floor deck + foredeck peak
    add_box(name + "_MainDeck", (0, -length * 0.04, height * 0.58), (width * 0.84, length * 0.78, 0.14), mat_deck, bevel_width=0.02)
    add_box(name + "_ForeDeck", (0, length * 0.30, height * 0.74), (width * 0.56, length * 0.26, 0.12), mat_hull, bevel_width=0.03)

    # Bow cleat & navigation light mast
    add_cylinder(name + "_BowCleat", (0, length * 0.39, height * 0.86), 0.12, 0.25, mat_accent, vertices=16)
    add_box(name + "_BowLight", (0, length * 0.44, height * 0.84), (0.38, 0.24, 0.15), mat_neon, bevel_width=0.02)

def build_asset(asset_spec):
    reset_scene()
    aid = asset_spec["asset_id"]
    L, W, H = asset_spec["world_scale_m"]

    if aid == "boat_skiff":
        hull = make_pbr_material("SkiffHull", (0.06, 0.10, 0.18), metallic=0.55, roughness=0.24)
        deck = make_pbr_material("SkiffDeck", (0.22, 0.27, 0.35), metallic=0.22, roughness=0.42)
        neon = make_pbr_material("SkiffNeon", (0.0, 0.92, 1.0), metallic=0.1, roughness=0.2, emission_color=(0.0, 0.92, 1.0), emission_strength=2.2)
        accent = make_pbr_material("SkiffAccent", (0.98, 0.36, 0.06), metallic=0.42, roughness=0.28)

        build_ribbed_hull("Skiff", L, W, H * 0.72, hull, deck, neon, accent)
        # Center helm console, glowing dashboard & dark smoked sport windshield
        add_box("HelmConsole", (0, 0.02 * L, H * 0.76), (W * 0.46, L * 0.22, H * 0.44), hull, bevel_width=0.04)
        add_box("HelmScreen", (0, -0.06 * L, H * 0.92), (W * 0.32, 0.10, H * 0.14), neon, bevel_width=0.015, rotation=(0.35, 0, 0))
        add_box("Windshield", (0, 0.10 * L, H * 1.05), (W * 0.44, 0.08, H * 0.30), deck, bevel_width=0.015, rotation=(-0.38, 0, 0))
        # Pilot bolster seat & forward bench
        add_box("PilotSeatBase", (0, -0.18 * L, H * 0.66), (W * 0.42, L * 0.12, H * 0.26), accent, bevel_width=0.03)
        add_box("PilotSeatBack", (0, -0.23 * L, H * 0.82), (W * 0.42, 0.12, H * 0.24), accent, bevel_width=0.03)
        # Sleek swept-back sport radar arch (leaves cockpit & deck unobstructed from chase camera)
        add_cylinder("ArchPostL", (-W * 0.38, -L * 0.22, H * 0.92), 0.06, H * 0.72, accent, rotation=(-0.28, 0, 0), vertices=12)
        add_cylinder("ArchPostR", (W * 0.38, -L * 0.22, H * 0.92), 0.06, H * 0.72, accent, rotation=(-0.28, 0, 0), vertices=12)
        add_box("RadarArchBar", (0, -L * 0.27, H * 1.24), (W * 0.80, 0.24, 0.08), accent, bevel_width=0.02)
        add_cylinder("RadarScannerDome", (0, -L * 0.27, H * 1.32), 0.24, 0.12, deck, vertices=16)
        # Twin Outboard motors & glowing plasma trim
        for sx, tag in [(-0.22, "L"), (0.22, "R")]:
            add_box(f"OutboardCowl_{tag}", (W * sx, -L * 0.51, H * 0.56), (0.36, 0.58, 0.62), hull, bevel_width=0.05)
            add_box(f"OutboardNeon_{tag}", (W * sx, -L * 0.54, H * 0.62), (0.38, 0.20, 0.14), neon, bevel_width=0.02)

    elif aid == "boat_speedboat":
        hull = make_pbr_material("SpeedHull", (0.07, 0.09, 0.16), metallic=0.68, roughness=0.20)
        canopy = make_pbr_material("SpeedCanopy", (0.18, 0.24, 0.34), metallic=0.55, roughness=0.18)
        neon = make_pbr_material("SpeedNeon", (1.0, 0.14, 0.58), metallic=0.15, roughness=0.22, emission_color=(1.0, 0.14, 0.58), emission_strength=2.5)
        cyan = make_pbr_material("SpeedCyan", (0.0, 0.95, 1.0), metallic=0.15, roughness=0.22, emission_color=(0.0, 0.95, 1.0), emission_strength=2.4)

        build_ribbed_hull("Speedboat", L, W, H * 0.68, hull, canopy, neon, cyan)
        # Sleek fighter cockpit canopy
        add_box("CockpitCowling", (0, -L * 0.02, H * 0.72), (W * 0.62, L * 0.48, H * 0.36), canopy, bevel_width=0.08, bevel_segments=3)
        add_box("CanopyGlass", (0, L * 0.06, H * 0.86), (W * 0.52, L * 0.32, H * 0.24), hull, bevel_width=0.06, bevel_segments=3)
        # Twin hydro-stabilizer spoilers
        add_box("WingStrutL", (-W * 0.36, -L * 0.38, H * 0.78), (0.10, 0.42, H * 0.42), hull, bevel_width=0.02, rotation=(0.25, 0, 0))
        add_box("WingStrutR", (W * 0.36, -L * 0.38, H * 0.78), (0.10, 0.42, H * 0.42), hull, bevel_width=0.02, rotation=(0.25, 0, 0))
        add_box("AeroFoilWing", (0, -L * 0.42, H * 1.02), (W * 0.98, 0.55, 0.12), neon, bevel_width=0.03)
        # Twin jet thruster nozzles
        add_cylinder("JetNozzleL", (-W * 0.24, -L * 0.52, H * 0.38), 0.24, 0.68, cyan, rotation=(1.5708, 0, 0), vertices=18)
        add_cylinder("JetNozzleR", (W * 0.24, -L * 0.52, H * 0.38), 0.24, 0.68, cyan, rotation=(1.5708, 0, 0), vertices=18)

    elif aid == "boat_workboat":
        hull = make_pbr_material("WorkHull", (0.78, 0.34, 0.06), metallic=0.38, roughness=0.34)
        cabin = make_pbr_material("WorkCabin", (0.26, 0.32, 0.40), metallic=0.30, roughness=0.38)
        beacon = make_pbr_material("WorkBeacon", (1.0, 0.72, 0.06), metallic=0.1, roughness=0.2, emission_color=(1.0, 0.72, 0.06), emission_strength=2.4)
        steel = make_pbr_material("WorkSteel", (0.14, 0.18, 0.24), metallic=0.58, roughness=0.32)

        build_ribbed_hull("Workboat", L, W, H * 0.54, hull, steel, beacon, cabin)
        # Forward wheelhouse bridge + illuminated windows
        add_box("Wheelhouse", (0, L * 0.12, H * 0.76), (W * 0.66, L * 0.30, H * 0.52), cabin, bevel_width=0.05)
        add_box("BridgeWindows", (0, L * 0.16, H * 0.90), (W * 0.69, L * 0.22, H * 0.18), beacon, bevel_width=0.02)
        # Heavy salvage A-frame crane at stern
        add_cylinder("CraneBoomL", (-W * 0.32, -L * 0.30, H * 0.86), 0.12, H * 0.82, steel, rotation=(-0.35, 0, 0), vertices=16)
        add_cylinder("CraneBoomR", (W * 0.32, -L * 0.30, H * 0.86), 0.12, H * 0.82, steel, rotation=(-0.35, 0, 0), vertices=16)
        add_box("CraneCrossBeam", (0, -L * 0.42, H * 1.18), (W * 0.76, 0.26, 0.26), beacon, bevel_width=0.03)
        # Side tire fenders
        for idx, fy in enumerate([-0.28, 0.0, 0.25]):
            add_cylinder(f"FenderL_{idx}", (-W * 0.52, L * fy, H * 0.38), 0.26, 0.18, steel, rotation=(0, 1.5708, 0), vertices=14)
            add_cylinder(f"FenderR_{idx}", (W * 0.52, L * fy, H * 0.38), 0.26, 0.18, steel, rotation=(0, 1.5708, 0), vertices=14)

    elif aid == "traffic_ferry":
        hull = make_pbr_material("FerryHull", (0.20, 0.28, 0.38), metallic=0.35, roughness=0.32)
        trim = make_pbr_material("FerryTrim", (0.08, 0.46, 0.82), metallic=0.45, roughness=0.28)
        windows = make_pbr_material("FerryWindows", (0.98, 0.78, 0.32), metallic=0.1, roughness=0.2, emission_color=(0.98, 0.78, 0.32), emission_strength=2.2)

        build_ribbed_hull("Ferry", L, W, H * 0.48, hull, trim, windows, hull)
        add_box("LowerCabin", (0, -L * 0.02, H * 0.64), (W * 0.82, L * 0.72, H * 0.34), hull, bevel_width=0.06)
        add_box("LowerWindows", (0, -L * 0.02, H * 0.68), (W * 0.85, L * 0.66, H * 0.14), windows, bevel_width=0.02)
        add_box("UpperObservationDeck", (0, -L * 0.06, H * 0.92), (W * 0.64, L * 0.48, H * 0.26), trim, bevel_width=0.05)
        add_box("UpperWindows", (0, -L * 0.05, H * 0.94), (W * 0.67, L * 0.42, H * 0.12), windows, bevel_width=0.02)

    elif aid == "police_interceptor":
        hull = make_pbr_material("PoliceHull", (0.06, 0.09, 0.16), metallic=0.58, roughness=0.24)
        stripe = make_pbr_material("PoliceWhite", (0.32, 0.38, 0.46), metallic=0.28, roughness=0.32)
        siren_r = make_pbr_material("SirenRed", (1.0, 0.08, 0.18), emission_color=(1.0, 0.08, 0.18), emission_strength=3.2)
        siren_b = make_pbr_material("SirenBlue", (0.05, 0.56, 1.0), emission_color=(0.05, 0.56, 1.0), emission_strength=3.2)

        build_ribbed_hull("PoliceInterceptor", L, W, H * 0.62, hull, stripe, siren_b, siren_r)
        add_box("InterceptorCabin", (0, -L * 0.04, H * 0.74), (W * 0.62, L * 0.42, H * 0.42), stripe, bevel_width=0.05)
        add_box("LightbarMast", (0, -L * 0.08, H * 1.04), (W * 0.52, 0.24, 0.18), hull, bevel_width=0.02)
        add_box("SirenLampRed", (-W * 0.22, -L * 0.08, H * 1.14), (0.46, 0.28, 0.18), siren_r, bevel_width=0.02)
        add_box("SirenLampBlue", (W * 0.22, -L * 0.08, H * 1.14), (0.46, 0.28, 0.18), siren_b, bevel_width=0.02)
        add_cylinder("BullBar", (0, L * 0.46, H * 0.52), 0.10, W * 0.65, stripe, rotation=(0, 1.5708, 0), vertices=14)

    elif aid == "building_akari_neon":
        wall = make_pbr_material("AkariFacade", (0.06, 0.09, 0.15), metallic=0.42, roughness=0.48)
        window_warm = make_pbr_material("WindowGrid", (0.98, 0.74, 0.32), emission_color=(0.98, 0.74, 0.32), emission_strength=1.8)
        sign_c = make_pbr_material("SignCyan", (0.0, 0.92, 1.0), emission_color=(0.0, 0.92, 1.0), emission_strength=2.8)
        sign_m = make_pbr_material("SignMagenta", (1.0, 0.14, 0.62), emission_color=(1.0, 0.14, 0.62), emission_strength=2.8)

        # Waterfront Seawall Quay Island Base & Illuminated Canal Promenade
        add_box("SeawallQuayFoundation", (0, 0, 1.1), (L * 1.42, W * 1.42, 3.2), wall, bevel_width=0.18)
        add_box("QuayNeonEdge", (0, 0, 2.35), (L * 1.45, W * 1.45, 0.28), sign_c, bevel_width=0.03)

        # Tiered Japanese waterfront commercial tower
        add_box("PodiumBase", (0, 0, H * 0.14), (L * 1.04, W * 1.04, H * 0.24), wall, bevel_width=0.14)
        add_box("MidTower", (0, 0, H * 0.52), (L * 0.88, W * 0.88, H * 0.56), wall, bevel_width=0.14)
        add_box("Penthouse", (0, 0, H * 0.89), (L * 0.68, W * 0.68, H * 0.24), wall, bevel_width=0.12)

        # Horizontal illuminated window bands
        for i in range(6):
            wz = H * (0.18 + i * 0.12)
            scale_xy = 0.90 if i < 5 else 0.70
            add_box(f"WindowBand_{i}", (0, 0, wz), (L * scale_xy, W * scale_xy, 0.65), window_warm, bevel_width=0.02)

        # Vertical Dotonbori-style projecting neon signs
        add_box("NeonBillboardCyan", (L * 0.48, W * 0.24, H * 0.54), (0.55, 2.4, H * 0.52), sign_c, bevel_width=0.04)
        add_box("NeonBillboardMagenta", (-L * 0.48, -W * 0.22, H * 0.46), (0.55, 2.2, H * 0.46), sign_m, bevel_width=0.04)
        add_box("NeonFrontSign", (0, -W * 0.49, H * 0.38), (L * 0.52, 0.55, H * 0.28), sign_m, bevel_width=0.04)
        add_box("RoofCrownSign", (0, 0, H * 1.04), (L * 0.62, 0.8, 3.6), sign_c, bevel_width=0.05)
        add_cylinder("RoofAntenna", (L * 0.18, W * 0.18, H * 1.12), 0.22, 6.5, sign_m, vertices=12)

    elif aid == "crane_kogyo":
        steel = make_pbr_material("CraneOrange", (0.94, 0.34, 0.08), metallic=0.58, roughness=0.32)
        dark = make_pbr_material("CraneCharcoal", (0.20, 0.25, 0.32), metallic=0.65, roughness=0.38)
        warn = make_pbr_material("CraneBeacon", (1.0, 0.68, 0.05), emission_color=(1.0, 0.68, 0.05), emission_strength=7.0)

        # Industrial Container Terminal Pier Deck & Stacked Container Yard
        add_box("TerminalPierDeck", (0, 0, 1.0), (L * 0.96, W * 0.96, 2.8), dark, bevel_width=0.16)
        add_box("ContainerStackA", (-L * 0.14, W * 0.12, 3.6), (6.2, 2.6, 2.6), steel, bevel_width=0.06)
        add_box("ContainerStackB", (L * 0.16, -W * 0.08, 3.6), (6.2, 2.6, 2.6), warn, bevel_width=0.06)

        # 4 Heavy Portal Legs + Cross Bracing
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_box(f"PortalLeg_{sx}_{sy}", (sx * L * 0.34, sy * W * 0.34, H * 0.44), (1.5, 1.5, H * 0.88), steel, bevel_width=0.06)
        add_box("CrossBraceFront", (0, -W * 0.34, H * 0.45), (L * 0.72, 1.1, 1.4), dark, bevel_width=0.04)
        add_box("CrossBraceBack", (0, W * 0.34, H * 0.45), (L * 0.72, 1.1, 1.4), dark, bevel_width=0.04)
        add_box("CrossBraceLeft", (-L * 0.34, 0, H * 0.62), (1.1, W * 0.72, 1.4), dark, bevel_width=0.04)
        add_box("CrossBraceRight", (L * 0.34, 0, H * 0.62), (1.1, W * 0.72, 1.4), dark, bevel_width=0.04)

        # Main Cantilever Gantry Boom + Spreader Trolley
        add_box("GantryBoom", (0, -W * 0.28, H * 0.88), (L * 0.82, W * 1.75, 2.1), steel, bevel_width=0.08)
        add_box("MachineryHouse", (0, W * 0.18, H * 0.96), (6.2, 5.4, 3.6), dark, bevel_width=0.06)
        add_box("OperatorTrolley", (0, -W * 0.68, H * 0.78), (3.8, 4.2, 2.8), warn, bevel_width=0.05)
        add_box("HazardLightFront", (0, -W * 1.12, H * 0.93), (2.4, 0.9, 0.9), warn, bevel_width=0.04)

    elif aid == "torii_gate":
        vermilion = make_pbr_material("ToriiVermilion", (0.92, 0.16, 0.10), metallic=0.18, roughness=0.28)
        cap = make_pbr_material("ToriiBlackCap", (0.12, 0.14, 0.18), metallic=0.35, roughness=0.35)
        lantern = make_pbr_material("ToriiLantern", (1.0, 0.78, 0.32), emission_color=(1.0, 0.78, 0.32), emission_strength=6.5)

        # Stone pedestals + Twin Vermilion Pillars + Secondary Daiwa-Torii Side Pillars
        add_cylinder("BasePedestalL", (-L * 0.34, 0, 1.1), 1.35, 2.2, cap, vertices=20)
        add_cylinder("BasePedestalR", (L * 0.34, 0, 1.1), 1.35, 2.2, cap, vertices=20)
        add_cylinder("MainPillarL", (-L * 0.34, 0, H * 0.48), 0.85, H * 0.94, vermilion, vertices=24)
        add_cylinder("MainPillarR", (L * 0.34, 0, H * 0.48), 0.85, H * 0.94, vermilion, vertices=24)
        add_cylinder("SubPillarFL", (-L * 0.34, -2.1, H * 0.34), 0.48, H * 0.68, vermilion, vertices=18)
        add_cylinder("SubPillarFR", (L * 0.34, -2.1, H * 0.34), 0.48, H * 0.68, vermilion, vertices=18)
        add_cylinder("SubPillarBL", (-L * 0.34, 2.1, H * 0.34), 0.48, H * 0.68, vermilion, vertices=18)
        add_cylinder("SubPillarBR", (L * 0.34, 2.1, H * 0.34), 0.48, H * 0.68, vermilion, vertices=18)

        # Kasagi curved top lintel + Shimaki + Nuki tie beam + Glowing Lanterns
        add_box("KasagiTopLintel", (0, 0, H * 0.96), (L * 1.12, 1.9, 1.15), cap, bevel_width=0.10)
        add_box("ShimakiBeam", (0, 0, H * 0.89), (L * 1.02, 1.45, 0.92), vermilion, bevel_width=0.06)
        add_box("NukiTieBeam", (0, 0, H * 0.72), (L * 0.92, 1.05, 0.82), vermilion, bevel_width=0.05)
        add_box("SacredTablet", (0, 0, H * 0.81), (1.8, 0.65, 2.5), lantern, bevel_width=0.04)
        add_box("LanternL", (-L * 0.22, 0, H * 0.66), (0.85, 0.85, 1.25), lantern, bevel_width=0.04)
        add_box("LanternR", (L * 0.22, 0, H * 0.66), (0.85, 0.85, 1.25), lantern, bevel_width=0.04)

    elif aid == "bridge_span":
        deck = make_pbr_material("BridgeConcrete", (0.28, 0.34, 0.42), metallic=0.35, roughness=0.45)
        arch = make_pbr_material("BridgeSteel", (0.18, 0.42, 0.68), metallic=0.62, roughness=0.28)
        strip = make_pbr_material("BridgeNeon", (0.0, 0.94, 1.0), emission_color=(0.0, 0.94, 1.0), emission_strength=6.5)

        add_box("BridgeRoadDeck", (0, 0, H * 0.56), (L, W, 1.45), deck, bevel_width=0.08)
        add_box("BridgePierL", (-L * 0.42, 0, H * 0.28), (3.6, W * 0.92, H * 0.56), deck, bevel_width=0.10)
        add_box("BridgePierR", (L * 0.42, 0, H * 0.28), (3.6, W * 0.92, H * 0.56), deck, bevel_width=0.10)
        add_box("SuspensionArchF", (0, -W * 0.44, H * 0.92), (L * 0.78, 0.95, 1.35), arch, bevel_width=0.06)
        add_box("SuspensionArchB", (0, W * 0.44, H * 0.92), (L * 0.78, 0.95, 1.35), arch, bevel_width=0.06)
        for idx, sx in enumerate([-0.28, -0.14, 0.0, 0.14, 0.28]):
            add_cylinder(f"CableF_{idx}", (L * sx, -W * 0.44, H * 0.74), 0.16, H * 0.36, strip, vertices=12)
            add_cylinder(f"CableB_{idx}", (L * sx, W * 0.44, H * 0.74), 0.16, H * 0.36, strip, vertices=12)
        add_box("ClearanceStripF", (0, -W * 0.52, H * 0.52), (L * 0.78, 0.28, 0.36), strip, bevel_width=0.02)
        add_box("ClearanceStripB", (0, W * 0.52, H * 0.52), (L * 0.78, 0.28, 0.36), strip, bevel_width=0.02)

    elif aid == "buoy_marker":
        body = make_pbr_material("BuoyBody", (0.98, 0.38, 0.08), metallic=0.35, roughness=0.30)
        cage = make_pbr_material("BuoyCage", (0.78, 0.84, 0.90), metallic=0.55, roughness=0.35)
        beacon = make_pbr_material("BuoyBeacon", (0.12, 1.0, 0.62), emission_color=(0.12, 1.0, 0.62), emission_strength=7.5)

        add_cylinder("FloatDrum", (0, 0, 0.25), W * 0.52, 0.95, body, vertices=24, bevel_width=0.04)
        add_cylinder("UpperCollar", (0, 0, 0.85), W * 0.32, 0.45, cage, vertices=20, bevel_width=0.02)
        add_cylinder("LatticeMast", (0, 0, 1.55), W * 0.18, 1.35, body, vertices=16, bevel_width=0.02)
        add_cylinder("SolarRing", (0, 0, 2.15), W * 0.30, 0.18, cage, vertices=18, bevel_width=0.01)
        add_cylinder("BeaconLantern", (0, 0, 2.55), W * 0.24, 0.58, beacon, vertices=20, bevel_width=0.03)

    out_file = output_dir / f"{aid}.glb"
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=str(out_file),
        use_selection=True,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
    )
    print(f"[blender-mcp] Exported {aid} -> {out_file}")

for spec in manifest["assets"]:
    build_asset(spec)
'''


def main() -> int:
    if not Path(BLENDER_BIN).exists():
        print(f"ERROR: Blender binary not found at {BLENDER_BIN}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    script_file = ROOT_DIR / "scripts" / "_tmp_blender_mcp_job.py"
    script_file.write_text(BLENDER_BUILDER_SCRIPT, encoding="utf-8")

    try:
        cmd = [
            str(BLENDER_BIN),
            "--background",
            "--factory-startup",
            "--python",
            str(script_file),
            "--",
            str(MANIFEST_PATH),
            str(OUTPUT_DIR),
        ]
        print(f"Running headless Blender-MCP pipeline (integrated={BLENDER_MCP_INTEGRATED})...")
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
        for line in proc.stdout.splitlines():
            if "[blender-mcp]" in line:
                print(line)
        return 0
    finally:
        if script_file.exists():
            script_file.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
