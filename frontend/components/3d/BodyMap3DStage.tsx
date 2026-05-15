'use client';

import { Scene } from './Scene';
import { BodyMap3D, type SelectedRegion } from './BodyMap3D';
import type { Pin } from '@/lib/types';

interface BodyMap3DStageProps {
  pins: Pin[];
  maxPins?: number;
  onRegionTap: (selection: SelectedRegion) => void;
  onFirstInteraction?: () => void;
}

/**
 * Composes the shared R3F <Scene> Canvas with the procedural 3D body so the
 * /triage/body-map-3d route renders a real, orbitable anatomical figure.
 *
 * Framing: the body spans y ≈ −0.92 (soles) … +1.78 (crown), so its vertical
 * centre sits ≈ +0.43. We sink the body group by 0.43 to centre it on the
 * origin (OrbitControls' default target) and pull the camera back enough to
 * frame head-to-toe with breathing room at fov 42.
 *
 * Imported via next/dynamic({ssr:false}) — R3F needs browser-only WebGL APIs.
 */
export function BodyMap3DStage({
  pins,
  maxPins = 5,
  onRegionTap,
  onFirstInteraction,
}: BodyMap3DStageProps) {
  return (
    <Scene
      cameraPosition={[0, 0.15, 4.6]}
      fov={42}
      controls
      postProcessing
      className="!absolute inset-0"
    >
      <group position={[0, -0.43, 0]}>
        <BodyMap3D
          pins={pins}
          maxPins={maxPins}
          onRegionTap={onRegionTap}
          onFirstInteraction={onFirstInteraction}
        />
      </group>
    </Scene>
  );
}

export type { SelectedRegion };
