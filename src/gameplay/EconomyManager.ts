import { BOAT_ARCHETYPES, BoatId } from '../entities/BoatArchetypes';
import { BoatUpgradeModifiers } from '../physics/BoatDynamics';
import { TelemetryTracker } from '../telemetry/TelemetryTracker';

export type CurrencyReason =
  | 'initial_seed'
  | 'mission_reward'
  | 'salvage_sale'
  | 'hull_repair'
  | 'upgrade_purchase'
  | 'boat_unlock'
  | 'collision_fine';

export type UpgradeId =
  | 'prop_torque_accel'
  | 'prop_hydro_topspeed'
  | 'hull_keel_grip'
  | 'hull_drift_chine'
  | 'armor_reinforced'
  | 'armor_carbon_light'
  | 'exhaust_baffled_stealth'
  | 'exhaust_open_afterburner';

export interface UpgradeSpec {
  id: UpgradeId;
  axis: 'propulsion' | 'handling' | 'hull' | 'exhaust';
  nameKey: string;
  descKey: string;
  cost: number;
  modifiers: Partial<BoatUpgradeModifiers>;
}

export const UPGRADE_CATALOG: Record<UpgradeId, UpgradeSpec> = {
  prop_torque_accel: {
    id: 'prop_torque_accel',
    axis: 'propulsion',
    nameKey: 'upgrade.prop_torque_accel.name',
    descKey: 'upgrade.prop_torque_accel.desc',
    cost: 950,
    modifiers: { accelerationMultiplier: 1.28, topSpeedMultiplier: 0.94 },
  },
  prop_hydro_topspeed: {
    id: 'prop_hydro_topspeed',
    axis: 'propulsion',
    nameKey: 'upgrade.prop_hydro_topspeed.name',
    descKey: 'upgrade.prop_hydro_topspeed.desc',
    cost: 1100,
    modifiers: { topSpeedMultiplier: 1.24, accelerationMultiplier: 0.92 },
  },
  hull_keel_grip: {
    id: 'hull_keel_grip',
    axis: 'handling',
    nameKey: 'upgrade.hull_keel_grip.name',
    descKey: 'upgrade.hull_keel_grip.desc',
    cost: 850,
    modifiers: { gripMultiplier: 1.32 },
  },
  hull_drift_chine: {
    id: 'hull_drift_chine',
    axis: 'handling',
    nameKey: 'upgrade.hull_drift_chine.name',
    descKey: 'upgrade.hull_drift_chine.desc',
    cost: 900,
    modifiers: { gripMultiplier: 0.76, accelerationMultiplier: 1.08 },
  },
  armor_reinforced: {
    id: 'armor_reinforced',
    axis: 'hull',
    nameKey: 'upgrade.armor_reinforced.name',
    descKey: 'upgrade.armor_reinforced.desc',
    cost: 1200,
    modifiers: { armorMultiplier: 1.45, topSpeedMultiplier: 0.93 },
  },
  armor_carbon_light: {
    id: 'armor_carbon_light',
    axis: 'hull',
    nameKey: 'upgrade.armor_carbon_light.name',
    descKey: 'upgrade.armor_carbon_light.desc',
    cost: 1350,
    modifiers: { armorMultiplier: 0.85, topSpeedMultiplier: 1.12, accelerationMultiplier: 1.1 },
  },
  exhaust_baffled_stealth: {
    id: 'exhaust_baffled_stealth',
    axis: 'exhaust',
    nameKey: 'upgrade.exhaust_baffled_stealth.name',
    descKey: 'upgrade.exhaust_baffled_stealth.desc',
    cost: 1150,
    modifiers: { noiseMultiplier: 0.55, topSpeedMultiplier: 0.96 },
  },
  exhaust_open_afterburner: {
    id: 'exhaust_open_afterburner',
    axis: 'exhaust',
    nameKey: 'upgrade.exhaust_open_afterburner.name',
    descKey: 'upgrade.exhaust_open_afterburner.desc',
    cost: 1250,
    modifiers: { noiseMultiplier: 1.35, topSpeedMultiplier: 1.15, accelerationMultiplier: 1.14 },
  },
};

export interface LedgerEntry {
  delta: number;
  reason: CurrencyReason;
  timestamp: number;
}

