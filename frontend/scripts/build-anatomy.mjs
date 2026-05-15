#!/usr/bin/env node
/**
 * Plan 6.1 anatomy asset pipeline (build-time, one-shot).
 *
 * Optimizes raw BodyParts3D + Z-Anatomy source files into the 9 GLB LOD set
 * shipped at /anatomy/. Output is loaded by `<BodyMap3D>` at runtime via
 * drei's `useGLTF` once the files land — until then BodyMap3D uses the
 * procedural placeholder humanoid.
 *
 * Pipeline (per FRONTEND_BLUEPRINT §2.3):
 *   weld → simplify (3 LODs: 200k / 80k / 30k tris) → KTX2 (etc1s, 1024² max)
 *   → DRACO (pos 14-bit, norm 10-bit) → prune → validate.
 *
 * Source files (you must download these manually — both require a free
 * account / one-click download, not scriptable):
 *   1. BodyParts3D adult-male / adult-female / child OBJ packs
 *      → https://lifesciencedb.jp/bp3d/  (CC-BY-SA 2.1 JP)
 *      → place each unzipped pack in `anatomy-source/bodyparts3d/<sex>/`
 *   2. Z-Anatomy outer-skin GLB (just the skin layer is enough for 6.1)
 *      → https://github.com/LluisV/Z-Anatomy   (CC-BY-SA 4.0)
 *      → export skin shell from Blender as `z-anatomy-skin-<sex>.glb`
 *      → place under `anatomy-source/z-anatomy/`
 *   3. studio_small_07 HDRI 1k
 *      → https://polyhaven.com/a/studio_small_07   (CC0)
 *      → download the 1k .hdr, place at `anatomy-source/env/studio_small_07_1k.hdr`
 *
 * Run:  node scripts/build-anatomy.mjs
 *
 * Pre-req:  npm install --save-dev @gltf-transform/cli @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
 *           (or use the `npx @gltf-transform/cli` form below — no install needed)
 */

import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

const SOURCE_DIR = resolve('anatomy-source');
const OUT_DIR = resolve('public', 'anatomy');
const ENV_DIR = join(OUT_DIR, 'env');
const ATTRIBUTIONS_OUT = join(OUT_DIR, 'attributions.json');

const SEXES = ['male', 'female', 'child'];
const LODS = [
  { suffix: 'lod0', triangles: 200_000, maxTextureSize: 1024 },
  { suffix: 'lod1', triangles: 80_000, maxTextureSize: 1024 },
  { suffix: 'lod2', triangles: 30_000, maxTextureSize: 512 },
];

const ATTRIBUTIONS = [
  {
    name: 'BodyParts3D',
    license: 'CC BY-SA 2.1 JP',
    source: 'Database Center for Life Science (DBCLS), Japan',
    url: 'https://lifesciencedb.jp/bp3d/',
    used_for:
      'Anatomical mesh source-of-truth (FMA-aligned per-part segmentation) for the layered body view.',
  },
  {
    name: 'Z-Anatomy',
    license: 'CC BY-SA 4.0',
    source: 'Lluís V. (LluisV)',
    url: 'https://github.com/LluisV/Z-Anatomy',
    used_for:
      'Outer-skin shell mesh for the default visible layer of the body model.',
  },
  {
    name: 'studio_small_07 HDRI',
    license: 'CC0',
    source: 'Sergej Majboroda · Poly Haven',
    url: 'https://polyhaven.com/a/studio_small_07',
    used_for:
      'Image-based lighting (IBL) environment for realistic skin reflections.',
  },
];

function log(line) {
  process.stdout.write(`[anatomy] ${line}\n`);
}
function err(line) {
  process.stderr.write(`[anatomy] ERROR: ${line}\n`);
}

