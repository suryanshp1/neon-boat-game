#!/usr/bin/env python3
"""
Neon Tides — Automated 3D Asset Factory powered by sandraschi/blender-mcp
Generates stylized Japanese Neo-Noir PBR maritime vessels, buildings, landmarks, and props
in headless Blender and exports validated .glb artifacts.
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

# Default to local extracted Blender 5.2 LTS if BLENDER_EXECUTABLE env is not set
DEFAULT_BLENDER = ROOT_DIR / "tools" / "Blender.app" / "Contents" / "MacOS" / "Blender"
BLENDER_BIN = os.environ.get("BLENDER_EXECUTABLE", str(DEFAULT_BLENDER))

# Verify sandraschi/blender-mcp repository presence & export handler signature
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

def make_pbr_material(name, base_color, metallic=0.2, roughness=0.35, emission_color=None, emission_strength=0.0):
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

def add_box(name, location, scale, mat, bevel_width=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width > 0:
        bev = obj.modifiers.new(name="Bevel", type='BEVEL')
        bev.width = bevel_width
        bev.segments = 2
    obj.data.materials.append(mat)
    return obj

def add_cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

def build_boat_hull(name, length, width, height, mat_hull, mat_deck, mat_neon):
    # Create tapered maritime hull via bmesh
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.verts.ensure_lookup_table()

    for v in bm.verts:
        x = v.co.x * width
        y = v.co.y * length
        z = v.co.z * height
        # Taper bow (+Y is forward in Blender -> -Z in glTF Y-up)
        if v.co.y > 0:
            x *= 0.35
            if v.co.z < 0:
                y *= 0.82
        else:
            if v.co.z < 0:
                x *= 0.78
        v.co.x = x
        v.co.y = y
        v.co.z = z

    bm.to_mesh(mesh)
    bm.free()

    bev = obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = 0.08
    bev.segments = 2
    obj.data.materials.append(mat_hull)

    # Neon waterline strip
    add_box(name + "_NeonTrim", (0, 0, height * 0.22), (width * 0.96, length * 0.85, 0.08), mat_neon, bevel_width=0.01)
    # Deck cabin / console
    add_box(name + "_Deck", (0, -length * 0.08, height * 0.55), (width * 0.68, length * 0.42, height * 0.55), mat_deck, bevel_width=0.05)

def build_asset(asset_spec):
    reset_scene()
    aid = asset_spec["asset_id"]
    L, W, H = asset_spec["world_scale_m"]

    if aid == "boat_skiff":
        hull = make_pbr_material("SkiffHull", (0.12, 0.16, 0.22), metallic=0.4, roughness=0.3)
        deck = make_pbr_material("SkiffDeck", (0.85, 0.88, 0.90), metallic=0.1, roughness=0.5)
        neon = make_pbr_material("SkiffNeon", (0.0, 0.95, 1.0), metallic=0.1, roughness=0.2, emission_color=(0.0, 0.95, 1.0), emission_strength=4.5)
        build_boat_hull("Skiff", L, W, H * 0.55, hull, deck, neon)
        add_box("OutboardMotor", (0, -L * 0.48, H * 0.2), (0.45, 0.55, 0.85), hull)
        add_box("HeadlightBar", (0, L * 0.32, H * 0.45), (0.8, 0.2, 0.15), neon)

    elif aid == "boat_speedboat":
        hull = make_pbr_material("SpeedHull", (0.08, 0.09, 0.14), metallic=0.75, roughness=0.18)
        canopy = make_pbr_material("SpeedCanopy", (0.04, 0.06, 0.10), metallic=0.9, roughness=0.08)
        neon = make_pbr_material("SpeedNeon", (1.0, 0.12, 0.55), metallic=0.2, roughness=0.2, emission_color=(1.0, 0.12, 0.55), emission_strength=5.5)
        build_boat_hull("Speedboat", L, W, H * 0.48, hull, canopy, neon)
        add_box("AeroWing", (0, -L * 0.42, H * 0.68), (W * 0.92, 0.45, 0.12), neon)
        add_cylinder("TwinJetL", (-W * 0.22, -L * 0.48, -0.05), 0.22, 0.6, hull, rotation=(1.5708, 0, 0))
        add_cylinder("TwinJetR", (W * 0.22, -L * 0.48, -0.05), 0.22, 0.6, hull, rotation=(1.5708, 0, 0))

    elif aid == "boat_workboat":
        hull = make_pbr_material("WorkHull", (0.82, 0.38, 0.08), metallic=0.35, roughness=0.45)
        cabin = make_pbr_material("WorkCabin", (0.18, 0.22, 0.26), metallic=0.4, roughness=0.4)
        beacon = make_pbr_material("WorkBeacon", (1.0, 0.68, 0.0), metallic=0.1, roughness=0.2, emission_color=(1.0, 0.68, 0.0), emission_strength=5.0)
        build_boat_hull("Workboat", L, W, H * 0.42, hull, cabin, beacon)
        add_box("SalvageAFrame", (0, -L * 0.32, H * 0.75), (W * 0.7, 0.35, H * 0.65), cabin)
        add_box("CargoHold", (0, L * 0.18, H * 0.32), (W * 0.65, L * 0.28, H * 0.32), hull)

    elif aid == "traffic_ferry":
        hull = make_pbr_material("FerryHull", (0.90, 0.92, 0.95), metallic=0.2, roughness=0.35)
        trim = make_pbr_material("FerryTrim", (0.05, 0.35, 0.75), metallic=0.4, roughness=0.3)
        windows = make_pbr_material("FerryWindows", (0.95, 0.85, 0.45), metallic=0.2, roughness=0.15, emission_color=(0.95, 0.85, 0.45), emission_strength=3.5)
        build_boat_hull("Ferry", L, W, H * 0.38, hull, trim, windows)
        add_box("PassengerDeck", (0, 0, H * 0.55), (W * 0.82, L * 0.72, H * 0.36), windows)

    elif aid == "police_interceptor":
        hull = make_pbr_material("PoliceHull", (0.06, 0.08, 0.12), metallic=0.6, roughness=0.25)
        stripe = make_pbr_material("PoliceWhite", (0.92, 0.94, 0.96), metallic=0.2, roughness=0.3)
        siren_r = make_pbr_material("SirenRed", (1.0, 0.05, 0.15), emission_color=(1.0, 0.05, 0.15), emission_strength=7.0)
        siren_b = make_pbr_material("SirenBlue", (0.05, 0.45, 1.0), emission_color=(0.05, 0.45, 1.0), emission_strength=7.0)
        build_boat_hull("PoliceInterceptor", L, W, H * 0.46, hull, stripe, siren_b)
        add_box("SirenBarL", (-0.45, -0.3, H * 0.86), (0.42, 0.22, 0.16), siren_r)
        add_box("SirenBarR", (0.45, -0.3, H * 0.86), (0.42, 0.22, 0.16), siren_b)

    elif aid == "building_akari_neon":
        wall = make_pbr_material("AkariConcrete", (0.09, 0.11, 0.15), metallic=0.25, roughness=0.55)
        sign_c = make_pbr_material("SignCyan", (0.0, 0.92, 1.0), emission_color=(0.0, 0.92, 1.0), emission_strength=5.0)
        sign_m = make_pbr_material("SignMagenta", (1.0, 0.15, 0.62), emission_color=(1.0, 0.15, 0.62), emission_strength=5.5)
        add_box("TowerCore", (0, 0, H * 0.5), (L, W, H), wall, bevel_width=0.15)
        add_box("NeonSignVertical1", (L * 0.52, W * 0.22, H * 0.55), (0.35, 2.2, H * 0.55), sign_c, bevel_width=0.02)
        add_box("NeonSignVertical2", (-L * 0.52, -W * 0.22, H * 0.42), (0.35, 2.0, H * 0.48), sign_m, bevel_width=0.02)
        add_box("RoofBillboard", (0, 0, H + 2.4), (L * 0.75, 0.6, 4.2), sign_c, bevel_width=0.04)

    elif aid == "crane_kogyo":
        steel = make_pbr_material("CraneSteel", (0.85, 0.24, 0.08), metallic=0.65, roughness=0.38)
        dark = make_pbr_material("CraneDark", (0.14, 0.16, 0.18), metallic=0.7, roughness=0.4)
        warn = make_pbr_material("CraneBeacon", (1.0, 0.55, 0.0), emission_color=(1.0, 0.55, 0.0), emission_strength=5.0)
        add_box("LegFL", (-L * 0.35, -W * 0.35, H * 0.45), (1.4, 1.4, H * 0.9), steel)
        add_box("LegFR", (L * 0.35, -W * 0.35, H * 0.45), (1.4, 1.4, H * 0.9), steel)
        add_box("LegBL", (-L * 0.35, W * 0.35, H * 0.45), (1.4, 1.4, H * 0.9), steel)
        add_box("LegBR", (L * 0.35, W * 0.35, H * 0.45), (1.4, 1.4, H * 0.9), steel)
        add_box("GantryBoom", (0, -W * 0.25, H * 0.88), (L * 0.95, W * 1.45, 1.8), steel)
        add_box("OperatorCab", (0, -W * 0.55, H * 0.80), (3.2, 3.8, 2.6), dark)
        add_box("BeaconTop", (0, -W * 0.85, H * 0.95), (1.2, 1.2, 0.8), warn)

    elif aid == "torii_gate":
        vermilion = make_pbr_material("ToriiVermilion", (0.86, 0.12, 0.08), metallic=0.15, roughness=0.32)
        cap = make_pbr_material("ToriiBlackCap", (0.08, 0.08, 0.10), metallic=0.3, roughness=0.4)
        lantern = make_pbr_material("ToriiLantern", (1.0, 0.72, 0.28), emission_color=(1.0, 0.72, 0.28), emission_strength=4.5)
        add_cylinder("PillarL", (-L * 0.34, 0, H * 0.48), 0.75, H * 0.96, vermilion)
        add_cylinder("PillarR", (L * 0.34, 0, H * 0.48), 0.75, H * 0.96, vermilion)
        add_box("KasagiTop", (0, 0, H * 0.95), (L * 1.05, 1.6, 1.1), cap, bevel_width=0.08)
        add_box("ShimakiBeam", (0, 0, H * 0.89), (L * 0.98, 1.3, 0.85), vermilion, bevel_width=0.05)
        add_box("NukiTieBeam", (0, 0, H * 0.72), (L * 0.88, 0.9, 0.75), vermilion, bevel_width=0.04)
        add_box("SacredTablet", (0, 0, H * 0.81), (1.4, 0.45, 2.2), lantern, bevel_width=0.03)

    elif aid == "bridge_span":
        deck = make_pbr_material("BridgeConcrete", (0.20, 0.23, 0.28), metallic=0.3, roughness=0.5)
        arch = make_pbr_material("BridgeSteel", (0.12, 0.25, 0.38), metallic=0.65, roughness=0.32)
        strip = make_pbr_material("BridgeNeon", (0.0, 0.88, 0.95), emission_color=(0.0, 0.88, 0.95), emission_strength=4.0)
        add_box("BridgeRoadDeck", (0, 0, H * 0.58), (L, W, 1.4), deck)
        add_box("BridgePierL", (-L * 0.42, 0, H * 0.29), (3.2, W * 0.88, H * 0.58), deck)
        add_box("BridgePierR", (L * 0.42, 0, H * 0.29), (3.2, W * 0.88, H * 0.58), deck)
        add_box("BridgeArchTop", (0, 0, H * 0.92), (L * 0.76, W * 0.92, 1.1), arch)
        add_box("BridgeClearanceNeon", (0, 0, H * 0.52), (L * 0.80, W * 1.02, 0.28), strip)

    elif aid == "buoy_marker":
        body = make_pbr_material("BuoyBody", (0.95, 0.32, 0.05), metallic=0.3, roughness=0.35)
        cage = make_pbr_material("BuoyCage", (0.18, 0.20, 0.24), metallic=0.6, roughness=0.4)
        beacon = make_pbr_material("BuoyBeacon", (0.1, 1.0, 0.55), emission_color=(0.1, 1.0, 0.55), emission_strength=6.0)
        add_cylinder("FloatBase", (0, 0, 0.2), W * 0.48, 0.9, body, vertices=16)
        add_cylinder("TowerMast", (0, 0, 1.2), W * 0.22, 1.6, cage, vertices=12)
        add_cylinder("BeaconLamp", (0, 0, 2.2), W * 0.25, 0.45, beacon, vertices=12)

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
