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
    const speed = new BoatDynamics(world, BOAT_ARCHETYPES.inazuma_gt, { x: 25, y: 1.5, z: 0 });

    for (let i = 0; i < 180; i++) {
      skiff.step(1 / 60, { throttle: 1, steer: 0, boost: false, drift: false }, i / 60, 'clear');
      speed.step(1 / 60, { throttle: 1, steer: 0, boost: false, drift: false }, i / 60, 'clear');
      world.step();
    }

    const skiffState = skiff.getState();
    const speedState = speed.getState();
    expect(skiffState.speedMps).toBeGreaterThan(5);
    expect(speedState.speedMps).toBeGreaterThan(skiffState.speedMps);
    expect(skiffState.position.y).toBeGreaterThan(-0.12);
    expect(skiffState.position.y).toBeLessThan(0.85);
  });

  it('keeps all 3 boat archetypes upright and floating on the waterline without capsizing or sinking', () => {
    for (const spec of Object.values(BOAT_ARCHETYPES)) {
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      const boat = new BoatDynamics(world, spec, { x: 0, y: 0.6, z: 0 });

      for (let i = 0; i < 600; i++) {
        const steer = i > 200 && i < 400 ? 0.85 : 0;
        const throttle = i > 100 ? 1.0 : 0;
        boat.step(1 / 60, { throttle, steer, boost: i > 450, drift: false }, i / 60, 'clear');
        world.step();
      }

      const st = boat.getState();
      // Compute world up Y component from quaternion: 1 - 2*(x^2 + z^2)
      const upY = 1 - 2 * (st.rotation.x * st.rotation.x + st.rotation.z * st.rotation.z);
      expect(upY).toBeGreaterThan(0.85);
      expect(st.position.y).toBeGreaterThan(-0.12);
      expect(st.position.y).toBeLessThan(0.85);
    }
  });

  it('resolves physical circle collisions against structures/vessels and applies impact hull damage', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const boat = new BoatDynamics(world, BOAT_ARCHETYPES.kuro_skiff, { x: 0, y: 0.3, z: 0 });

    // Accelerate forward toward an obstacle at (0, -8)
    for (let i = 0; i < 60; i++) {
      boat.step(1 / 60, { throttle: 1, steer: 0, boost: true, drift: false }, i / 60, 'clear');
      world.step();
    }
    const beforeState = boat.getState();
    const impact = boat.resolveCircleCollision(beforeState.position.x, beforeState.position.z - 2.0, 4.0);
    const afterState = boat.getState();

    expect(impact).toBeGreaterThan(2.0);
    expect(afterState.hullHp).toBeLessThan(beforeState.hullHp);
  });
});
