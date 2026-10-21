import { DistrictId } from '../world/DistrictDefinitions';

export type MissionStageType =
  | 'go_to'
  | 'collect'
  | 'race_checkpoints'
  | 'avoid_detection'
  | 'deliver_fragile'
  | 'salvage_drone'
  | 'disable_target'
  | 'escape_heat'
  | 'photograph_landmark'
  | 'return_marina';

export interface MissionStageSpec {
  id: string;
  type: MissionStageType;
  labelKey: string;
  targetPos: { x: number; z: number };
  radius: number;
  timeLimitSec?: number;
  maxAllowedSignature?: number;
}

export interface MissionSpec {
  id: string;
  titleKey: string;
  briefKey: string;
  district: DistrictId;
  category: 'courier' | 'race' | 'salvage' | 'illicit' | 'pursuit' | 'sabotage' | 'story';
  rewardCredits: number;
  rewardReputation: number;
  recommendedBoat?: 'kuro_skiff' | 'inazuma_gt' | 'kujira_work';
  stages: MissionStageSpec[];
}

export const MISSIONS: MissionSpec[] = [
  {
    id: 'mirai_courier_01',
    titleKey: 'mission.mirai_courier_01.title',
    briefKey: 'mission.mirai_courier_01.brief',
    district: 'mirai_harbour',
    category: 'courier',
    rewardCredits: 900,
    rewardReputation: 15,
    recommendedBoat: 'kuro_skiff',
    stages: [
      {
        id: 's1',
        type: 'go_to',
        labelKey: 'stage.pickup_dock',
        targetPos: { x: -140, z: -160 },
        radius: 26,
      },
      {
        id: 's2',
        type: 'deliver_fragile',
        labelKey: 'stage.deliver_harbour_tower',
        targetPos: { x: -340, z: -280 },
        radius: 28,
      },
      {
        id: 's3',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 30,
      },
    ],
  },
  {
    id: 'mirai_race_02',
    titleKey: 'mission.mirai_race_02.title',
    briefKey: 'mission.mirai_race_02.brief',
    district: 'mirai_harbour',
    category: 'race',
    rewardCredits: 1250,
    rewardReputation: 25,
    recommendedBoat: 'inazuma_gt',
    stages: [
      {
        id: 's1',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_alpha',
        targetPos: { x: -240, z: -120 },
        radius: 30,
        timeLimitSec: 90,
      },
      {
        id: 's2',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_beta',
        targetPos: { x: -460, z: -340 },
        radius: 30,
        timeLimitSec: 90,
      },
      {
        id: 's3',
        type: 'race_checkpoints',
        labelKey: 'stage.finish_line',
        targetPos: { x: -110, z: -190 },
        radius: 32,
        timeLimitSec: 90,
      },
    ],
  },
  {
    id: 'mirai_photo_03',
    titleKey: 'mission.mirai_photo_03.title',
    briefKey: 'mission.mirai_photo_03.brief',
    district: 'mirai_harbour',
    category: 'courier',
    rewardCredits: 850,
    rewardReputation: 15,
    stages: [
      {
        id: 's1',
        type: 'photograph_landmark',
        labelKey: 'stage.photo_bridge',
        targetPos: { x: -120, z: -180 },
        radius: 36,
      },
      {
        id: 's2',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 30,
      },
    ],
  },
  {
    id: 'mirai_story_04',
    titleKey: 'mission.mirai_story_04.title',
    briefKey: 'mission.mirai_story_04.brief',
    district: 'mirai_harbour',
    category: 'story',
    rewardCredits: 1600,
    rewardReputation: 35,
    stages: [
      {
        id: 's1',
        type: 'collect',
        labelKey: 'stage.collect_transponder',
        targetPos: { x: -380, z: -140 },
        radius: 26,
      },
      {
        id: 's2',
        type: 'avoid_detection',
        labelKey: 'stage.slip_past_patrol',
        targetPos: { x: -80, z: -260 },
        radius: 28,
        maxAllowedSignature: 0.45,
      },
    ],
  },
  {
    id: 'akari_race_01',
    titleKey: 'mission.akari_race_01.title',
    briefKey: 'mission.akari_race_01.brief',
    district: 'akari_canal',
    category: 'race',
    rewardCredits: 1450,
    rewardReputation: 30,
    recommendedBoat: 'inazuma_gt',
    stages: [
      {
        id: 's1',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_alpha',
        targetPos: { x: 180, z: -180 },
        radius: 26,
        timeLimitSec: 85,
      },
      {
        id: 's2',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_beta',
        targetPos: { x: 360, z: -340 },
        radius: 26,
        timeLimitSec: 85,
      },
      {
        id: 's3',
        type: 'race_checkpoints',
        labelKey: 'stage.finish_line',
        targetPos: { x: 480, z: -420 },
        radius: 30,
        timeLimitSec: 85,
      },
    ],
  },
  {
    id: 'akari_illicit_02',
    titleKey: 'mission.akari_illicit_02.title',
    briefKey: 'mission.akari_illicit_02.brief',
    district: 'akari_canal',
    category: 'illicit',
    rewardCredits: 1800,
    rewardReputation: 40,
    stages: [
      {
        id: 's1',
        type: 'collect',
        labelKey: 'stage.pickup_dock',
        targetPos: { x: 240, z: -220 },
        radius: 25,
      },
      {
        id: 's2',
        type: 'avoid_detection',
        labelKey: 'stage.under_bridge_drop',
        targetPos: { x: 340, z: -320 },
        radius: 28,
        maxAllowedSignature: 0.4,
      },
    ],
  },
  {
    id: 'akari_pursuit_03',
    titleKey: 'mission.akari_pursuit_03.title',
    briefKey: 'mission.akari_pursuit_03.brief',
    district: 'akari_canal',
    category: 'pursuit',
    rewardCredits: 1950,
    rewardReputation: 45,
    stages: [
      {
        id: 's1',
        type: 'go_to',
        labelKey: 'stage.decoy_point',
        targetPos: { x: 420, z: -260 },
        radius: 28,
      },
      {
        id: 's2',
        type: 'escape_heat',
        labelKey: 'stage.escape_harbour_heat',
        targetPos: { x: 120, z: -80 },
        radius: 35,
      },
    ],
  },
  {
    id: 'akari_courier_04',
    titleKey: 'mission.akari_courier_04.title',
    briefKey: 'mission.akari_courier_04.brief',
    district: 'akari_canal',
    category: 'courier',
    rewardCredits: 1100,
    rewardReputation: 20,
    stages: [
      {
        id: 's1',
        type: 'deliver_fragile',
        labelKey: 'stage.night_market_drop',
        targetPos: { x: 310, z: -390 },
        radius: 26,
      },
    ],
  },
  {
    id: 'kogyo_salvage_01',
    titleKey: 'mission.kogyo_salvage_01.title',
    briefKey: 'mission.kogyo_salvage_01.brief',
    district: 'kogyo_islands',
    category: 'salvage',
    rewardCredits: 1700,
    rewardReputation: 35,
    recommendedBoat: 'kujira_work',
    stages: [
      {
        id: 's1',
        type: 'salvage_drone',
        labelKey: 'stage.salvage_blackbox',
        targetPos: { x: -320, z: 280 },
        radius: 28,
      },
      {
        id: 's2',
        type: 'salvage_drone',
        labelKey: 'stage.salvage_turbine',
        targetPos: { x: -460, z: 410 },
        radius: 28,
      },
      {
        id: 's3',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 32,
      },
    ],
  },
  {
    id: 'kogyo_sabotage_02',
    titleKey: 'mission.kogyo_sabotage_02.title',
    briefKey: 'mission.kogyo_sabotage_02.brief',
    district: 'kogyo_islands',
    category: 'sabotage',
    rewardCredits: 2200,
    rewardReputation: 50,
    stages: [
      {
        id: 's1',
        type: 'disable_target',
        labelKey: 'stage.disable_drone_barge',
        targetPos: { x: -420, z: 380 },
        radius: 30,
      },
      {
        id: 's2',
        type: 'escape_heat',
        labelKey: 'stage.escape_harbour_heat',
        targetPos: { x: -140, z: 120 },
        radius: 34,
      },
    ],
  },
  {
    id: 'kogyo_courier_03',
    titleKey: 'mission.kogyo_courier_03.title',
    briefKey: 'mission.kogyo_courier_03.brief',
    district: 'kogyo_islands',
    category: 'courier',
    rewardCredits: 1500,
    rewardReputation: 30,
    recommendedBoat: 'kujira_work',
    stages: [
      {
        id: 's1',
        type: 'collect',
        labelKey: 'stage.pickup_dock',
        targetPos: { x: -260, z: 220 },
        radius: 28,
      },
      {
        id: 's2',
        type: 'deliver_fragile',
        labelKey: 'stage.deliver_crane_pier',
        targetPos: { x: -540, z: 490 },
        radius: 30,
      },
    ],
  },
  {
    id: 'kogyo_race_04',
    titleKey: 'mission.kogyo_race_04.title',
    briefKey: 'mission.kogyo_race_04.brief',
    district: 'kogyo_islands',
    category: 'race',
    rewardCredits: 1850,
    rewardReputation: 40,
    recommendedBoat: 'inazuma_gt',
    stages: [
      {
        id: 's1',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_alpha',
        targetPos: { x: -220, z: 180 },
        radius: 28,
      },
      {
        id: 's2',
        type: 'race_checkpoints',
        labelKey: 'stage.finish_line',
        targetPos: { x: -480, z: 440 },
        radius: 30,
      },
    ],
  },
  {
    id: 'seto_salvage_01',
    titleKey: 'mission.seto_salvage_01.title',
    briefKey: 'mission.seto_salvage_01.brief',
    district: 'seto_outer',
    category: 'salvage',
    rewardCredits: 2100,
    rewardReputation: 45,
    recommendedBoat: 'kujira_work',
    stages: [
      {
        id: 's1',
        type: 'salvage_drone',
        labelKey: 'stage.salvage_relic',
        targetPos: { x: 420, z: 390 },
        radius: 30,
      },
      {
        id: 's2',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 32,
      },
    ],
  },
  {
    id: 'seto_photo_02',
    titleKey: 'mission.seto_photo_02.title',
    briefKey: 'mission.seto_photo_02.brief',
    district: 'seto_outer',
    category: 'courier',
    rewardCredits: 1400,
    rewardReputation: 30,
    stages: [
      {
        id: 's1',
        type: 'photograph_landmark',
        labelKey: 'stage.photo_torii',
        targetPos: { x: 520, z: 480 },
        radius: 36,
      },
    ],
  },
  {
    id: 'seto_illicit_03',
    titleKey: 'mission.seto_illicit_03.title',
    briefKey: 'mission.seto_illicit_03.brief',
    district: 'seto_outer',
    category: 'illicit',
    rewardCredits: 2400,
    rewardReputation: 55,
    stages: [
      {
        id: 's1',
        type: 'avoid_detection',
        labelKey: 'stage.fog_channel_run',
        targetPos: { x: 610, z: 540 },
        radius: 32,
        maxAllowedSignature: 0.42,
      },
      {
        id: 's2',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 32,
      },
    ],
  },
  {
    id: 'seto_story_04',
    titleKey: 'mission.seto_story_04.title',
    briefKey: 'mission.seto_story_04.brief',
    district: 'seto_outer',
    category: 'story',
    rewardCredits: 3200,
    rewardReputation: 80,
    recommendedBoat: 'inazuma_gt',
    stages: [
      {
        id: 's1',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_alpha',
        targetPos: { x: 320, z: 260 },
        radius: 32,
      },
      {
        id: 's2',
        type: 'race_checkpoints',
        labelKey: 'stage.checkpoint_beta',
        targetPos: { x: 520, z: 480 },
        radius: 32,
      },
      {
        id: 's3',
        type: 'return_marina',
        labelKey: 'stage.return_marina',
        targetPos: { x: -60, z: -60 },
        radius: 35,
      },
    ],
  },
];
