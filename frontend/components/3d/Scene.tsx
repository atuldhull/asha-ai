'use client';

import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  AdaptiveDpr,
  AdaptiveEvents,
  Environment,
  OrbitControls,
  Preload,
} from '@react-three/drei';
import { EffectComposer, Bloom, SSAO } from '@react-three/postprocessing';
import { useReduced } from '@/lib/reduced-motion';

interface SceneProps {
  children: ReactNode;
  /** Override the default camera position. */
  cameraPosition?: [number, number, number];
  /** Override the default field of view. */
  fov?: number;
  /** Disable post-processing on low-end devices. */
  postProcessing?: boolean;
  /** Show OrbitControls — disabled when reduced-motion is set regardless. */
  controls?: boolean;
  className?: string;
}

/**
 * Plan 6.1 shared 3D Canvas wrapper per FRONTEND_BLUEPRINT §3.
 *
 * Adaptive DPR + adaptive events keep frame rate above 30 fps on mid-range
 * Android. Subtle Bloom + SSAO give the cinematic studio look without the
 * cartoon feel. HDRI environment uses the drei `studio` preset until the
 * user-supplied `studio_small_07_1k.hdr` lands in `public/anatomy/env/`.
 *
 * Reduced-motion: `frameloop="demand"` (re-renders only on demand instead
 * of every animation frame), OrbitControls disabled, post-processing off.
 */
export function Scene({
  children,
  cameraPosition = [0, 0, 5],
  fov = 45,
  postProcessing = true,
  controls = true,
  className = '',
}: SceneProps) {
  const reduced = useReduced();

  return (
    <Canvas
      camera={{ position: cameraPosition, fov }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={reduced ? 'demand' : 'always'}
      className={className}
      style={{ background: 'transparent' }}
    >
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />

      <Suspense fallback={null}>
        <Environment preset="studio" />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-5, 3, -3]} intensity={0.3} />

        {children}

        {postProcessing && !reduced && (
          <EffectComposer multisampling={4}>
            <Bloom
              luminanceThreshold={0.85}
              luminanceSmoothing={0.3}
              intensity={0.3}
              mipmapBlur
            />
            <SSAO
              samples={11}
              radius={0.3}
              intensity={0.5}
              luminanceInfluence={0.5}
              worldDistanceThreshold={1}
              worldDistanceFalloff={1}
              worldProximityThreshold={1}
              worldProximityFalloff={1}
            />
          </EffectComposer>
        )}
      </Suspense>

      {controls && !reduced && (
        <OrbitControls
          enablePan={false}
          minDistance={2.2}
          maxDistance={8}
          enableDamping
          dampingFactor={0.08}
        />
      )}

      <Preload all />
    </Canvas>
  );
}
