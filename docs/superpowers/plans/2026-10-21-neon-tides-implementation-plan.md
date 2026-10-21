# Neon Tides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build *Neon Tides* end-to-end — a web-first Japanese open-world boating action/adventure game powered by Three.js (WebGL2), Rapier 3D 60 Hz deterministic physics, shared analytic Gerstner water, cell-streamed districts, spline traffic AI, 4-stage Harbour Heat & maritime stealth, modular mission grammar, single-currency economy, bilingual EN/JA Neo-Noir HUD, and an automated `sandraschi/blender-mcp` headless Blender GLB asset factory.

**Architecture:** The project separates offline 3D asset generation (`tools/blender-mcp` + `scripts/generate-assets-mcp.py` + `scripts/validate-assets.ts`) from the browser runtime (`src/`). The browser client runs a fixed 60 Hz simulation accumulator loop coupling deterministic analytic water (`WaterField`) with Rapier 3D 8-point hull buoyancy (`BoatDynamics`), a 4-ring 250m grid world streamer (`WorldStreamer`), spline-based traffic & 4-stage enforcement AI (`TrafficManager`, `EnforcementSystem`), a composable mission state machine (`MissionManager`), a single-currency economy (`EconomyManager`), Web Audio synthesis (`AudioEngine`), and a cyber-maritime Neo-Noir HUD (`HudController`).

**Tech Stack:** TypeScript 5, Vite 6, Three.js (`three`), `@dimforge/rapier3d-compat`, `@gltf-transform/core`, Vitest (`vitest`), Python 3 + Headless Blender + `sandraschi/blender-mcp`.

## Global Constraints

- Web-first via Three.js `WebGLRenderer` (WebGL2); maintain 60 FPS desktop target with explicit geometry/material disposal on cell unload.
- Fixed 60 Hz physics simulation (`dt = 1/60`) independent of render framerate.
- Every 3D asset in `assets/manifest.json` must be generated via headless Blender driving `sandraschi/blender-mcp` modules (`scripts/generate-assets-mcp.py`) and validated with `@gltf-transform/core` (`scripts/validate-assets.ts`).
- Three playable boat archetypes (`kuro_skiff`, `inazuma_gt`, `kujira_work`) with distinct handling, drift/slip, stability, armor, and cargo attributes.
- Four districts (`Mirai Harbour`, `Akari Canal`, `Kōgyō Islands`, `Seto Outer Islands`) across a 4×4 km bay streamed in 250m cells across 4 rings (`Active Physics/AI`, `High-Detail Render`, `Skyline Silhouette`, `Unloaded`).
- Four-stage Harbour Heat (`Clear`, `Alert`, `Pursuit`, `Lockdown`) coupled with Maritime Signature Stealth (lights, engine throttle noise, weather visibility, bridge cover).
- Single earnable currency (`Credits ¥`) with typed telemetry ledger reasons (`mission_reward`, `salvage_sale`, `hull_repair`, `upgrade_purchase`, `boat_unlock`, `collision_fine`).
- Bilingual EN/JA localisation (`src/i18n/locales.ts`) with zero hardcoded UI strings and WCAG 2.2 AA reduced-motion toggles.

---

### Task 1: Project Scaffolding & `sandraschi/blender-mcp` Headless GLB Asset Factory (Subsystem 1)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `assets/manifest.json`
- Create: `scripts/generate-assets-mcp.py`
- Create: `scripts/validate-assets.ts`
- Create: `tests/asset-pipeline.test.ts`

**Interfaces:**
- Consumes: `tools/blender-mcp` (cloned from `https://github.com/sandraschi/blender-mcp`) and headless `blender` binary.
- Produces:
  - `public/assets/models/*.glb` (all 10 manifest assets: `boat_skiff.glb`, `boat_speedboat.glb`, `boat_workboat.glb`, `traffic_ferry.glb`, `police_interceptor.glb`, `building_akari_neon.glb`, `crane_kogyo.glb`, `torii_gate.glb`, `bridge_span.glb`, `buoy_marker.glb`)
  - `public/assets/asset-report.json` validated against `assets/manifest.json` budgets.

- [ ] **Step 1: Initialize npm project, install dependencies, repair Blender symlink if needed, and clone `sandraschi/blender-mcp`**

Run:
```bash
npm init -y
npm install three @dimforge/rapier3d-compat @gltf-transform/core
npm install -D typescript vite vitest @types/three tsx
mkdir -p tools assets scripts public/assets/models src tests
git clone --depth 1 https://github.com/sandraschi/blender-mcp.git tools/blender-mcp
```

