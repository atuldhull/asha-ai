# Anatomy source files (gitignored)

Plan 6.1 ships an optimized 3D anatomical body at `/triage/body-map-3d`. The
shipped GLB assets in `frontend/public/anatomy/` are produced by
`frontend/scripts/build-anatomy.mjs` from the **source files in this
directory**.

This directory is **gitignored** — source meshes are too large to commit, and
both BodyParts3D and Z-Anatomy require manual download (registration / one-off
extract from Blender). Re-acquire on a fresh checkout.

## Downloads required

```
anatomy-source/
├── bodyparts3d/
│   ├── male/         ← BodyParts3D adult-male OBJ pack (CC-BY-SA 2.1 JP)
│   ├── female/       ← BodyParts3D adult-female OBJ pack
│   └── child/        ← BodyParts3D child OBJ pack
├── z-anatomy/
│   ├── z-anatomy-skin-male.glb     ← Z-Anatomy skin shell (CC-BY-SA 4.0)
│   ├── z-anatomy-skin-female.glb
│   └── z-anatomy-skin-child.glb
└── env/
    └── studio_small_07_1k.hdr      ← Poly Haven HDRI (CC0)
```

### 1. BodyParts3D
- Source: <https://lifesciencedb.jp/bp3d/> (Database Center for Life Science, Japan)
- License: **CC BY-SA 2.1 JP**
- Attribution required — recorded in `frontend/public/anatomy/attributions.json`
  by the build script. Mirror in `LICENSES/3RD_PARTY.md`.
- Download: search the BP3D portal for "adult male", "adult female", "child";
  download the OBJ pack for each; unzip into the matching folder above.

### 2. Z-Anatomy
- Source: <https://github.com/LluisV/Z-Anatomy>
- License: **CC BY-SA 4.0**
- Open the Blender source, isolate the "skin" layer for each model variant,
  export as a GLB named exactly `z-anatomy-skin-<sex>.glb`.

### 3. studio_small_07 HDRI
- Source: <https://polyhaven.com/a/studio_small_07>
- License: **CC0** (no attribution required, but credited anyway in
  `attributions.json` for traceability)
- Download the 1k `.hdr` file (about 1 MB).

## Run the pipeline

```
cd frontend
node scripts/build-anatomy.mjs
```

The script enforces a 30 MB total-asset budget across all 9 LODs + HDRI per
[FRONTEND_BLUEPRINT §2.3](../../docs/FRONTEND_BLUEPRINT.md#23--mesh-optimization-pipeline-build-time).
If the budget is exceeded, the script exits non-zero — tighten the LOD2
simplify ratio or texture size in `LODS` at the top of the script.

## Until the assets are present

`<BodyMap3D>` falls back to a procedural placeholder humanoid (named meshes
matching the region taxonomy in `frontend/lib/body-map/regions.ts`). The
route, raycast, pin model, and pain panel all work end-to-end against the
placeholder — only the visual fidelity is degraded.
