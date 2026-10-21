import RAPIER from '@dimforge/rapier3d-compat';
import { WaterField, WeatherState } from '../core/WaterField';
import { BoatSpec } from '../entities/BoatArchetypes';

export interface BoatControlInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (left/right)
  boost: boolean;
  drift: boolean;
}

export interface BoatUpgradeModifiers {
  topSpeedMultiplier: number;
  accelerationMultiplier: number;
  gripMultiplier: number;
  armorMultiplier: number;
  noiseMultiplier: number;
}

export interface BoatTelemetryState {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  speedMps: number;
  speedKnots: number;
  headingRad: number;
  submergedRatio: number;
  isAirborne: boolean;
  driftSlipAngleDeg: number;
  hullHp: number;
  maxHullHp: number;
}

interface HullPontoonOffset {
  ox: number;
  oy: number;
  oz: number;
}

const DEFAULT_MODIFIERS: BoatUpgradeModifiers = {
  topSpeedMultiplier: 1.0,
  accelerationMultiplier: 1.0,
  gripMultiplier: 1.0,
  armorMultiplier: 1.0,
  noiseMultiplier: 1.0,
};

export class BoatDynamics {
  private readonly world: RAPIER.World;
  private spec: BoatSpec;
  private modifiers: BoatUpgradeModifiers = { ...DEFAULT_MODIFIERS };
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;
  private pontoons: HullPontoonOffset[] = [];
  private hullHp: number;
  private maxHullHp: number;
  private lastSubmergedRatio = 0;

  constructor(
    world: RAPIER.World,
    spec: BoatSpec,
    initialPosition: { x: number; y: number; z: number } = { x: 0, y: 0.6, z: 0 },
  ) {
    this.world = world;
    this.spec = spec;
    this.maxHullHp = spec.maxHullHp;
    this.hullHp = spec.maxHullHp;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
      .setLinearDamping(0.45)
      .setAngularDamping(2.6);

    this.body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      spec.width * 0.45,
      spec.height * 0.28,
      spec.length * 0.46,
    )
      .setMass(spec.massKg)
      .setRestitution(0.25)
      .setFriction(0.15);

