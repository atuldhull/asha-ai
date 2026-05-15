'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { gsap } from 'gsap';
import * as THREE from 'three';
import {
  REGIONS_BY_MESH,
  type BodyRegion,
} from '@/lib/body-map/regions';
import type { Pin } from '@/lib/types';
import { useReduced } from '@/lib/reduced-motion';

const SKIN_COLOR = '#e7b095';
const SKIN_HOVER = '#f4c9ad';
const SKIN_TAPPED = '#e2735c';
const SKIN_SHEEN = '#d98a6a';

/**
 * Plan 6.1 BodyMap3D — placeholder anatomical body for the /triage/body-map-3d
 * route. Built from Three.js primitives (sphere / capsule / box) with each
 * mesh named to match the `mesh_name` field in regions.ts. Raycasting on
 * pointerdown hits a named mesh -> regionForMesh -> Pin record.
 *
 * THIS IS A PLACEHOLDER. The shipped Tier 6.1 plan calls for BodyParts3D +
 * Z-Anatomy GLBs sourced via `frontend/scripts/build-anatomy.mjs`. Until
 * those land in `frontend/public/anatomy/`, the placeholder humanoid keeps
 * the route demo-able end-to-end with the real region taxonomy + Pin schema.
 *
 * When the real GLBs ship, swap the procedural body for `useGLTF` per
 * FRONTEND_BLUEPRINT §3.1; the rest of the file (raycast, pin model,
 * onSelect callback) stays unchanged because they key on `mesh.name` which
 * the GLB also exposes.
 */

interface BodyPart {
  /** Mesh name — must match a region in regions.ts (or be ignored on tap). */
  name: string;
  type: 'sphere' | 'box' | 'cylinder' | 'capsule';
  /** [x, y, z] position relative to body group origin. */
  position: [number, number, number];
  /** Geometry args:
   *   sphere   -> [radius, widthSegments?, heightSegments?]
   *   box      -> [width, height, depth]
   *   cylinder -> [radiusTop, radiusBottom, height, radialSegments?]
   *   capsule  -> [radius, length, capSegments?, radialSegments?]
   */
  args: number[];
  rotation?: [number, number, number];
  /** Non-uniform scale — turns spheres into anatomical ellipsoids. */
  scale?: [number, number, number];
}

/**
 * Anatomically-proportioned humanoid built from capsules + ellipsoids.
 * Smooth organic forms that abut so SSAO + the studio HDRI read them as
 * one continuous body — far more realistic than the old box figure,
 * with zero external assets. Region `name`s are byte-identical to the
 * previous taxonomy so raycast / pins / regions.ts stay 1:1.
 *
 * Coordinate space: ~2.55 units tall, head crown ≈ 1.78, sole ≈ -0.92,
 * centred on x. Left/right keep the prior sign convention (patient-left
 * = −x) so stored Pin geometry doesn't shift.
 *
 * `capsule` args = [radius, length, capSeg, radialSeg]; default axis Y.
 * `sphere` + `scale` = ellipsoid.
 */
