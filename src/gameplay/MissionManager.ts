import { MISSIONS, MissionSpec, MissionStageSpec } from '../data/missions';
import { EconomyManager } from './EconomyManager';
import { TelemetryTracker } from '../telemetry/TelemetryTracker';
import { HarbourHeatStage } from '../ai/EnforcementSystem';

export interface ActiveMissionState {
  mission: MissionSpec;
  stageIndex: number;
  currentStage: MissionStageSpec;
  elapsedSec: number;
  stageRemainingSec: number | null;
}

export interface MissionLifecycleCallbacks {
  onMissionStart?: (mission: MissionSpec) => void;
  onStageComplete?: (mission: MissionSpec, completedStageIndex: number) => void;
  onMissionComplete?: (mission: MissionSpec) => void;
  onMissionFail?: (mission: MissionSpec, reason: string) => void;
}

export class MissionManager {
  private economy: EconomyManager;
  private telemetry: TelemetryTracker;
  private callbacks?: MissionLifecycleCallbacks;
  private active: ActiveMissionState | null = null;
  private completedMissionIds = new Set<string>();

  constructor(
    economy: EconomyManager,
    telemetry: TelemetryTracker,
    callbacks?: MissionLifecycleCallbacks,
  ) {
    this.economy = economy;
    this.telemetry = telemetry;
    this.callbacks = callbacks;
  }

  public getAvailableMissions(): MissionSpec[] {
    return MISSIONS;
  }

  public getCompletedMissionIds(): ReadonlySet<string> {
    return this.completedMissionIds;
  }

  public getActiveMission(): ActiveMissionState | null {
    return this.active;
  }

  public startMission(missionId: string): boolean {
    const spec = MISSIONS.find((m) => m.id === missionId);
    if (!spec || spec.stages.length === 0) return false;

    this.active = {
      mission: spec,
      stageIndex: 0,
      currentStage: spec.stages[0],
      elapsedSec: 0,
      stageRemainingSec: spec.stages[0].timeLimitSec ?? null,
    };
    this.telemetry.track('mission_start', { missionId: spec.id, district: spec.district });
    this.callbacks?.onMissionStart?.(spec);
    return true;
  }

  public abandonMission(): void {
    if (!this.active) return;
    this.telemetry.track('mission_abandon', {
      missionId: this.active.mission.id,
      stageIndex: this.active.stageIndex,
      elapsedSec: this.active.elapsedSec,
    });
    this.active = null;
  }

  public completeCurrentStage(): void {
    if (!this.active) return;
    const m = this.active.mission;
    const completedIdx = this.active.stageIndex;
    const nextIdx = completedIdx + 1;
    this.callbacks?.onStageComplete?.(m, completedIdx);
    if (nextIdx >= m.stages.length) {
      this.completedMissionIds.add(m.id);
      this.economy.grantCredits(m.rewardCredits, 'mission_reward');
      this.economy.addReputation(m.rewardReputation);
      this.telemetry.track('mission_complete', {
        missionId: m.id,
        rewardCredits: m.rewardCredits,
        elapsedSec: Number(this.active.elapsedSec.toFixed(1)),
      });
      this.active = null;
      this.callbacks?.onMissionComplete?.(m);
    } else {
      const nextStage = m.stages[nextIdx];
      this.active.stageIndex = nextIdx;
      this.active.currentStage = nextStage;
      this.active.stageRemainingSec = nextStage.timeLimitSec ?? null;
    }
  }

  public update(
    dt: number,
    playerPos: { x: number; z: number },
    playerSignature: number,
    heatStage: HarbourHeatStage,
  ): ActiveMissionState | null {
    if (!this.active) return null;

    this.active.elapsedSec += dt;
    if (this.active.stageRemainingSec !== null) {
      this.active.stageRemainingSec -= dt;
      if (this.active.stageRemainingSec <= 0) {
        const failedMission = this.active.mission;
        this.telemetry.track('mission_fail', {
          missionId: failedMission.id,
          reason: 'timeout',
        });
        this.active = null;
        this.callbacks?.onMissionFail?.(failedMission, 'timeout');
        return null;
      }
    }

    const st = this.active.currentStage;
    const dist = Math.hypot(playerPos.x - st.targetPos.x, playerPos.z - st.targetPos.z);

    if (dist <= st.radius) {
      if (st.type === 'avoid_detection' && st.maxAllowedSignature !== undefined) {
        if (playerSignature <= st.maxAllowedSignature) {
          this.completeCurrentStage();
        }
      } else if (st.type === 'escape_heat') {
        if (heatStage === 'Clear') {
          this.completeCurrentStage();
        }
      } else {
        this.completeCurrentStage();
      }
    }

    return this.active;
  }
}
