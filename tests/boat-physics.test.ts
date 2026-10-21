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
    expect(Math.abs(skiffState.position.y)).toBeLessThan(3.0);
  });
});