    this.collider = this.world.createCollider(colliderDesc, this.body);
    this.rebuildPontoons();
  }

  private rebuildPontoons(): void {
    const hw = this.spec.width * 0.44;
    const hl = this.spec.length * 0.44;
    const bottomY = -0.45;
    // 8 hull buoyancy sample points: bow L/R, mid-fore L/R, mid-aft L/R, stern L/R
    this.pontoons = [
      { ox: -hw * 0.65, oy: bottomY, oz: -hl },
      { ox: hw * 0.65, oy: bottomY, oz: -hl },
      { ox: -hw, oy: bottomY, oz: -hl * 0.33 },
      { ox: hw, oy: bottomY, oz: -hl * 0.33 },
      { ox: -hw, oy: bottomY, oz: hl * 0.33 },
      { ox: hw, oy: bottomY, oz: hl * 0.33 },
      { ox: -hw * 0.85, oy: bottomY, oz: hl },
      { ox: hw * 0.85, oy: bottomY, oz: hl },
    ];
  }

  public setSpecAndModifiers(spec: BoatSpec, modifiers?: Partial<BoatUpgradeModifiers>): void {
    this.spec = spec;
    this.modifiers = { ...DEFAULT_MODIFIERS, ...modifiers };
    this.maxHullHp = Math.round(spec.maxHullHp * this.modifiers.armorMultiplier);
    this.hullHp = Math.min(this.hullHp, this.maxHullHp);
    this.rebuildPontoons();
  }

  public repairFull(): void {
    this.hullHp = this.maxHullHp;
  }

  public applyDamage(amount: number): void {
    this.hullHp = Math.max(10, this.hullHp - amount);
  }

  public resolveCircleCollision(obsX: number, obsZ: number, obsRadius: number): number {
    const pos = this.body.translation();
    const vel = this.body.linvel();
    const boatRadius = Math.max(1.4, this.spec.width * 0.65);
    const minDist = obsRadius + boatRadius;
    const dx = pos.x - obsX;
    const dz = pos.z - obsZ;
    const dist = Math.hypot(dx, dz);

    if (dist >= minDist) return 0;

    const nx = dist > 1e-4 ? dx / dist : 0;
    const nz = dist > 1e-4 ? dz / dist : 1;
    const penetration = minDist - dist;

    this.body.setTranslation(
      {
        x: pos.x + nx * (penetration + 0.08),
        y: pos.y,
        z: pos.z + nz * (penetration + 0.08),
      },
      true,
    );

    const inwardSpeed = -(vel.x * nx + vel.z * nz);
    const impactSpeed = Math.max(1.5, inwardSpeed);
    if (inwardSpeed > 0) {
      const restitution = 0.42;
      const bounceVx = vel.x + (1 + restitution) * inwardSpeed * nx;
      const bounceVz = vel.z + (1 + restitution) * inwardSpeed * nz;
      this.body.setLinvel({ x: bounceVx * 0.78, y: vel.y, z: bounceVz * 0.78 }, true);
    }

    if (impactSpeed > 2.2) {
      const dmg = Math.max(1, Math.round((impactSpeed - 1.8) * 1.6));
      this.applyDamage(dmg);
    }

    return impactSpeed;
  }

  public setTransform(pos: { x: number; y: number; z: number }, yawRad = 0): void {
    this.body.setTranslation(pos, true);
    const half = yawRad * 0.5;
    this.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  public step(
    dt: number,
    input: BoatControlInput,
    time: number,
    weather: WeatherState = 'clear',
  ): BoatTelemetryState {
    this.body.resetForces(true);
    this.body.resetTorques(true);

    const pos = this.body.translation();
    const rot = this.body.rotation();
    const linvel = this.body.linvel();
    const angvel = this.body.angvel();

    // Forward (-Z in Three.js/glTF convention), Right (+X), Up (+Y)
    const forward = this.rotateVec({ x: 0, y: 0, z: -1 }, rot);
    const right = this.rotateVec({ x: 1, y: 0, z: 0 }, rot);
    const up = this.rotateVec({ x: 0, y: 1, z: 0 }, rot);

    // 1. Sample 8-point analytic buoyancy
    let submergedPoints = 0;
    const perPointStiffness = this.spec.buoyancyStiffness / this.pontoons.length;
    const heaveDamping = (this.spec.massKg * 4.5) / this.pontoons.length;

    for (let i = 0; i < this.pontoons.length; i++) {
      const p = this.pontoons[i];
      const worldOffset = this.rotateVec({ x: p.ox, y: p.oy, z: p.oz }, rot);
      const wx = pos.x + worldOffset.x;
      const wy = pos.y + worldOffset.y;
      const wz = pos.z + worldOffset.z;

      const water = WaterField.sample(wx, wz, time, weather);
      const depth = water.height - wy;

      if (depth > 0) {
        submergedPoints++;
        const clampedDepth = Math.min(depth, 1.8);
        const pointVelY = linvel.y + (angvel.z * worldOffset.x - angvel.x * worldOffset.z);
        const upwardForce = Math.max(0, clampedDepth * perPointStiffness - pointVelY * heaveDamping);

        this.body.addForceAtPoint(
          {
            x: water.normal.x * upwardForce * 0.12,
            y: upwardForce,
            z: water.normal.z * upwardForce * 0.12,
          },
          { x: wx, y: wy, z: wz },
          true,
        );
      }
    }

    this.lastSubmergedRatio = submergedPoints / this.pontoons.length;

    // 2. Hydrodynamic propulsion & directional keel drag
    const damageFactor = this.hullHp < this.maxHullHp * 0.25 ? 0.72 : 1.0;
    const waterContact = Math.max(0.2, this.lastSubmergedRatio);

    const horizForward = this.normalizeHorizontal(forward);
    const horizRight = this.normalizeHorizontal(right);

    const forwardSpeed = linvel.x * horizForward.x + linvel.z * horizForward.z;
    const lateralSpeed = linvel.x * horizRight.x + linvel.z * horizRight.z;

    const boostMult = input.boost ? 1.38 : 1.0;
    const maxSpeed = this.spec.topSpeedMps * this.modifiers.topSpeedMultiplier * boostMult * damageFactor;
    const speedRatio = Math.min(1.0, Math.abs(forwardSpeed) / Math.max(1, maxSpeed));

    // Apply thrust with top-speed governor curve
    const rawThrottle = Math.max(-0.55, Math.min(1.0, input.throttle));
    const thrustLimiter = rawThrottle > 0 ? Math.max(0.08, 1.0 - Math.pow(speedRatio, 2.2)) : 0.65;
    const thrustMag =
      rawThrottle *
      this.spec.thrustForce *
      this.modifiers.accelerationMultiplier *
      boostMult *
      damageFactor *
      thrustLimiter *
      waterContact;

    this.body.addForce(
      {
        x: horizForward.x * thrustMag,
        y: 0,
        z: horizForward.z * thrustMag,
      },
      true,
    );

    // Longitudinal & Lateral drag (drift reduces lateral keel resistance for controllable power slides)
    const driftFactor = input.drift ? this.spec.driftSlipFactor : 1.0;
    const longDragForce = -forwardSpeed * this.spec.longitudinalDrag * waterContact;
    const latDragForce =
      -lateralSpeed * this.spec.lateralGripDrag * this.modifiers.gripMultiplier * driftFactor * waterContact;

    this.body.addForce(
      {
        x: horizForward.x * longDragForce + horizRight.x * latDragForce,
        y: 0,
        z: horizForward.z * longDragForce + horizRight.z * latDragForce,
      },
      true,
    );

    // 3. Steering yaw torque & vector cross-product self-righting stabilization
    const steerAuthority = 0.35 + 0.65 * Math.min(1.0, Math.abs(forwardSpeed) / 6.0);
    const driftTurnBoost = input.drift ? 1.32 : 1.0;
    const yawTorque =
      -input.steer *
      this.spec.turnTorque *
      steerAuthority *
      driftTurnBoost *
      damageFactor *
      (rawThrottle < -0.05 ? -1 : 1);

    // Dynamic carving bank into turns + hydro-planing bow rise under forward thrust
    const targetBankRoll = -input.steer * Math.min(0.22, Math.abs(forwardSpeed) * 0.0085);
    const targetBowPitch = Math.max(-0.04, Math.min(0.09, forwardSpeed * 0.003));
    const rawTargetUp = {
      x: horizRight.x * targetBankRoll - horizForward.x * targetBowPitch,
      y: 1.0,
      z: horizRight.z * targetBankRoll - horizForward.z * targetBowPitch,
    };
    const tLen = Math.hypot(rawTargetUp.x, rawTargetUp.y, rawTargetUp.z);
    const targetUp = {
      x: rawTargetUp.x / tLen,
      y: rawTargetUp.y / tLen,
      z: rawTargetUp.z / tLen,
    };

    // Exact 3D righting torque axis: up × targetUp
    const crossX = up.y * targetUp.z - up.z * targetUp.y;
    const crossY = up.z * targetUp.x - up.x * targetUp.z;
    const crossZ = up.x * targetUp.y - up.y * targetUp.x;
    const restoreStiffness = this.spec.stabilityRollRestore * 3.2;
    const angDamp = this.spec.massKg * 5.2;

    this.body.addTorque(
      {
        x: crossX * restoreStiffness - angvel.x * angDamp,
        y: yawTorque + crossY * restoreStiffness - angvel.y * this.spec.massKg * 2.2,
        z: crossZ * restoreStiffness - angvel.z * angDamp,
      },
      true,
    );

    // Defense-in-depth waterline floor guard so hull never dips beneath opaque water surface
    const centerWater = WaterField.sample(pos.x, pos.z, time, weather);
    const minHullY = centerWater.height + 0.08;
    if (pos.y < minHullY) {
      this.body.setTranslation({ x: pos.x, y: minHullY, z: pos.z }, true);
      if (linvel.y < 0) {
        this.body.setLinvel({ x: linvel.x, y: linvel.y * 0.2, z: linvel.z }, true);
      }
    }

    return this.getState();
  }

  public getState(): BoatTelemetryState {
    const pos = this.body.translation();
    const rot = this.body.rotation();
    const vel = this.body.linvel();
    const forward = this.rotateVec({ x: 0, y: 0, z: -1 }, rot);
    const right = this.rotateVec({ x: 1, y: 0, z: 0 }, rot);

    const speedMps = Math.hypot(vel.x, vel.z);
    const forwardSpeed = vel.x * forward.x + vel.z * forward.z;
    const lateralSpeed = vel.x * right.x + vel.z * right.z;
    const slipRad = speedMps > 1.0 ? Math.atan2(Math.abs(lateralSpeed), Math.abs(forwardSpeed)) : 0;

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      speedMps,
      speedKnots: speedMps * 1.94384,
      headingRad: Math.atan2(-forward.x, -forward.z),
      submergedRatio: this.lastSubmergedRatio,
      isAirborne: this.lastSubmergedRatio <= 0.01,
      driftSlipAngleDeg: (slipRad * 180) / Math.PI,
      hullHp: this.hullHp,
      maxHullHp: this.maxHullHp,
    };
  }

  private rotateVec(
    v: { x: number; y: number; z: number },
    q: { x: number; y: number; z: number; w: number },
  ): { x: number; y: number; z: number } {
    const ix = q.w * v.x + q.y * v.z - q.z * v.y;
    const iy = q.w * v.y + q.z * v.x - q.x * v.z;
    const iz = q.w * v.z + q.x * v.y - q.y * v.x;
    const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
    return {
      x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
    };
  }

  private normalizeHorizontal(v: { x: number; y: number; z: number }): { x: number; z: number } {
    const len = Math.hypot(v.x, v.z);
    if (len < 1e-5) return { x: 0, z: -1 };
    return { x: v.x / len, z: v.z / len };
  }
}