function ensureSourcePresent() {
  if (!existsSync(SOURCE_DIR)) {
    err(`Source directory missing: ${SOURCE_DIR}`);
    err('Read the header of this script for download instructions.');
    process.exit(1);
  }

  const missing = [];
  for (const sex of SEXES) {
    const dir = join(SOURCE_DIR, 'bodyparts3d', sex);
    if (!existsSync(dir) || readdirSync(dir).length === 0) {
      missing.push(`anatomy-source/bodyparts3d/${sex}/  (BodyParts3D ${sex} pack)`);
    }
    const skin = join(SOURCE_DIR, 'z-anatomy', `z-anatomy-skin-${sex}.glb`);
    if (!existsSync(skin)) {
      missing.push(`anatomy-source/z-anatomy/z-anatomy-skin-${sex}.glb`);
    }
  }
  const hdri = join(SOURCE_DIR, 'env', 'studio_small_07_1k.hdr');
  if (!existsSync(hdri)) missing.push('anatomy-source/env/studio_small_07_1k.hdr');

  if (missing.length > 0) {
    err('Missing source files:');
    for (const m of missing) err(`  - ${m}`);
    err('Download per the header of this script, then re-run.');
    process.exit(1);
  }
}

function ensureOutDirs() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(ENV_DIR)) mkdirSync(ENV_DIR, { recursive: true });
}

function tx(args) {
  // Prefer npx so no global install is needed.
  const cmd = `npx --yes @gltf-transform/cli ${args}`;
  log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function bytesHumanReadable(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function processOne(sex, lod) {
  const inSkin = join(SOURCE_DIR, 'z-anatomy', `z-anatomy-skin-${sex}.glb`);
  // For now we use the skin-only GLB as the input. When BodyParts3D parts get
  // merged into a single GLB pre-step, swap the input here.
  const tmp = join(OUT_DIR, `_tmp_${sex}_${lod.suffix}.glb`);
  const outFile = join(OUT_DIR, `body_${sex}_${lod.suffix}.glb`);

  // Pipeline: weld → simplify → texture-resize → ktx2 → draco → prune.
  copyFileSync(inSkin, tmp);
  tx(`weld ${tmp} ${tmp}`);
  tx(`simplify ${tmp} ${tmp} --ratio ${(lod.triangles / 200_000).toFixed(3)} --error 0.001`);
  tx(`resize ${tmp} ${tmp} --width ${lod.maxTextureSize} --height ${lod.maxTextureSize}`);
  tx(`uastc ${tmp} ${tmp} --level 2`);
  tx(`etc1s ${tmp} ${tmp} --quality 200`);
  tx(`draco ${tmp} ${outFile} --quantize-position 14 --quantize-normal 10`);
  // Cleanup tmp
  try {
    execSync(process.platform === 'win32' ? `del "${tmp}"` : `rm "${tmp}"`);
  } catch {
    /* best-effort */
  }

  const size = statSync(outFile).size;
  log(`  ✓ ${basename(outFile)}  ${bytesHumanReadable(size)}`);
  return size;
}

function copyEnv() {
  const src = join(SOURCE_DIR, 'env', 'studio_small_07_1k.hdr');
  const dst = join(ENV_DIR, 'studio_small_07_1k.hdr');
  copyFileSync(src, dst);
  log(`  ✓ env/${basename(dst)}  ${bytesHumanReadable(statSync(dst).size)}`);
}

function writeAttributions() {
  writeFileSync(ATTRIBUTIONS_OUT, JSON.stringify(ATTRIBUTIONS, null, 2));
  log(`  ✓ attributions.json (${ATTRIBUTIONS.length} sources)`);
}

function main() {
  log('Plan 6.1 anatomy build pipeline');
  ensureSourcePresent();
  ensureOutDirs();

  log('Building 9 LOD GLBs + HDRI…');
  let total = 0;
  for (const sex of SEXES) {
    for (const lod of LODS) {
      total += processOne(sex, lod);
    }
  }
  copyEnv();
  total += statSync(join(ENV_DIR, 'studio_small_07_1k.hdr')).size;

  writeAttributions();

  log(`Done. Total shipped 3D assets: ${bytesHumanReadable(total)} (budget: 30 MB).`);
  if (total > 30 * 1024 * 1024) {
    err('Budget exceeded — tighten LOD2 simplify ratio or texture size.');
    process.exit(2);
  }
}

main();
