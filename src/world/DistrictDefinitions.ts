export type DistrictId = 'mirai_harbour' | 'akari_canal' | 'kogyo_islands' | 'seto_outer';

export interface LandmarkSpec {
  id: string;
  nameKey: string;
  district: DistrictId;
  assetId: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  scale: number;
  providesBridgeCover: boolean;
  coverRadius: number;
}

export interface DistrictSpec {
  id: DistrictId;
  nameKey: string;
  descKey: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  primaryColorHex: number;
  secondaryColorHex: number;
  ambientDensity: number;
}

export const DISTRICTS: Record<DistrictId, DistrictSpec> = {
  mirai_harbour: {
    id: 'mirai_harbour',
    nameKey: 'district.mirai_harbour.name',
    descKey: 'district.mirai_harbour.desc',
    bounds: { minX: -2000, maxX: 0, minZ: -2000, maxZ: 0 },
    primaryColorHex: 0x00e5ff,
    secondaryColorHex: 0x2979ff,
    ambientDensity: 0.75,
  },
  akari_canal: {
    id: 'akari_canal',
    nameKey: 'district.akari_canal.name',
    descKey: 'district.akari_canal.desc',
    bounds: { minX: 0, maxX: 2000, minZ: -2000, maxZ: 0 },
    primaryColorHex: 0xff1e8e,
    secondaryColorHex: 0x00f6ff,
    ambientDensity: 0.95,
  },
  kogyo_islands: {
    id: 'kogyo_islands',
    nameKey: 'district.kogyo_islands.name',
    descKey: 'district.kogyo_islands.desc',
    bounds: { minX: -2000, maxX: 0, minZ: 0, maxZ: 2000 },
    primaryColorHex: 0xff9100,
    secondaryColorHex: 0xff3d00,
    ambientDensity: 0.85,
  },
  seto_outer: {
    id: 'seto_outer',
    nameKey: 'district.seto_outer.name',
    descKey: 'district.seto_outer.desc',
    bounds: { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 },
    primaryColorHex: 0xff2a1f,
    secondaryColorHex: 0xffd54f,
    ambientDensity: 0.45,
  },
};

export const LANDMARKS: LandmarkSpec[] = [
  {
    id: 'mirai_home_marina_bridge',
    nameKey: 'landmark.mirai_bridge.name',
    district: 'mirai_harbour',
    assetId: 'bridge_span',
    position: { x: -120, y: 0, z: -180 },
    rotationY: 0.35,
    scale: 1.2,
    providesBridgeCover: true,
    coverRadius: 32,
  },
  {
    id: 'akari_neon_overpass_01',
    nameKey: 'landmark.akari_overpass.name',
    district: 'akari_canal',
    assetId: 'bridge_span',
    position: { x: 340, y: 0, z: -320 },
    rotationY: -0.6,
    scale: 1.0,
    providesBridgeCover: true,
    coverRadius: 28,
  },
  {
    id: 'akari_grand_sign_tower',
    nameKey: 'landmark.akari_tower.name',
    district: 'akari_canal',
    assetId: 'building_akari_neon',
    position: { x: 460, y: 0, z: -420 },
    rotationY: 0,
    scale: 1.35,
    providesBridgeCover: false,
    coverRadius: 0,
  },
  {
    id: 'kogyo_mega_gantry_01',
    nameKey: 'landmark.kogyo_crane.name',
    district: 'kogyo_islands',
    assetId: 'crane_kogyo',
    position: { x: -420, y: 0, z: 380 },
    rotationY: 1.57,
    scale: 1.3,
    providesBridgeCover: true,
    coverRadius: 24,
  },
  {
    id: 'seto_offshore_torii',
    nameKey: 'landmark.seto_torii.name',
    district: 'seto_outer',
    assetId: 'torii_gate',
    position: { x: 520, y: 0, z: 480 },
    rotationY: -0.78,
    scale: 1.4,
    providesBridgeCover: true,
    coverRadius: 18,
  },
];

export function getDistrictAtPosition(x: number, z: number): DistrictSpec {
  if (x < 0 && z < 0) return DISTRICTS.mirai_harbour;
  if (x >= 0 && z < 0) return DISTRICTS.akari_canal;
  if (x < 0 && z >= 0) return DISTRICTS.kogyo_islands;
  return DISTRICTS.seto_outer;
}

export function isUnderBridgeOrCover(x: number, z: number): boolean {
  for (const lm of LANDMARKS) {
    if (!lm.providesBridgeCover) continue;
    const dist = Math.hypot(x - lm.position.x, z - lm.position.z);
    if (dist <= lm.coverRadius) {
      return true;
    }
  }
  return false;
}