const PLACEHOLDER_PARTS: BodyPart[] = [
  // ── Head + face ──
  { name: 'r-head-front', type: 'sphere', position: [0, 1.62, 0.01], args: [0.17, 32, 32], scale: [0.92, 1.12, 1.0] },
  { name: 'r-face', type: 'sphere', position: [0, 1.58, 0.12], args: [0.105, 24, 24], scale: [1.0, 1.15, 0.55] },
  // ── Neck ──
  { name: 'r-neck-front', type: 'capsule', position: [0, 1.43, 0.005], args: [0.062, 0.085, 6, 18] },
  // ── Shoulders (deltoids) ──
  { name: 'r-shoulder-l', type: 'sphere', position: [-0.255, 1.345, 0.01], args: [0.105, 22, 22], scale: [1.0, 0.92, 1.0] },
  { name: 'r-shoulder-r', type: 'sphere', position: [0.255, 1.345, 0.01], args: [0.105, 22, 22], scale: [1.0, 0.92, 1.0] },
  // ── Chest (pectorals) ──
  { name: 'r-chest-left', type: 'sphere', position: [-0.092, 1.17, 0.055], args: [0.15, 28, 28], scale: [0.96, 1.05, 0.82] },
  { name: 'r-chest-right', type: 'sphere', position: [0.092, 1.17, 0.055], args: [0.15, 28, 28], scale: [0.96, 1.05, 0.82] },
  { name: 'r-sternum', type: 'capsule', position: [0, 1.13, 0.125], args: [0.03, 0.26, 6, 14] },
  // ── Abdomen quadrants ──
  { name: 'r-upper-abdomen-left', type: 'sphere', position: [-0.092, 0.92, 0.05], args: [0.125, 24, 24], scale: [1.0, 0.88, 0.86] },
  { name: 'r-upper-abdomen-right', type: 'sphere', position: [0.092, 0.92, 0.05], args: [0.125, 24, 24], scale: [1.0, 0.88, 0.86] },
  { name: 'r-epigastrium', type: 'sphere', position: [0, 0.99, 0.115], args: [0.07, 18, 18], scale: [1.1, 0.9, 0.55] },
  { name: 'r-lower-abdomen-left', type: 'sphere', position: [-0.09, 0.71, 0.05], args: [0.122, 24, 24], scale: [1.0, 0.92, 0.86] },
  { name: 'r-lower-abdomen-right', type: 'sphere', position: [0.09, 0.71, 0.05], args: [0.122, 24, 24], scale: [1.0, 0.92, 0.86] },
  { name: 'r-suprapubic', type: 'sphere', position: [0, 0.55, 0.055], args: [0.11, 20, 20], scale: [1.05, 0.78, 0.78] },
  // ── Pelvis + groin ──
  { name: 'r-pelvis', type: 'capsule', position: [0, 0.43, 0], args: [0.135, 0.14, 8, 22], rotation: [0, 0, Math.PI / 2] },
  { name: 'r-groin', type: 'sphere', position: [0, 0.31, 0.06], args: [0.085, 16, 16], scale: [1.1, 0.75, 0.85] },
  // ── Left arm ──
  { name: 'r-upper-arm-l', type: 'capsule', position: [-0.345, 1.10, 0.005], args: [0.058, 0.30, 6, 18], rotation: [0, 0, 0.11] },
  { name: 'r-elbow-l', type: 'sphere', position: [-0.385, 0.86, 0], args: [0.054, 18, 18] },
  { name: 'r-forearm-l', type: 'capsule', position: [-0.405, 0.62, 0], args: [0.049, 0.28, 6, 16], rotation: [0, 0, 0.05] },
  { name: 'r-wrist-l', type: 'sphere', position: [-0.42, 0.41, 0], args: [0.042, 16, 16] },
  { name: 'r-hand-l', type: 'sphere', position: [-0.425, 0.33, 0], args: [0.06, 18, 18], scale: [0.62, 1.35, 0.34] },
  // ── Right arm ──
  { name: 'r-upper-arm-r', type: 'capsule', position: [0.345, 1.10, 0.005], args: [0.058, 0.30, 6, 18], rotation: [0, 0, -0.11] },
  { name: 'r-elbow-r', type: 'sphere', position: [0.385, 0.86, 0], args: [0.054, 18, 18] },
  { name: 'r-forearm-r', type: 'capsule', position: [0.405, 0.62, 0], args: [0.049, 0.28, 6, 16], rotation: [0, 0, -0.05] },
  { name: 'r-wrist-r', type: 'sphere', position: [0.42, 0.41, 0], args: [0.042, 16, 16] },
  { name: 'r-hand-r', type: 'sphere', position: [0.425, 0.33, 0], args: [0.06, 18, 18], scale: [0.62, 1.35, 0.34] },
  // ── Left leg ──
  { name: 'r-thigh-l', type: 'capsule', position: [-0.115, 0.07, 0.005], args: [0.088, 0.34, 8, 20], rotation: [0, 0, 0.02] },
  { name: 'r-knee-l', type: 'sphere', position: [-0.12, -0.22, 0.01], args: [0.072, 18, 18] },
  { name: 'r-calf-l', type: 'capsule', position: [-0.125, -0.48, 0], args: [0.062, 0.32, 8, 18] },
  { name: 'r-ankle-l', type: 'sphere', position: [-0.13, -0.76, 0], args: [0.05, 16, 16] },
  { name: 'r-foot-l', type: 'sphere', position: [-0.13, -0.83, 0.08], args: [0.07, 18, 18], scale: [0.7, 0.55, 1.75] },
  // ── Right leg ──
  { name: 'r-thigh-r', type: 'capsule', position: [0.115, 0.07, 0.005], args: [0.088, 0.34, 8, 20], rotation: [0, 0, -0.02] },
  { name: 'r-knee-r', type: 'sphere', position: [0.12, -0.22, 0.01], args: [0.072, 18, 18] },
  { name: 'r-calf-r', type: 'capsule', position: [0.125, -0.48, 0], args: [0.062, 0.32, 8, 18] },
  { name: 'r-ankle-r', type: 'sphere', position: [0.13, -0.76, 0], args: [0.05, 16, 16] },
  { name: 'r-foot-r', type: 'sphere', position: [0.13, -0.83, 0.08], args: [0.07, 18, 18], scale: [0.7, 0.55, 1.75] },
  // ── Back (rounded shells; user rotates to reach them) ──
  { name: 'r-head-back', type: 'sphere', position: [0, 1.63, -0.10], args: [0.105, 18, 18], scale: [1.0, 1.05, 0.55] },
  { name: 'r-neck-back', type: 'capsule', position: [0, 1.43, -0.045], args: [0.05, 0.07, 5, 14] },
  { name: 'r-upper-back-l', type: 'sphere', position: [-0.092, 1.17, -0.075], args: [0.15, 24, 24], scale: [0.96, 1.05, 0.55] },
  { name: 'r-upper-back-r', type: 'sphere', position: [0.092, 1.17, -0.075], args: [0.15, 24, 24], scale: [0.96, 1.05, 0.55] },
  { name: 'r-mid-back', type: 'sphere', position: [0, 0.92, -0.075], args: [0.16, 22, 22], scale: [1.05, 0.7, 0.5] },
  { name: 'r-lower-back', type: 'sphere', position: [0, 0.68, -0.075], args: [0.15, 22, 22], scale: [1.05, 0.78, 0.5] },
  { name: 'r-buttocks-l', type: 'sphere', position: [-0.092, 0.40, -0.075], args: [0.115, 20, 20], scale: [1.05, 1.0, 0.85] },
  { name: 'r-buttocks-r', type: 'sphere', position: [0.092, 0.40, -0.075], args: [0.115, 20, 20], scale: [1.05, 1.0, 0.85] },
  { name: 'r-back-thigh-l', type: 'capsule', position: [-0.115, 0.07, -0.045], args: [0.05, 0.30, 6, 14] },
  { name: 'r-back-thigh-r', type: 'capsule', position: [0.115, 0.07, -0.045], args: [0.05, 0.30, 6, 14] },
  { name: 'r-calf-back-l', type: 'capsule', position: [-0.125, -0.48, -0.045], args: [0.045, 0.30, 6, 14] },
  { name: 'r-calf-back-r', type: 'capsule', position: [0.125, -0.48, -0.045], args: [0.045, 0.30, 6, 14] },
  { name: 'r-heel-l', type: 'sphere', position: [-0.13, -0.82, -0.045], args: [0.05, 14, 14], scale: [0.9, 1.0, 0.8] },
  { name: 'r-heel-r', type: 'sphere', position: [0.13, -0.82, -0.045], args: [0.05, 14, 14], scale: [0.9, 1.0, 0.8] },
];

