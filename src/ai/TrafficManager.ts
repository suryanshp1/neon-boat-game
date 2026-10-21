export type TrafficRole = 'commuter_ferry' | 'fishing_craft' | 'water_taxi' | 'cargo_tug';

export interface TrafficVessel {
  id: string;
  role: TrafficRole;
  assetId: 'traffic_ferry' | 'boat_skiff' | 'boat_workboat';
  routeIndex: number;
  t: number; // 0..1 spline progress
  speedMps: number;
  position: { x: number; y: number; z: number };
  headingRad: number;
  isPhysicsActive: boolean;
  avoidanceSteerOffset: number;
}

interface RouteLoop {
  points: Array<{ x: number; z: number }>;
}

const ROUTES: RouteLoop[] = [
  // Route 0: Inner Mirai Harbour <-> Akari Canal loop
  {
    points: [
      { x: -160, z: -80 },
      { x: 40, z: -120 },
      { x: 260, z: -260 },
      { x: 180, z: -40 },
      { x: -80, z: 40 },
    ],
  },
  // Route 1: Kogyo Industrial Container Channel
  {
    points: [
      { x: -520, z: 180 },
      { x: -240, z: 360 },
      { x: -80, z: 520 },
      { x: -420, z: 480 },
    ],
  },
  // Route 2: Seto Outer Islands Ferry Line
  {
    points: [
      { x: 180, z: 160 },
      { x: 560, z: 320 },
      { x: 640, z: 680 },
      { x: 240, z: 520 },
    ],
  },
  // Route 3: Grand Bay Perimeter Express
  {
    points: [
      { x: -950, z: -950 },
      { x: 950, z: -950 },
      { x: 950, z: 950 },
      { x: -950, z: 950 },
    ],
  },
];

export class TrafficManager {
  private vessels: TrafficVessel[] = [];
  private readonly activePhysicsRadius = 350;

  constructor() {
    const roles: TrafficRole[] = ['commuter_ferry', 'fishing_craft', 'water_taxi', 'cargo_tug'];
    for (let i = 0; i < 16; i++) {
      const routeIndex = i % ROUTES.length;
      const role = roles[i % roles.length];
      const assetId =
        role === 'commuter_ferry'
          ? 'traffic_ferry'
          : role === 'cargo_tug'
            ? 'boat_workboat'
            : 'boat_skiff';
      const t = (i / 16 + routeIndex * 0.17) % 1.0;
      const sample = this.sampleRoute(routeIndex, t);
      this.vessels.push({
        id: `traffic_${i}`,
        role,
        assetId,
        routeIndex,
        t,
        speedMps: role === 'water_taxi' ? 14 : role === 'commuter_ferry' ? 10 : 8,
        position: { x: sample.x, y: 0.1, z: sample.z },
        headingRad: sample.headingRad,
        isPhysicsActive: false,
        avoidanceSteerOffset: 0,
      });
    }
  }

  public update(dt: number, playerPos: { x: number; z: number }): void {
    for (const v of this.vessels) {
      const route = ROUTES[v.routeIndex];
      const approxLen = route.points.length * 320;
      v.t = (v.t + (v.speedMps * dt) / approxLen) % 1.0;

      const pt = this.sampleRoute(v.routeIndex, v.t);
      const distToPlayer = Math.hypot(pt.x - playerPos.x, pt.z - playerPos.z);
      v.isPhysicsActive = distToPlayer <= this.activePhysicsRadius;

      // Short-horizon local avoidance when close to player
      if (v.isPhysicsActive && distToPlayer < 42) {
        const dx = pt.x - playerPos.x;
        const dz = pt.z - playerPos.z;
        const push = (42 - distToPlayer) * 0.25;
        const inv = 1 / Math.max(1, distToPlayer);
        v.position.x = pt.x + dx * inv * push;
        v.position.z = pt.z + dz * inv * push;
      } else {
        v.position.x = pt.x;
        v.position.z = pt.z;
      }
      v.headingRad = pt.headingRad;
    }
  }

  public getVessels(): TrafficVessel[] {
    return this.vessels;
  }

  public isNearAnyTraffic(pos: { x: number; z: number }, maxDist = 28): boolean {
    for (const v of this.vessels) {
      if (Math.hypot(v.position.x - pos.x, v.position.z - pos.z) <= maxDist) {
        return true;
      }
    }
    return false;
  }

  private sampleRoute(routeIndex: number, t: number): { x: number; z: number; headingRad: number } {
    const pts = ROUTES[routeIndex].points;
    const n = pts.length;
    const scaled = ((t % 1) + 1) % 1 * n;
    const idx = Math.floor(scaled) % n;
    const nextIdx = (idx + 1) % n;
    const frac = scaled - Math.floor(scaled);

    const p0 = pts[idx];
    const p1 = pts[nextIdx];
    const x = p0.x + (p1.x - p0.x) * frac;
    const z = p0.z + (p1.z - p0.z) * frac;
    const headingRad = Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z));
    return { x, z, headingRad };
  }
}
