export type BoatId = 'kuro_skiff' | 'inazuma_gt' | 'kujira_work';

export interface BoatSpec {
  id: BoatId;
  nameKey: string;
  roleKey: string;
  assetId: string;
  unlockCost: number;
  length: number;
  width: number;
  height: number;
  massKg: number;
  thrustForce: number;
  topSpeedMps: number;
  turnTorque: number;
  longitudinalDrag: number;
  lateralGripDrag: number;
  driftSlipFactor: number;
  buoyancyStiffness: number;
  stabilityRollRestore: number;
  maxHullHp: number;
  cargoCapacity: number;
  baseSignatureNoise: number;
  accentColorHex: number;
}

export const BOAT_ARCHETYPES: Record<BoatId, BoatSpec> = {
  kuro_skiff: {
    id: 'kuro_skiff',
    nameKey: 'boat.kuro_skiff.name',
    roleKey: 'boat.kuro_skiff.role',
    assetId: 'boat_skiff',
    unlockCost: 0,
    length: 6.5,
    width: 2.2,
    height: 1.8,
    massKg: 420,
    thrustForce: 13800,
    topSpeedMps: 26,
    turnTorque: 3600,
    longitudinalDrag: 135,
    lateralGripDrag: 980,
    driftSlipFactor: 0.45,
    buoyancyStiffness: 3800,
    stabilityRollRestore: 4200,
    maxHullHp: 100,
    cargoCapacity: 4,
    baseSignatureNoise: 0.45,
    accentColorHex: 0x00f2ff,
  },
  inazuma_gt: {
    id: 'inazuma_gt',
    nameKey: 'boat.inazuma_gt.name',
    roleKey: 'boat.inazuma_gt.role',
    assetId: 'boat_speedboat',
    unlockCost: 3500,
    length: 8.4,
    width: 2.6,
    height: 1.9,
    massKg: 540,
    thrustForce: 25500,
    topSpeedMps: 42,
    turnTorque: 4800,
    longitudinalDrag: 140,
    lateralGripDrag: 1120,
    driftSlipFactor: 0.28,
    buoyancyStiffness: 4900,
    stabilityRollRestore: 5400,
    maxHullHp: 90,
    cargoCapacity: 2,
    baseSignatureNoise: 0.78,
    accentColorHex: 0xff1e8e,
  },
  kujira_work: {
    id: 'kujira_work',
    nameKey: 'boat.kujira_work.name',
    roleKey: 'boat.kujira_work.role',
    assetId: 'boat_workboat',
    unlockCost: 4200,
    length: 10.5,
    width: 3.8,
    height: 3.6,
    massKg: 980,
    thrustForce: 24000,
    topSpeedMps: 22,
    turnTorque: 4400,
    longitudinalDrag: 290,
    lateralGripDrag: 1850,
    driftSlipFactor: 0.65,
    buoyancyStiffness: 8800,
    stabilityRollRestore: 9800,
    maxHullHp: 220,
    cargoCapacity: 12,
    baseSignatureNoise: 0.58,
    accentColorHex: 0xffae00,
  },
};
