'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Loader2 } from 'lucide-react';
import * as THREE from 'three';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';

interface NeuralNetProps {
  /** Show the visualizer. When false, renders nothing. */
  isThinking: boolean;
  /** Optional caption beneath the network ("Analyzing your symptoms…"). */
  caption?: string;
  /** Visual height (px). */
  height?: number;
  className?: string;
}

const LAYERS = [3, 5, 5, 3];

/**
 * Plan 6.2 — NeuralNet. Decorative R3F visualizer that runs during the
 * inference gap between user submission and verdict render. Four layers of
 * 3-5-5-3 nodes; one signal pulse travels left → right per ~1.2s while
 * `isThinking=true`.
 *
 * **Honesty caveat (load-bearing):** drei `<Html>` tooltip + visible caption
 * always say *"Visual representation; not the actual model graph"*. This
 * pre-empts the QA hostile question "is this a real network?" — answered
 * in [QA_WAR_GAME.md](docs/QA_WAR_GAME.md) Q26-style.
 *
 * **Reduced-motion contract:** swap the Canvas for a "Analyzing…" text +
 * spin-disabled Loader2 icon. Same DOM footprint, no animation.
 */
export function NeuralNet({
  isThinking,
  caption,
  height = 96,
  className = '',
}: NeuralNetProps) {
  const reduced = useReduced();
  const { t } = useTranslation();

  if (!isThinking) return null;

  if (reduced) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={t('neural.aria')}
        className={`inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 ${className}`}
      >
        <Loader2 className="h-3.5 w-3.5" aria-hidden />
        <span>{caption ?? t('neural.analyzing')}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={t('neural.aria')}
      className={`relative w-full rounded-lg overflow-hidden bg-slate-950/40 border border-slate-800 ${className}`}
      style={{ height }}
    >
      <Canvas
        aria-hidden
        camera={{ position: [0, 0, 4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 3]} intensity={0.6} />
        <Network />
      </Canvas>
      <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-slate-400">
        <span aria-hidden>{caption ?? t('neural.analyzing')}</span>
        <span
          className="rounded bg-slate-900/70 px-1.5 py-0.5 italic text-slate-500"
          title="Visual representation only — not the actual model graph"
        >
          {t('neural.honestCaveat')}
        </span>
      </div>
    </div>
  );
}

const NODE_COLOR = '#7F77DD';
const EDGE_COLOR = '#7F77DD';
const PULSE_COLOR = '#f0e9ff';

function Network() {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  // Build node positions: center each layer vertically, spread horizontally.
  const nodes = useMemo<THREE.Vector3[]>(() => {
    const out: THREE.Vector3[] = [];
    const xSpan = 2.6;
    LAYERS.forEach((count, layerIdx) => {
      const x = (layerIdx - (LAYERS.length - 1) / 2) * (xSpan / (LAYERS.length - 1));
      for (let i = 0; i < count; i++) {
        const y = (i - (count - 1) / 2) * 0.42;
        out.push(new THREE.Vector3(x, y, 0));
      }
    });
    return out;
  }, []);

  // Build edges: every node in layer k connects to every node in layer k+1.
  const edgeBuffer = useMemo(() => {
    const segs: number[] = [];
    let cursor = 0;
    for (let l = 0; l < LAYERS.length - 1; l++) {
      const aStart = cursor;
      const aEnd = cursor + LAYERS[l];
      const bEnd = aEnd + LAYERS[l + 1];
      for (let a = aStart; a < aEnd; a++) {
        for (let b = aEnd; b < bEnd; b++) {
          segs.push(nodes[a].x, nodes[a].y, nodes[a].z);
          segs.push(nodes[b].x, nodes[b].y, nodes[b].z);
        }
      }
      cursor = aEnd;
    }
    return new Float32Array(segs);
  }, [nodes]);

  // Pulse path: just walks across the layer x-positions to look like a signal.
  const layerXs = useMemo(() => {
    const xSpan = 2.6;
    return LAYERS.map(
      (_, l) => (l - (LAYERS.length - 1) / 2) * (xSpan / (LAYERS.length - 1)),
    );
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.08;
    }
    if (pulseRef.current) {
      // 0..1 over 1.2s, looping. Position interp across layer xs.
      const phase = (t % 1.2) / 1.2;
      const segIdx = Math.min(layerXs.length - 2, Math.floor(phase * (layerXs.length - 1)));
      const segPhase = phase * (layerXs.length - 1) - segIdx;
      const x = layerXs[segIdx] + (layerXs[segIdx + 1] - layerXs[segIdx]) * segPhase;
      pulseRef.current.position.x = x;
      pulseRef.current.position.y = Math.sin(t * 4 + segIdx) * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Edges */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[edgeBuffer, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.28} />
      </lineSegments>

      {/* Nodes */}
      {nodes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.085, 16, 16]} />
          <meshStandardMaterial
            color={NODE_COLOR}
            emissive={NODE_COLOR}
            emissiveIntensity={0.45}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Traveling pulse */}
      <mesh ref={pulseRef} position={[layerXs[0], 0, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color={PULSE_COLOR} />
      </mesh>
    </group>
  );
}