export class EconomyManager {
  private credits = 500;
  private reputation = 0;
  private activeBoat: BoatId = 'kuro_skiff';
  private unlockedBoats = new Set<BoatId>(['kuro_skiff']);
  private equippedUpgrades: Record<BoatId, Partial<Record<UpgradeSpec['axis'], UpgradeId>>> = {
    kuro_skiff: {},
    inazuma_gt: {},
    kujira_work: {},
  };
  private ledger: LedgerEntry[] = [{ delta: 500, reason: 'initial_seed', timestamp: Date.now() }];
  private telemetry: TelemetryTracker;

  constructor(telemetry: TelemetryTracker) {
    this.telemetry = telemetry;
  }

  public getCredits(): number {
    return this.credits;
  }

  public getReputation(): number {
    return this.reputation;
  }

  public addReputation(amount: number): void {
    this.reputation += Math.max(0, amount);
  }

  public grantCredits(amount: number, reason: CurrencyReason): void {
    if (amount <= 0) return;
    this.credits += amount;
    this.ledger.push({ delta: amount, reason, timestamp: Date.now() });
    this.telemetry.track('currency_source', { amount, reason, balance: this.credits });
  }

  public spendCredits(amount: number, reason: CurrencyReason): boolean {
    if (amount <= 0 || this.credits < amount) return false;
    this.credits -= amount;
    this.ledger.push({ delta: -amount, reason, timestamp: Date.now() });
    this.telemetry.track('currency_sink', { amount, reason, balance: this.credits });
    return true;
  }

  public reconcileLedger(): number {
    return this.ledger.reduce((sum, item) => sum + item.delta, 0);
  }

  public isBoatUnlocked(boatId: BoatId): boolean {
    return this.unlockedBoats.has(boatId);
  }

  public unlockAndSelectBoat(boatId: BoatId): boolean {
    if (this.unlockedBoats.has(boatId)) {
      this.activeBoat = boatId;
      return true;
    }
    const cost = BOAT_ARCHETYPES[boatId].unlockCost;
    if (!this.spendCredits(cost, 'boat_unlock')) {
      return false;
    }
    this.unlockedBoats.add(boatId);
    this.activeBoat = boatId;
    this.telemetry.track('boat_purchase', { boatId, cost });
    return true;
  }

  public getActiveBoat(): BoatId {
    return this.activeBoat;
  }

  public purchaseUpgrade(boatId: BoatId, upgradeId: UpgradeId): boolean {
    const spec = UPGRADE_CATALOG[upgradeId];
    if (!spec) return false;
    if (!this.spendCredits(spec.cost, 'upgrade_purchase')) {
      return false;
    }
    this.equippedUpgrades[boatId][spec.axis] = upgradeId;
    this.telemetry.track('upgrade_purchase', { boatId, upgradeId, axis: spec.axis, cost: spec.cost });
    return true;
  }

  public getEquippedUpgrades(boatId: BoatId): Partial<Record<UpgradeSpec['axis'], UpgradeId>> {
    return this.equippedUpgrades[boatId];
  }

  public getBoatModifiers(boatId: BoatId): BoatUpgradeModifiers {
    const base: BoatUpgradeModifiers = {
      topSpeedMultiplier: 1.0,
      accelerationMultiplier: 1.0,
      gripMultiplier: 1.0,
      armorMultiplier: 1.0,
      noiseMultiplier: 1.0,
    };

    const equipped = this.equippedUpgrades[boatId];
    for (const upgradeId of Object.values(equipped)) {
      if (!upgradeId) continue;
      const mod = UPGRADE_CATALOG[upgradeId].modifiers;
      if (mod.topSpeedMultiplier) base.topSpeedMultiplier *= mod.topSpeedMultiplier;
      if (mod.accelerationMultiplier) base.accelerationMultiplier *= mod.accelerationMultiplier;
      if (mod.gripMultiplier) base.gripMultiplier *= mod.gripMultiplier;
      if (mod.armorMultiplier) base.armorMultiplier *= mod.armorMultiplier;
      if (mod.noiseMultiplier) base.noiseMultiplier *= mod.noiseMultiplier;
    }

    return base;
  }
}
