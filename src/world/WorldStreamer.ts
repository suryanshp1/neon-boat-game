import { DistrictId, getDistrictAtPosition } from './DistrictDefinitions';

export type CellRing = 'active_physics' | 'high_detail' | 'skyline_silhouette' | 'unloaded';

export interface CellStructureInstance {
  id: string;
  assetId: 'building_akari_neon' | 'crane_kogyo' | 'torii_gate' | 'bridge_span' | 'buoy_marker';
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  hasCollision: boolean;
  radius: number;
}

export interface StreamedCell {
  key: string;
  cx: number;
  cz: number;
  district: DistrictId;
  ring: CellRing;
  structures: CellStructureInstance[];
  allocatedResources: number;
}

export interface WorldStreamingStats {
  activeCellCount: number;
  physicsCellCount: number;
  highDetailCellCount: number;
  silhouetteCellCount: number;
  allocatedResources: number;
  disposedResources: number;
  leakedResources: number;
  currentDistrict: DistrictId;
}

export class WorldStreamer {
  public readonly cellSize = 250;
  private readonly lookaheadSeconds = 2.5;
  private cells = new Map<string, StreamedCell>();
  private totalAllocated = 0;
  private totalDisposed = 0;
  private currentDistrict: DistrictId = 'mirai_harbour';
  private onCellLoad?: (cell: StreamedCell) => void;
  private onCellUnload?: (cell: StreamedCell) => void;
  private onCellRingChange?: (cell: StreamedCell) => void;

  constructor(callbacks?: {
    onCellLoad?: (cell: StreamedCell) => void;
    onCellUnload?: (cell: StreamedCell) => void;
    onCellRingChange?: (cell: StreamedCell) => void;
  }) {
    this.onCellLoad = callbacks?.onCellLoad;
    this.onCellUnload = callbacks?.onCellUnload;
    this.onCellRingChange = callbacks?.onCellRingChange;
  }

  public update(
    playerPos: { x: number; z: number },
    playerVel: { x: number; z: number } = { x: 0, z: 0 },
  ): void {
    const predictedX = playerPos.x + playerVel.x * this.lookaheadSeconds;
    const predictedZ = playerPos.z + playerVel.z * this.lookaheadSeconds;

    this.currentDistrict = getDistrictAtPosition(playerPos.x, playerPos.z).id;

    const centerCx = Math.floor(predictedX / this.cellSize);
    const centerCz = Math.floor(predictedZ / this.cellSize);

    const maxRingRadiusCells = 5; // 5 * 250m = 1250m streaming horizon
    const visitedKeys = new Set<string>();

    for (let dx = -maxRingRadiusCells; dx <= maxRingRadiusCells; dx++) {
      for (let dz = -maxRingRadiusCells; dz <= maxRingRadiusCells; dz++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const cellCenterX = (cx + 0.5) * this.cellSize;
        const cellCenterZ = (cz + 0.5) * this.cellSize;

        // Clamp within 4x4 km navigable bay (-2000..2000)
        if (Math.abs(cellCenterX) > 2000 || Math.abs(cellCenterZ) > 2000) {
          continue;
        }

        const dist = Math.hypot(cellCenterX - predictedX, cellCenterZ - predictedZ);
        let ring: CellRing = 'unloaded';
        if (dist <= 380) {
          ring = 'active_physics';
        } else if (dist <= 750) {
          ring = 'high_detail';
        } else if (dist <= 1350) {
          ring = 'skyline_silhouette';
        }

        if (ring === 'unloaded') continue;

        const key = `${cx}:${cz}`;
        visitedKeys.add(key);

        const existing = this.cells.get(key);
        if (!existing) {
          const structures = this.generateDeterministicCellStructures(cx, cz);
          const resourceCount = structures.length + 1;
          const newCell: StreamedCell = {
            key,
            cx,
            cz,
            district: getDistrictAtPosition(cellCenterX, cellCenterZ).id,
            ring,
            structures,
            allocatedResources: resourceCount,
          };
          this.cells.set(key, newCell);
          this.totalAllocated += resourceCount;
          this.onCellLoad?.(newCell);
        } else if (existing.ring !== ring) {
          existing.ring = ring;
          this.onCellRingChange?.(existing);
        }
      }
    }

    // Explicitly unload and dispose any cells outside the active horizon
    for (const [key, cell] of this.cells.entries()) {
      if (!visitedKeys.has(key)) {
        this.totalDisposed += cell.allocatedResources;
        this.onCellUnload?.(cell);
        this.cells.delete(key);
      }
    }
  }

