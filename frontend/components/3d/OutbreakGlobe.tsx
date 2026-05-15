'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import {
  KIND_COLOR,
  latLonToVec3,
  type OutbreakCluster,
} from '@/lib/outbreak-mock';
import { useReduced } from '@/lib/reduced-motion';

interface OutbreakGlobeProps {
  clusters: OutbreakCluster[];
  /** Show in pixels — globe canvas square. */
  size?: number;
  /** Auto-rotate the globe on idle (off when reduced-motion). */
  autoRotate?: boolean;
  /** Fired when the user clicks a cluster spike. */
  onSelect?: (cluster: OutbreakCluster) => void;
  className?: string;
}

const GLOBE_RADIUS = 2;
const SPIKE_BASE_RADIUS = 0.025;

/**
 * Plan 6.3 — OutbreakGlobe. R3F 3D Earth (low-poly) with vertical spike
 * cylinders pinned at each cluster's lat/lon. Spike height = `case_count`,
 * color = outbreak `kind`. Click → onSelect callback.
 *
 * **No Mapbox dependency** — pure Three.js/R3F. Mapbox 3D heatmap is a
 * separate component (Tier 6.3 Phase A) gated on Mapbox token decision.
 *
 * **Reduced-motion contract:** auto-rotate disabled, OrbitControls
 * damping reduced. The globe still mounts (3D is the point of the page);
 * a flat fallback is provided as `<OutbreakList>` rendered alongside on
 * the page surface.
 *
 * **Earth texture:** uses a procedural blue-gray sphere instead of a
 * texture — keeps the bundle small (no /public/earth_*.jpg required).
 * Real texture swap is a one-line change when an asset lands.
 */
export function OutbreakGlobe({
  clusters,
  size = 460,
  autoRotate = true,
  onSelect,
  className = '',
}: OutbreakGlobeProps) {
  const reduced = useReduced();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40 ${className}`}
      style={{ width: '100%', maxWidth: size, height: size, aspectRatio: '1 / 1' }}
    >
      <Canvas
        camera={{ position: [0, 0.5, 5.4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} color="#fff" />
        <directionalLight position={[-5, -2, -3]} intensity={0.3} color="#7F77DD" />

        <Earth autoRotate={autoRotate && !reduced}>
          {clusters.map((c) => (
            <ClusterSpike
              key={c.id}
              cluster={c}
              hovered={hoveredId === c.id}
              onPointerOver={() => setHoveredId(c.id)}
              onPointerOut={() => setHoveredId((id) => (id === c.id ? null : id))}
              onClick={() => onSelect?.(c)}
            />
          ))}
        </Earth>

        {/* atmosphere glow */}
        <Sphere args={[GLOBE_RADIUS * 1.04, 48, 48]}>
          <meshBasicMaterial color="#7F77DD" transparent opacity={0.06} side={THREE.BackSide} />
        </Sphere>

        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={9}
          enableDamping={!reduced}
          dampingFactor={reduced ? 0 : 0.08}
          rotateSpeed={0.6}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>India · last 72h</span>
        <span>{clusters.length} clusters</span>
      </div>
    </div>
  );
}

interface EarthProps {
  autoRotate: boolean;
  children?: React.ReactNode;
}

function Earth({ autoRotate, children }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null);
  // Position so India faces the camera by default (lat ~22, lon ~78).
  const initialRotation = useMemo<[number, number, number]>(
    () => [(-22 * Math.PI) / 180, ((360 - 78) * Math.PI) / 180, 0],
    [],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (!autoRotate) return;
    groupRef.current.rotation.y += delta * 0.06;
  });

  return (
    <group ref={groupRef} rotation={initialRotation}>
      {/* Base sphere */}
      <Sphere args={[GLOBE_RADIUS, 64, 64]}>
        <meshStandardMaterial
          color="#1a2744"
          roughness={0.85}
          metalness={0.05}
          flatShading={false}
        />
      </Sphere>
      {/* Stylized "land" overlay using a slightly-larger transparent sphere
          tinted greener — gives the globe a hint of geography without needing
          a real texture asset. */}
      <Sphere args={[GLOBE_RADIUS * 1.001, 32, 32]}>
        <meshBasicMaterial
          color="#1d4a3a"
          transparent
          opacity={0.18}
          wireframe
        />
      </Sphere>
      {children}
    </group>
  );
}

interface ClusterSpikeProps {
  cluster: OutbreakCluster;
  hovered: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
}

function ClusterSpike({
  cluster,
  hovered,
  onPointerOver,
  onPointerOut,
  onClick,
}: ClusterSpikeProps) {
  // Spike sits above surface — base at globe surface, top extends radially.
  const heightUnit = Math.min(cluster.case_count / 10, 1.4);
  const baseHeight = 0.05 + heightUnit;
  const color = KIND_COLOR[cluster.kind];

  // Position the spike's CENTER at GLOBE_RADIUS + half its height along
  // the radial outward direction.
  const surfacePoint = useMemo(
    () => latLonToVec3(cluster.lat, cluster.lon, GLOBE_RADIUS),
    [cluster.lat, cluster.lon],
  );
  const radialOut = useMemo(
    () => latLonToVec3(cluster.lat, cluster.lon, 1).map((v) => v),
    [cluster.lat, cluster.lon],
  );
  const center = useMemo<[number, number, number]>(() => {
    const halfH = baseHeight / 2;
    return [
      surfacePoint[0] + radialOut[0] * halfH,
      surfacePoint[1] + radialOut[1] * halfH,
      surfacePoint[2] + radialOut[2] * halfH,
    ];
  }, [surfacePoint, radialOut, baseHeight]);

  // Orient cylinder so its Y-axis points along the surface normal.
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(...radialOut).normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, target);
  }, [radialOut]);

  const tip: [number, number, number] = [
    surfacePoint[0] + radialOut[0] * baseHeight,
    surfacePoint[1] + radialOut[1] * baseHeight,
    surfacePoint[2] + radialOut[2] * baseHeight,
  ];

  return (
    <group>
      <mesh
        position={center}
        quaternion={quaternion}
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver();
          if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onPointerOut();
          if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <cylinderGeometry
          args={[SPIKE_BASE_RADIUS * 0.6, SPIKE_BASE_RADIUS, baseHeight, 10]}
        />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.2 : 0.7}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Tooltip (drei <Html>), only when hovered to reduce DOM churn */}
      {hovered && (
        <Html
          position={tip}
          distanceFactor={8}
          style={{ pointerEvents: 'none', transform: 'translate3d(8px, -12px, 0)' }}
        >
          <div
            className="rounded-md border bg-slate-950/95 px-2 py-1 text-[10px] text-slate-100 backdrop-blur whitespace-nowrap shadow-lg"
            style={{ borderColor: color }}
          >
            <div className="font-semibold">{cluster.district}</div>
            <div className="text-slate-400">
              {cluster.case_count} cases · {cluster.kind}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
