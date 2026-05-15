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

const SKIN_COLOR = '#d8a384';
const SKIN_HOVER = '#f0c2a4';
const SKIN_TAPPED = '#e2735c';

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
  type: 'sphere' | 'box' | 'cylinder';
  /** [x, y, z] position relative to body group origin. */
  position: [number, number, number];
  /** Geometry args:
   *   sphere   -> [radius, widthSegments?, heightSegments?]
   *   box      -> [width, height, depth]
   *   cylinder -> [radiusTop, radiusBottom, height, radialSegments?]
   */
  args: number[];
  rotation?: [number, number, number];
}

const PLACEHOLDER_PARTS: BodyPart[] = [
  // Head
  { name: 'r-head-front', type: 'sphere', position: [0, 1.7, 0], args: [0.2, 24, 24] },
  { name: 'r-face', type: 'sphere', position: [0, 1.65, 0.18], args: [0.05, 16, 16] },
  // Neck
  { name: 'r-neck-front', type: 'cylinder', position: [0, 1.45, 0], args: [0.075, 0.085, 0.18, 16] },
  // Shoulders
  { name: 'r-shoulder-l', type: 'sphere', position: [-0.32, 1.32, 0], args: [0.13, 18, 18] },
  { name: 'r-shoulder-r', type: 'sphere', position: [0.32, 1.32, 0], args: [0.13, 18, 18] },
  // Chest split
  { name: 'r-chest-left', type: 'box', position: [-0.15, 1.1, 0.04], args: [0.3, 0.4, 0.22] },
  { name: 'r-chest-right', type: 'box', position: [0.15, 1.1, 0.04], args: [0.3, 0.4, 0.22] },
  { name: 'r-sternum', type: 'box', position: [0, 1.1, 0.16], args: [0.06, 0.4, 0.02] },
  // Abdomen quadrants
  { name: 'r-upper-abdomen-left', type: 'box', position: [-0.13, 0.78, 0.05], args: [0.26, 0.18, 0.2] },
  { name: 'r-upper-abdomen-right', type: 'box', position: [0.13, 0.78, 0.05], args: [0.26, 0.18, 0.2] },
  { name: 'r-epigastrium', type: 'box', position: [0, 0.85, 0.16], args: [0.08, 0.1, 0.02] },
  { name: 'r-lower-abdomen-left', type: 'box', position: [-0.13, 0.6, 0.05], args: [0.26, 0.16, 0.2] },
  { name: 'r-lower-abdomen-right', type: 'box', position: [0.13, 0.6, 0.05], args: [0.26, 0.16, 0.2] },
  { name: 'r-suprapubic', type: 'box', position: [0, 0.48, 0.06], args: [0.18, 0.08, 0.18] },
  // Pelvis + groin
  { name: 'r-pelvis', type: 'box', position: [0, 0.36, 0], args: [0.45, 0.16, 0.24] },
  { name: 'r-groin', type: 'box', position: [0, 0.27, 0.08], args: [0.16, 0.08, 0.1] },
  // Arms — left
  { name: 'r-upper-arm-l', type: 'cylinder', position: [-0.4, 1.05, 0], args: [0.075, 0.085, 0.42, 12], rotation: [0, 0, 0.08] },
  { name: 'r-elbow-l', type: 'sphere', position: [-0.43, 0.82, 0], args: [0.075, 14, 14] },
  { name: 'r-forearm-l', type: 'cylinder', position: [-0.45, 0.6, 0], args: [0.06, 0.075, 0.4, 12], rotation: [0, 0, 0.04] },
  { name: 'r-wrist-l', type: 'sphere', position: [-0.46, 0.39, 0], args: [0.055, 14, 14] },
  { name: 'r-hand-l', type: 'box', position: [-0.46, 0.3, 0], args: [0.08, 0.13, 0.04] },
  // Arms — right
  { name: 'r-upper-arm-r', type: 'cylinder', position: [0.4, 1.05, 0], args: [0.075, 0.085, 0.42, 12], rotation: [0, 0, -0.08] },
  { name: 'r-elbow-r', type: 'sphere', position: [0.43, 0.82, 0], args: [0.075, 14, 14] },
  { name: 'r-forearm-r', type: 'cylinder', position: [0.45, 0.6, 0], args: [0.06, 0.075, 0.4, 12], rotation: [0, 0, -0.04] },
  { name: 'r-wrist-r', type: 'sphere', position: [0.46, 0.39, 0], args: [0.055, 14, 14] },
  { name: 'r-hand-r', type: 'box', position: [0.46, 0.3, 0], args: [0.08, 0.13, 0.04] },
  // Legs — left
  { name: 'r-thigh-l', type: 'cylinder', position: [-0.13, 0.06, 0], args: [0.1, 0.115, 0.55, 14] },
  { name: 'r-knee-l', type: 'sphere', position: [-0.13, -0.24, 0], args: [0.09, 16, 16] },
  { name: 'r-calf-l', type: 'cylinder', position: [-0.13, -0.5, 0], args: [0.075, 0.09, 0.5, 14] },
  { name: 'r-ankle-l', type: 'sphere', position: [-0.13, -0.78, 0], args: [0.07, 14, 14] },
  { name: 'r-foot-l', type: 'box', position: [-0.13, -0.84, 0.06], args: [0.1, 0.06, 0.22] },
  // Legs — right
  { name: 'r-thigh-r', type: 'cylinder', position: [0.13, 0.06, 0], args: [0.1, 0.115, 0.55, 14] },
  { name: 'r-knee-r', type: 'sphere', position: [0.13, -0.24, 0], args: [0.09, 16, 16] },
  { name: 'r-calf-r', type: 'cylinder', position: [0.13, -0.5, 0], args: [0.075, 0.09, 0.5, 14] },
  { name: 'r-ankle-r', type: 'sphere', position: [0.13, -0.78, 0], args: [0.07, 14, 14] },
  { name: 'r-foot-r', type: 'box', position: [0.13, -0.84, 0.06], args: [0.1, 0.06, 0.22] },
  // Back regions — same coords as front but flagged via region taxonomy view='back'.
  // The user rotates the body to see them; raycast still hits these meshes.
  { name: 'r-head-back', type: 'sphere', position: [0, 1.7, -0.18], args: [0.05, 14, 14] },
  { name: 'r-neck-back', type: 'cylinder', position: [0, 1.45, -0.04], args: [0.04, 0.04, 0.18, 12] },
  { name: 'r-upper-back-l', type: 'box', position: [-0.15, 1.1, -0.16], args: [0.3, 0.4, 0.04] },
  { name: 'r-upper-back-r', type: 'box', position: [0.15, 1.1, -0.16], args: [0.3, 0.4, 0.04] },
  { name: 'r-mid-back', type: 'box', position: [0, 0.9, -0.16], args: [0.4, 0.18, 0.04] },
  { name: 'r-lower-back', type: 'box', position: [0, 0.65, -0.16], args: [0.4, 0.18, 0.04] },
  { name: 'r-buttocks-l', type: 'box', position: [-0.13, 0.36, -0.13], args: [0.22, 0.16, 0.1] },
  { name: 'r-buttocks-r', type: 'box', position: [0.13, 0.36, -0.13], args: [0.22, 0.16, 0.1] },
  { name: 'r-back-thigh-l', type: 'cylinder', position: [-0.13, 0.06, -0.04], args: [0.04, 0.04, 0.55, 12] },
  { name: 'r-back-thigh-r', type: 'cylinder', position: [0.13, 0.06, -0.04], args: [0.04, 0.04, 0.55, 12] },
  { name: 'r-calf-back-l', type: 'cylinder', position: [-0.13, -0.5, -0.04], args: [0.04, 0.04, 0.5, 12] },
  { name: 'r-calf-back-r', type: 'cylinder', position: [0.13, -0.5, -0.04], args: [0.04, 0.04, 0.5, 12] },
  { name: 'r-heel-l', type: 'sphere', position: [-0.13, -0.83, -0.05], args: [0.045, 12, 12] },
  { name: 'r-heel-r', type: 'sphere', position: [0.13, -0.83, -0.05], args: [0.045, 12, 12] },
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
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
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
