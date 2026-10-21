export type HarbourHeatStage = 'Clear' | 'Alert' | 'Pursuit' | 'Lockdown';

export interface PatrolUnit {
  id: string;
  position: { x: number; y: number; z: number };
  headingRad: number;
  speedMps: number;
  detectionRangeM: number;
  searchConeAngleRad: number;
  alerted: boolean;
}

export interface HarbourHeatState {
  heatScore: number; // 0..100
  stage: HarbourHeatStage;
  lastKnownCrimePos: { x: number; z: number } | null;
  inLineOfSight: boolean;
  cooldownProgress: number; // 0..1
  activeInterceptors: number;
}

export class EnforcementSystem {
  private heatScore = 0;
  private lastKnownPos: { x: number; z: number } | null = null;
  private inLineOfSight = false;
  private patrols: PatrolUnit[] = [];

  constructor() {
    const patrolSpawns = [
      { x: -180, z: -220 },
      { x: 280, z: -280 },
      { x: -360, z: 320 },
      { x: 380, z: 340 },
    ];
    for (let i = 0; i < patrolSpawns.length; i++) {
      this.patrols.push({
        id: `patrol_${i}`,
        position: { x: patrolSpawns[i].x, y: 0.15, z: patrolSpawns[i].z },
        headingRad: (i * Math.PI) / 2,
        speedMps: 15,
        detectionRangeM: 95,
        searchConeAngleRad: Math.PI / 2.6,
        alerted: false,
      });
    }
  }

  public reportCrime(
    crimeType: 'collision_civilian' | 'collision_patrol' | 'contraband_spotted' | 'sabotage',
    pos: { x: number; z: number },
    severityMultiplier = 1.0,
  ): void {
    const baseGain =
      crimeType === 'collision_civilian'
        ? 14
        : crimeType === 'collision_patrol'
          ? 26
          : crimeType === 'contraband_spotted'
            ? 32
            : 38;
    this.heatScore = Math.min(100, this.heatScore + baseGain * severityMultiplier);
    this.lastKnownPos = { x: pos.x, z: pos.z };
    this.inLineOfSight = true;
  }

  public clearHeat(): void {
    this.heatScore = 0;
    this.lastKnownPos = null;
    this.inLineOfSight = false;
  }

  public update(
    dt: number,
    playerPos: { x: number; z: number },
    playerSignature: number,
    forceLOS?: boolean,
  ): HarbourHeatState {
    let anySpotted = false;

    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i];
      const effectiveRange = p.detectionRangeM * (0.45 + playerSignature * 0.75);
      const dx = playerPos.x - p.position.x;
      const dz = playerPos.z - p.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= effectiveRange) {
        anySpotted = true;
        this.lastKnownPos = { x: playerPos.x, z: playerPos.z };
      }

      // Patrol movement: if heat > 0 and lastKnownPos exists, steer toward search zone
      const stage = this.computeStage(this.heatScore);
      p.alerted = stage !== 'Clear';

      if (p.alerted && this.lastKnownPos) {
        const tx = this.lastKnownPos.x - p.position.x;
        const tz = this.lastKnownPos.z - p.position.z;
        const targetDist = Math.hypot(tx, tz);
        if (targetDist > 12) {
          p.headingRad = Math.atan2(-tx, -tz);
          const chaseSpeed = stage === 'Lockdown' ? 28 : stage === 'Pursuit' ? 23 : 16;
          p.position.x += (tx / targetDist) * chaseSpeed * dt;
          p.position.z += (tz / targetDist) * chaseSpeed * dt;
        } else {
          // Orbit search grid
          p.headingRad += dt * 1.1;
          p.position.x += -Math.sin(p.headingRad) * 12 * dt;
          p.position.z += -Math.cos(p.headingRad) * 12 * dt;
        }
      } else {
        // Routine harbour patrol circle
        p.headingRad += dt * 0.35;
        p.position.x += -Math.sin(p.headingRad) * 10 * dt;
        p.position.z += -Math.cos(p.headingRad) * 10 * dt;
      }
    }

    this.inLineOfSight = forceLOS !== undefined ? forceLOS : anySpotted;

    if (this.heatScore > 0) {
      if (!this.inLineOfSight) {
        // Faster decay when player cuts lights/engine (low signature)
        const stealthDecayMultiplier = 1.8 - playerSignature * 1.1;
        this.heatScore = Math.max(0, this.heatScore - dt * 5.5 * stealthDecayMultiplier);
      } else {
        // Slowly escalate heat while actively pursued in LOS
        this.heatScore = Math.min(100, this.heatScore + dt * 1.5 * playerSignature);
      }
    }

    return this.getHeatState();
  }

  public getPatrols(): PatrolUnit[] {
    return this.patrols;
  }

  public getHeatState(): HarbourHeatState {
    const stage = this.computeStage(this.heatScore);
    const activeInterceptors =
      stage === 'Lockdown' ? 4 : stage === 'Pursuit' ? 3 : stage === 'Alert' ? 1 : 0;

    return {
      heatScore: Number(this.heatScore.toFixed(1)),
      stage,
      lastKnownCrimePos: this.lastKnownPos,
      inLineOfSight: this.inLineOfSight,
      cooldownProgress: this.inLineOfSight ? 0 : Math.max(0, 1 - (this.heatScore % 25) / 25),
      activeInterceptors,
    };
  }

  private computeStage(score: number): HarbourHeatStage {
    if (score < 15) return 'Clear';
    if (score < 45) return 'Alert';
    if (score < 78) return 'Pursuit';
    return 'Lockdown';
  }
}