interface SelectedRegion {
  region: BodyRegion;
  worldPos: THREE.Vector3;
  meshLocalPos: [number, number, number];
}

interface BodyMap3DProps {
  /** Currently-placed pins (rendered as glowing spheres). */
  pins: Pin[];
  /** Maximum number of pins (per SYMPTOM_CINEMA, default 5). */
  maxPins?: number;
  /** Fired when a region is tapped — caller opens the PainPanel. */
  onRegionTap: (selection: SelectedRegion) => void;
  /** Fires once on first user interaction so the parent can stop auto-rotate cues. */
  onFirstInteraction?: () => void;
}

export function BodyMap3D({
  pins,
  maxPins = 5,
  onRegionTap,
  onFirstInteraction,
}: BodyMap3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const reduced = useReduced();
  const tapStartRef = useRef<{ ts: number; x: number; y: number } | null>(null);

  // Idle auto-rotation (paused after first interaction; off when reduced-motion).
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (reduced || interacted) return;
    groupRef.current.rotation.y += delta * 0.3;
  });

  const noteInteraction = useCallback(() => {
    if (interacted) return;
    setInteracted(true);
    onFirstInteraction?.();
  }, [interacted, onFirstInteraction]);

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      tapStartRef.current = { ts: performance.now(), x: e.clientX, y: e.clientY };
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (!start) return;
      const dt = performance.now() - start.ts;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      // Tap = quick + small movement. Otherwise it's a rotate gesture.
      if (dt > 250 || dx > 6 || dy > 6) return;

      noteInteraction();

      const hit = e.object as THREE.Mesh;
      const meshName = hit.name;
      const region = REGIONS_BY_MESH[meshName];
      if (!region) return;
      if (pins.length >= maxPins) return;

      // Brief flash to confirm the tap landed.
      const mat = hit.material as THREE.MeshStandardMaterial;
      if (mat && 'color' in mat) {
        const original = mat.color.clone();
        const target = new THREE.Color(SKIN_TAPPED);
        gsap.to(mat.color, {
          r: target.r,
          g: target.g,
          b: target.b,
          duration: 0.15,
          yoyo: true,
          repeat: 1,
          onComplete: () => mat.color.copy(original),
        });
      }

      const worldPos = e.point.clone();
      const localPos = hit.worldToLocal(worldPos.clone());

      onRegionTap({
        region,
        worldPos: e.point.clone(),
        meshLocalPos: [localPos.x, localPos.y, localPos.z],
      });
    },
    [maxPins, noteInteraction, onRegionTap, pins.length],
  );

  return (
    <>
      <group ref={groupRef}>
        {PLACEHOLDER_PARTS.map((part) => (
          <BodyPartMesh
            key={part.name}
            part={part}
            hovered={hoveredMesh === part.name}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredMesh(part.name);
              if (typeof document !== 'undefined') {
                document.body.style.cursor = 'pointer';
              }
            }}
            onPointerOut={() => {
              setHoveredMesh(null);
              if (typeof document !== 'undefined') {
                document.body.style.cursor = 'auto';
              }
            }}
          />
        ))}

        {pins.map((pin, i) => (
          <PinMarker key={`${pin.body_region}-${i}`} pin={pin} />
        ))}
      </group>
    </>
  );
}

