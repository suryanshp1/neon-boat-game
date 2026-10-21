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

    // Traverse across the 4x4km bay and return to identical state
    streamer.update({ x: 1500, z: -1500 }, { x: 15, z: -15 });
    streamer.update({ x: 0, z: 0 }, { x: 0, z: 20 });
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