  private generateDeterministicCellStructures(cx: number, cz: number): CellStructureInstance[] {
    // Keep inner harbour spawn navigation channel (-100..100) clear of solid buildings
    const cellCenterX = (cx + 0.5) * this.cellSize;
    const cellCenterZ = (cz + 0.5) * this.cellSize;
    const district = getDistrictAtPosition(cellCenterX, cellCenterZ).id;

    const hash = (n: number): number => {
      const s = Math.sin(n * 127.1 + cx * 311.7 + cz * 74.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const list: CellStructureInstance[] = [];

    // Every cell gets 2 navigational channel buoys
    for (let i = 0; i < 2; i++) {
      const bx = cellCenterX + (hash(i * 11 + 1) - 0.5) * 180;
      const bz = cellCenterZ + (hash(i * 11 + 2) - 0.5) * 180;
      if (Math.hypot(bx, bz) < 45) continue;
      list.push({
        id: `buoy_${cx}_${cz}_${i}`,
        assetId: 'buoy_marker',
        x: bx,
        y: 0,
        z: bz,
        rotationY: hash(i * 5) * Math.PI * 2,
        scale: 1.0,
        hasCollision: false,
        radius: 1.5,
      });
    }

    // Add district-specific architectural clusters on island perimeters
    const count = district === 'akari_canal' ? 4 : district === 'seto_outer' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const ox = (hash(i * 19 + 3) - 0.5) * 190;
      const oz = (hash(i * 19 + 7) - 0.5) * 190;
      const wx = cellCenterX + ox;
      const wz = cellCenterZ + oz;

      // Leave central channels open for high-speed boating
      if (Math.hypot(wx, wz) < 95 || Math.abs(wx) < 42 || Math.abs(wz) < 42) {
        continue;
      }

      let assetId: CellStructureInstance['assetId'] = 'building_akari_neon';
      let radius = 11;
      if (district === 'kogyo_islands') {
        assetId = i % 2 === 0 ? 'crane_kogyo' : 'building_akari_neon';
        radius = 12;
      } else if (district === 'seto_outer') {
        assetId = i === 0 ? 'torii_gate' : 'buoy_marker';
        radius = 6;
      } else if (district === 'mirai_harbour' && i === 0) {
        assetId = 'bridge_span';
        radius = 14;
      }

      list.push({
        id: `struct_${cx}_${cz}_${i}`,
        assetId,
        x: wx,
        y: 0,
        z: wz,
        rotationY: Math.floor(hash(i * 23) * 4) * (Math.PI / 2),
        scale: 0.85 + hash(i * 31) * 0.45,
        hasCollision: assetId !== 'buoy_marker',
        radius,
      });
    }

    return list;
  }

  public getActiveCells(): StreamedCell[] {
    return Array.from(this.cells.values());
  }

  public getStats(): WorldStreamingStats {
    let physicsCellCount = 0;
    let highDetailCellCount = 0;
    let silhouetteCellCount = 0;
    let currentlyAllocated = 0;

    for (const c of this.cells.values()) {
      currentlyAllocated += c.allocatedResources;
      if (c.ring === 'active_physics') physicsCellCount++;
      else if (c.ring === 'high_detail') highDetailCellCount++;
      else if (c.ring === 'skyline_silhouette') silhouetteCellCount++;
    }

    const leakedResources = this.totalAllocated - this.totalDisposed - currentlyAllocated;

    return {
      activeCellCount: this.cells.size,
      physicsCellCount,
      highDetailCellCount,
      silhouetteCellCount,
      allocatedResources: currentlyAllocated,
      disposedResources: this.totalDisposed,
      leakedResources,
      currentDistrict: this.currentDistrict,
    };
  }
}