interface BodyPartMeshProps {
  part: BodyPart;
  hovered: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
}

function BodyPartMesh({
  part,
  hovered,
  onPointerDown,
  onPointerUp,
  onPointerOver,
  onPointerOut,
}: BodyPartMeshProps) {
  const color = hovered ? SKIN_HOVER : SKIN_COLOR;

  return (
    <mesh
      name={part.name}
      position={part.position}
      rotation={part.rotation}
      scale={part.scale}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      castShadow={false}
      receiveShadow={false}
    >
      {part.type === 'sphere' && (
        <sphereGeometry args={part.args as [number, number?, number?]} />
      )}
      {part.type === 'box' && (
        <boxGeometry args={part.args as [number, number, number]} />
      )}
      {part.type === 'cylinder' && (
        <cylinderGeometry args={part.args as [number, number, number, number?]} />
      )}
      {part.type === 'capsule' && (
        <capsuleGeometry args={part.args as [number, number, number?, number?]} />
      )}
      {/* Physically-based skin: subtle subsurface warmth via sheen +
          clearcoat, lit by the studio HDRI + SSAO from <Scene>. This is
          what turns the segmented forms into a believable body. */}
      <meshPhysicalMaterial
        color={color}
        roughness={0.52}
        metalness={0}
        clearcoat={0.14}
        clearcoatRoughness={0.6}
        sheen={0.55}
        sheenRoughness={0.85}
        sheenColor={SKIN_SHEEN}
        envMapIntensity={0.55}
        flatShading={false}
      />
    </mesh>
  );
}

const PIN_INTENSITY_COLORS = [
  '#86efac', // 1 — pale green
  '#bef264', // 2 — lime
  '#fde047', // 3 — yellow
  '#fdba74', // 4 — amber
  '#fb923c', // 5 — orange
  '#f97316', // 6 — deep orange
  '#ef4444', // 7 — red
  '#dc2626', // 8 — deep red
  '#b91c1c', // 9 — crimson
  '#7f1d1d', // 10 — maroon
];

function PinMarker({ pin }: { pin: Pin }) {
  const pos = pin.mesh_position_3d ?? [0, 0, 0];
  // Place pin slightly out from the surface so it doesn't z-fight.
  // We approximate "out" as a small radial offset along the normalized vector.
  const v = useMemo(() => {
    const vec = new THREE.Vector3(...pos).normalize().multiplyScalar(0.04);
    return [pos[0] + vec.x, pos[1] + vec.y, pos[2] + vec.z] as [number, number, number];
  }, [pos]);

  const color =
    PIN_INTENSITY_COLORS[Math.max(0, Math.min(9, pin.intensity - 1))] ?? '#fdba74';

  return (
    <group position={v}>
      <mesh>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Halo */}
      <mesh>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      <Html
        center
        distanceFactor={6}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            color: 'white',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${color}`,
            whiteSpace: 'nowrap',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {pin.intensity}/10
        </div>
      </Html>
    </group>
  );
}

export type { SelectedRegion };
