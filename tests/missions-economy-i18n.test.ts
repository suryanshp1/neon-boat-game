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