- [ ] **Step 2: Write the failing asset pipeline validation test (`tests/asset-pipeline.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Subsystem 1: sandraschi/blender-mcp Asset Factory', () => {
  const manifestPath = path.resolve(__dirname, '../assets/manifest.json');
  const reportPath = path.resolve(__dirname, '../public/assets/asset-report.json');

  it('loads asset manifest with all 10 required maritime assets', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.assets.length).toBeGreaterThanOrEqual(10);
  });

  it('generates valid GLB files via blender-mcp within triangle and material budgets', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(report.passed).toBe(true);
    for (const item of report.results) {
      expect(item.exists).toBe(true);
      expect(item.triangles).toBeGreaterThan(0);
      expect(item.triangles).toBeLessThanOrEqual(item.maxTriangles);
      expect(item.materials).toBeLessThanOrEqual(item.maxMaterials);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/asset-pipeline.test.ts`
Expected: FAIL (`manifest.json` and `asset-report.json` do not exist yet).

- [ ] **Step 4: Create `assets/manifest.json`, `scripts/generate-assets-mcp.py`, and `scripts/validate-assets.ts`, then run the Blender-MCP pipeline**

Execute `blender -b -P scripts/generate-assets-mcp.py` (using `tools/blender-mcp` modules and Blender `bpy` PBR/modifier/GLTF exporters) followed by `npx tsx scripts/validate-assets.ts`.

- [ ] **Step 5: Run test to verify it passes and commit**

Run: `npx vitest run tests/asset-pipeline.test.ts`
Expected: PASS

---

### Task 2: Deterministic Analytic Water, 60 Hz Rapier Boat Dynamics & 3 Boat Archetypes (Subsystem 2)

**Files:**
- Create: `src/core/WaterField.ts`
- Create: `src/entities/BoatArchetypes.ts`
- Create: `src/physics/BoatDynamics.ts`
- Create: `src/input/InputManager.ts`
- Create: `src/rendering/RenderManager.ts`
- Create: `tests/boat-physics.test.ts`

**Interfaces:**
- Consumes: `@dimforge/rapier3d-compat`
- Produces:
  - `WaterField.sample(x: number, z: number, time: number, weather: WeatherState): { height: number; normal: { x: number; y: number; z: number } }`
  - `BOAT_ARCHETYPES: Record<BoatId, BoatSpec>` (`kuro_skiff`, `inazuma_gt`, `kujira_work`)
  - `BoatDynamics` class with `step(dt: number, input: BoatControlInput, time: number, weather: WeatherState): BoatTelemetryState`

- [ ] **Step 1: Write the failing physics & water test (`tests/boat-physics.test.ts`)**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { WaterField } from '../src/core/WaterField';
import { BOAT_ARCHETYPES } from '../src/entities/BoatArchetypes';
import { BoatDynamics } from '../src/physics/BoatDynamics';

describe('Subsystem 2: Analytic Water & 60Hz Rapier Boat Dynamics', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it('computes deterministic wave height and normalized surface normal across weather states', () => {
    const s1 = WaterField.sample(120, -45, 10.5, 'clear');
    const s2 = WaterField.sample(120, -45, 10.5, 'clear');
    expect(s1.height).toBeCloseTo(s2.height, 6);
    const storm = WaterField.sample(120, -45, 10.5, 'storm');
    expect(Math.abs(storm.height)).toBeGreaterThan(Math.abs(s1.height) * 0.5);
    const len = Math.hypot(s1.normal.x, s1.normal.y, s1.normal.z);
    expect(len).toBeCloseTo(1.0, 4);
  });

  it('stabilizes buoyancy and differentiates speed/turning across the 3 boat archetypes', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const skiff = new BoatDynamics(world, BOAT_ARCHETYPES.kuro_skiff, { x: 0, y: 1.5, z: 0 });
    const speed = new BoatDynamics(world, BOAT_ARCHETYPES.inazuma_gt, { x: 20, y: 1.5, z: 0 });

    for (let i = 0; i < 180; i++) {
      skiff.step(1 / 60, { throttle: 1, steer: 0, boost: false, drift: false }, i / 60, 'clear');
      speed.step(1 / 60, { throttle: 1, steer: 0, boost: false, drift: false }, i / 60, 'clear');
      world.step();
    }

    const skiffState = skiff.getState();
    const speedState = speed.getState();
    expect(skiffState.speedMps).toBeGreaterThan(5);
    expect(speedState.speedMps).toBeGreaterThan(skiffState.speedMps);
    expect(Math.abs(skiffState.position.y)).toBeLessThan(3.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/boat-physics.test.ts`
Expected: FAIL (`WaterField` and `BoatDynamics` not found).

- [ ] **Step 3: Implement `WaterField.ts`, `BoatArchetypes.ts`, `BoatDynamics.ts`, `InputManager.ts`, and `RenderManager.ts`**

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `npx vitest run tests/boat-physics.test.ts`
Expected: PASS

---

### Task 3: Streamed World Grid (4 Districts), Spline Traffic AI, 4-Stage Harbour Heat & Stealth (Subsystem 3)

**Files:**
- Create: `src/world/DistrictDefinitions.ts`
- Create: `src/world/WorldStreamer.ts`
- Create: `src/world/AtmosphereSystem.ts`
- Create: `src/ai/TrafficManager.ts`
- Create: `src/ai/EnforcementSystem.ts`
- Create: `src/gameplay/StealthSystem.ts`
- Create: `tests/world-ai-heat.test.ts`

**Interfaces:**
- Consumes: `WaterField`, `BoatTelemetryState`
- Produces:
  - `WorldStreamer` managing 250m cells across 4 rings with explicit disposal metrics (`activeCells`, `disposedCount`, `getDistrictAt(x, z)`).
  - `TrafficManager` updating spline-following vessels with kinematic distant simulation and nearby obstacle avoidance.
  - `StealthSystem.computeSignature(state)` & `EnforcementSystem` implementing the 4-stage `HarbourHeatLevel` (`0: Clear`, `1: Alert`, `2: Pursuit`, `3: Lockdown`).

- [ ] **Step 1: Write the failing world streaming, traffic AI, Harbour Heat & stealth test (`tests/world-ai-heat.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import { WorldStreamer } from '../src/world/WorldStreamer';
import { StealthSystem } from '../src/gameplay/StealthSystem';
import { EnforcementSystem } from '../src/ai/EnforcementSystem';
import { TrafficManager } from '../src/ai/TrafficManager';

describe('Subsystem 3: World Streaming, Traffic AI, Harbour Heat & Stealth', () => {
  it('streams 250m cells with velocity lookahead and cleanly disposes unloaded cells without leaks', () => {
    const streamer = new WorldStreamer();
    streamer.update({ x: 0, z: 0 }, { x: 0, z: 20 });
    const initialActive = streamer.getStats().activeCellCount;
    expect(initialActive).toBeGreaterThan(0);

    // Traverse across the 4x4km bay and return
    streamer.update({ x: 1500, z: -1500 }, { x: 15, z: -15 });
    streamer.update({ x: 0, z: 0 }, { x: 0, z: 0 });
    const finalStats = streamer.getStats();
    expect(finalStats.activeCellCount).toBe(initialActive);
    expect(finalStats.leakedResources).toBe(0);
  });

  it('reduces detection signature when lights are cut under bridge cover in rain/fog and decays Harbour Heat', () => {
    const loudSig = StealthSystem.computeSignature({
      lightsOn: true,
      throttle: 1.0,
      weather: 'clear',
      underBridge: false,
      nearTraffic: false,
    });
    const stealthSig = StealthSystem.computeSignature({
      lightsOn: false,
      throttle: 0.1,
      weather: 'rain',
      underBridge: true,
      nearTraffic: true,
    });
    expect(stealthSig).toBeLessThan(loudSig * 0.35);

    const enforcement = new EnforcementSystem();
    enforcement.reportCrime('collision_patrol', { x: 100, z: 100 }, 1.2);
    expect(enforcement.getHeatState().stage).toBe('Alert');
    enforcement.reportCrime('sabotage', { x: 100, z: 100 }, 2.5);
    expect(['Pursuit', 'Lockdown']).toContain(enforcement.getHeatState().stage);

    // Simulate hiding with low signature out of LOS
    for (let i = 0; i < 120; i++) {
      enforcement.update(0.5, { x: 900, z: 900 }, stealthSig, false);
    }
    expect(enforcement.getHeatState().stage).toBe('Clear');
  });

  it('updates spline traffic boats and activates physics/avoidance only within nearby ring', () => {
    const traffic = new TrafficManager();
    traffic.update(1 / 60, { x: 0, z: 0 });
    const boats = traffic.getVessels();
    expect(boats.length).toBeGreaterThanOrEqual(12);
    expect(boats.some((b) => b.isPhysicsActive)).toBe(true);
    expect(boats.some((b) => !b.isPhysicsActive)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world-ai-heat.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `DistrictDefinitions.ts`, `WorldStreamer.ts`, `AtmosphereSystem.ts`, `TrafficManager.ts`, `StealthSystem.ts`, and `EnforcementSystem.ts`**

- [ ] **Step 4: Run test to verify it passes and commit**

Run: `npx vitest run tests/world-ai-heat.test.ts`
Expected: PASS

---

### Task 4: Modular Mission Grammar, Single-Currency Economy, Bilingual EN/JA Neo-Noir HUD, Audio & Telemetry (Subsystem 4)

**Files:**
- Create: `src/data/missions.ts`
- Create: `src/gameplay/MissionManager.ts`
- Create: `src/gameplay/EconomyManager.ts`
- Create: `src/i18n/locales.ts`
- Create: `src/telemetry/TelemetryTracker.ts`
- Create: `src/audio/AudioEngine.ts`
- Create: `src/ui/HudController.ts`
- Create: `src/styles/main.css`
- Create: `src/main.ts`
- Create: `tests/missions-economy-i18n.test.ts`

**Interfaces:**
- Consumes: All Subsystem 1–3 modules.
- Produces:
  - 16 authored contracts in `MISSIONS` across 4 districts with composable stage grammar.
  - `EconomyManager` with single currency (`credits`), trade-off upgrades, boat unlocking, and reconcilable ledger telemetry.
  - Bilingual EN/JA localisation (`t(key, lang)`) with 100% key parity.
  - Complete playable browser application entry in `src/main.ts` and `index.html`.

- [ ] **Step 1: Write the failing missions, economy, telemetry & bilingual localisation test (`tests/missions-economy-i18n.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/data/missions';
import { MissionManager } from '../src/gameplay/MissionManager';
import { EconomyManager } from '../src/gameplay/EconomyManager';
import { TelemetryTracker } from '../src/telemetry/TelemetryTracker';
import { LOCALES, t } from '../src/i18n/locales';

describe('Subsystem 4: Missions, Economy, Telemetry & EN/JA Localisation', () => {
  it('provides 16+ authored contracts across all 4 districts and advances composable mission stages', () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(16);
    const telemetry = new TelemetryTracker();
    const economy = new EconomyManager(telemetry);
    const manager = new MissionManager(economy, telemetry);

    const firstMission = MISSIONS[0];
    manager.startMission(firstMission.id);
    expect(manager.getActiveMission()?.mission.id).toBe(firstMission.id);

    // Complete each stage sequentially
    for (let i = 0; i < firstMission.stages.length; i++) {
      manager.completeCurrentStage();
    }
    expect(manager.getActiveMission()).toBeNull();
    expect(economy.getCredits()).toBeGreaterThan(500);
  });

  it('maintains reconcilable currency ledger and applies non-linear trade-off upgrades', () => {
    const telemetry = new TelemetryTracker();
    const economy = new EconomyManager(telemetry);
    const startBalance = economy.getCredits();
    economy.grantCredits(2500, 'mission_reward');
    const bought = economy.purchaseUpgrade('kuro_skiff', 'prop_hydro_topspeed');
    expect(bought).toBe(true);
    expect(economy.reconcileLedger()).toBe(economy.getCredits());
    const mods = economy.getBoatModifiers('kuro_skiff');
    expect(mods.topSpeedMultiplier).toBeGreaterThan(1.0);
    expect(mods.accelerationMultiplier).toBeLessThan(1.0); // Trade-off axis verified
  });

  it('has 100% key parity between English (en) and Japanese (ja) locales', () => {
    const enKeys = Object.keys(LOCALES.en).sort();
    const jaKeys = Object.keys(LOCALES.ja).sort();
    expect(enKeys).toEqual(jaKeys);
    expect(t('hud.heat.clear', 'ja')).not.toBe('hud.heat.clear');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/missions-economy-i18n.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `missions.ts`, `MissionManager.ts`, `EconomyManager.ts`, `locales.ts`, `TelemetryTracker.ts`, `AudioEngine.ts`, `HudController.ts`, `main.css`, and `main.ts`**

- [ ] **Step 4: Run full Vitest suite and production Vite build**

Run: `npx vitest run && npm run build`
Expected: All tests PASS and `dist/` builds cleanly with zero TypeScript or bundler errors.

- [ ] **Step 5: Commit complete implementation**

Run: `git add -A && git commit -m "feat: complete Neon Tides end-to-end game and Blender-MCP asset pipeline"`
