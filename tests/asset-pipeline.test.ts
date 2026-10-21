import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Subsystem 1: sandraschi/blender-mcp Asset Factory', () => {
  const manifestPath = path.resolve(__dirname, '../assets/manifest.json');
  const reportPath = path.resolve(__dirname, '../public/assets/asset-report.json');

  it('loads asset manifest with all 10 required maritime assets', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.assets.length).toBeGreaterThanOrEqual(10);
  });

  it('generates detailed GLB files via blender-mcp within triangle and material budgets', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(report.passed).toBe(true);
    expect(report.generator).toContain('sandraschi/blender-mcp');
    for (const item of report.results) {
      expect(item.exists).toBe(true);
      const minExpected = item.asset_id === 'buoy_marker' ? 250 : 600;
      expect(item.triangles).toBeGreaterThanOrEqual(minExpected);
      expect(item.triangles).toBeLessThanOrEqual(item.maxTriangles);
      expect(item.materials).toBeGreaterThanOrEqual(3);
      expect(item.materials).toBeLessThanOrEqual(item.maxMaterials);
    }
  });
});
