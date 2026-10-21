import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(ROOT_DIR, 'assets/manifest.json');
const MODELS_DIR = path.resolve(ROOT_DIR, 'public/assets/models');
const REPORT_PATH = path.resolve(ROOT_DIR, 'public/assets/asset-report.json');

interface AssetSpec {
  asset_id: string;
  category: string;
  world_scale_m: [number, number, number];
  pivot_policy: string;
  lod_triangle_targets: [number, number, number];
  materials_max: number;
  collision_type: string;
  night_emission_variant: boolean;
}

async function validateAssets() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as {
    version: string;
    pipeline: string;
    assets: AssetSpec[];
  };

  const io = new NodeIO();
  const results = [];
  let allPassed = true;

  for (const spec of manifest.assets) {
    const glbPath = path.resolve(MODELS_DIR, `${spec.asset_id}.glb`);
    const exists = fs.existsSync(glbPath);
    let triangles = 0;
    let materials = 0;
    let byteSize = 0;

    if (!exists) {
      allPassed = false;
      results.push({
        asset_id: spec.asset_id,
        exists: false,
        triangles: 0,
        maxTriangles: spec.lod_triangle_targets[0],
        materials: 0,
        maxMaterials: spec.materials_max,
        byteSize: 0,
        passed: false,
      });
      continue;
    }

    byteSize = fs.statSync(glbPath).size;
    const doc = await io.read(glbPath);
    const root = doc.getRoot();
    materials = root.listMaterials().length;

    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        if (indices) {
          triangles += Math.floor(indices.getCount() / 3);
        } else {
          const pos = prim.getAttribute('POSITION');
          if (pos) {
            triangles += Math.floor(pos.getCount() / 3);
          }
        }
      }
    }

    const maxTriangles = spec.lod_triangle_targets[0];
    const maxMaterials = spec.materials_max;
    const passed = triangles > 0 && triangles <= maxTriangles && materials <= maxMaterials;
    if (!passed) {
      allPassed = false;
    }

    results.push({
      asset_id: spec.asset_id,
      category: spec.category,
      exists: true,
      triangles,
      maxTriangles,
      materials,
      maxMaterials,
      byteSize,
      passed,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    generator: 'sandraschi/blender-mcp headless GLB factory + @gltf-transform/core',
    passed: allPassed,
    totalAssets: results.length,
    results,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`Asset Validation Report written to ${REPORT_PATH}`);
  console.table(results);

  if (!allPassed) {
    process.exit(1);
  }
}

validateAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
