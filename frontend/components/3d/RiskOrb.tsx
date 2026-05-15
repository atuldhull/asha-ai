'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import * as THREE from 'three';
import type {
  CareLevel,
  RiskLevel,
  RiskTrajectory,
} from '@/lib/types';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { interp } from '@/lib/i18n/dict';

interface RiskOrbProps {
  /** 0..100 dynamic risk score from Plan 5.1. */
  score: number;
  /** Risk band — drives the orb color. */
  level: RiskLevel;
  /** Trajectory direction over the last 24h of samples. */
  trajectory: RiskTrajectory;
  /** Care-level care string — never paraphrased; rendered as exact label. */
  careLevel: CareLevel;
  /** When true, orb pulses faster + outline ring + label appends "(Rule)". */
  redFlagFired?: boolean;
  /** Visual size of the canvas (defaults to 220×220). */
  size?: number;
  className?: string;
}

const LEVEL_COLOR: Record<RiskLevel, string> = {
  LOW: '#1D9E75',
  MODERATE: '#7F77DD',
  HIGH: '#EF9F27',
  CRITICAL: '#E24B4A',
};

const LEVEL_BG: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-500/10 border-emerald-500/40',
  MODERATE: 'bg-violet-500/10 border-violet-500/40',
  HIGH: 'bg-amber-500/10 border-amber-500/40',
  CRITICAL: 'bg-red-500/10 border-red-500/40',
};

const TRAJECTORY_ICON: Record<RiskTrajectory, typeof TrendingUp> = {
  rapidly_worsening: TrendingUp,
  worsening: TrendingUp,
  stable: Minus,
  improving: TrendingDown,
  insufficient_data: Activity,
};

const TRAJECTORY_TONE: Record<RiskTrajectory, string> = {
  rapidly_worsening: 'text-red-300',
  worsening: 'text-orange-300',
  stable: 'text-slate-300',
  improving: 'text-emerald-300',
  insufficient_data: 'text-slate-400',
};

/**
 * Plan 6.2 — RiskOrb. The headline element on the verdict screen.
 *
 * Living 3D sphere whose color, distortion, and pulse speed are keyed to
 * the Plan 5.1 risk score + level. The numeric score and exact English
 * care-level label render in the center via drei's `<Html>` portal.
 *
 * **Reduced-motion contract:** when `prefers-reduced-motion: reduce` is set,
 * skip the Canvas entirely and render a static colored disc + numeric badge
 * + trajectory arrow. NEVER returns null — the verdict screen always shows
 * something readable.
 *
 * **Plan 4.0 floor preserved:** when `redFlagFired === true`, the orb's
 * pulse caps faster + outline thickens + label appends "(Rule)" to make the
 * deterministic-rule provenance visible. The 9 red-flag rules retain
 * priority over any risk-score signal — the orb is a presentation layer,
 * not a decision layer.
 */
export function RiskOrb({
  score,
  level,
  trajectory,
  careLevel,
  redFlagFired = false,
  size = 220,
  className = '',
}: RiskOrbProps) {
  const reduced = useReduced();
  const { t } = useTranslation();
  const color = LEVEL_COLOR[level];
  const TrajIcon = TRAJECTORY_ICON[trajectory];

  const ariaLabel = interp(t('riskorb.aria') || '{careLevel} · risk score {score} of 100 · {trajectory}', {
    careLevel,
    score,
    trajectory: trajectory.replace(/_/g, ' '),
  });

  if (reduced) {
    return (
      <FallbackDisc
        score={score}
        level={level}
        trajectory={trajectory}
        careLevel={careLevel}
        redFlagFired={redFlagFired}
        ariaLabel={ariaLabel}
        TrajIcon={TrajIcon}
        className={className}
      />
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 3, 3]} intensity={0.9} />
        <directionalLight position={[-3, -2, -1]} intensity={0.3} />
        <OrbMesh score={score} color={color} redFlagFired={redFlagFired} />
        <Html center distanceFactor={6} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div className="flex flex-col items-center gap-1 text-center">
            <div
              className="font-bold tabular-nums text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]"
              style={{ fontSize: 36, lineHeight: 1, fontFamily: '"Sora", system-ui, sans-serif' }}
            >
              {score}
            </div>
            <div
              className="rounded-full border bg-slate-900/70 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur"
              style={{ borderColor: color }}
            >
              {careLevel}
              {redFlagFired ? ' (Rule)' : ''}
            </div>
          </div>
        </Html>
      </Canvas>

      {/* Trajectory chip pinned bottom-center */}
      <div
        className={`pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 border border-slate-700 px-2 py-0.5 text-[10px] backdrop-blur ${TRAJECTORY_TONE[trajectory]}`}
      >
        <TrajIcon className="h-3 w-3" aria-hidden />
        <span>{t(`risk.trajectory.${trajectory}`) || trajectory.replace(/_/g, ' ')}</span>
      </div>

      {/* Outline ring when a deterministic red-flag rule fired */}
      {redFlagFired && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: color, boxShadow: `0 0 24px ${color}55` }}
        />
      )}
    </div>
  );
}

interface OrbMeshProps {
  score: number;
  color: string;
  redFlagFired: boolean;
}

function OrbMesh({ score, color, redFlagFired }: OrbMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Distortion + pulse keyed to score per FRONTEND_BLUEPRINT §3.2.
  const distort = 0.1 + (score / 100) * 0.5;
  const speed = redFlagFired ? 3.5 : 0.3 + (score / 100) * 2.5;

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const pulse = Math.sin(t * speed) * 0.04;
    const base = 1.0;
    groupRef.current.scale.setScalar(base + pulse);
  });

  return (
    <group ref={groupRef}>
      <Sphere ref={meshRef} args={[1, 64, 64]}>
        <MeshDistortMaterial
          color={color}
          distort={distort}
          speed={speed}
          roughness={0.15}
          metalness={0.18}
          transparent
          opacity={0.92}
        />
      </Sphere>
      {/* Halo */}
      <Sphere args={[1.15, 32, 32]}>
        <meshBasicMaterial color={color} transparent opacity={0.07} />
      </Sphere>
    </group>
  );
}

interface FallbackDiscProps {
  score: number;
  level: RiskLevel;
  trajectory: RiskTrajectory;
  careLevel: CareLevel;
  redFlagFired: boolean;
  ariaLabel: string;
  TrajIcon: typeof TrendingUp;
  className: string;
}

/**
 * Reduced-motion fallback. Static colored disc with the score, care-level
 * badge, and trajectory arrow. Same a11y contract as the animated orb.
 */
function FallbackDisc({
  score,
  level,
  trajectory,
  careLevel,
  redFlagFired,
  ariaLabel,
  TrajIcon,
  className,
}: FallbackDiscProps) {
  const color = LEVEL_COLOR[level];
  const bg = LEVEL_BG[level];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={`relative inline-flex flex-col items-center gap-2 rounded-2xl border-2 p-5 ${bg} ${className}`}
    >
      <div
        className="flex h-32 w-32 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}22`, border: `2px solid ${color}` }}
      >
        <span
          className="font-bold tabular-nums text-white"
          style={{ fontSize: 36, fontFamily: '"Sora", system-ui, sans-serif' }}
        >
          {score}
        </span>
      </div>
      <div
        className="rounded-full border bg-slate-900/40 px-3 py-1 text-xs font-semibold text-white"
        style={{ borderColor: color }}
      >
        {careLevel}
        {redFlagFired ? ' (Rule)' : ''}
      </div>
      <div
        className={`inline-flex items-center gap-1 text-[10px] ${TRAJECTORY_TONE[trajectory]}`}
      >
        <TrajIcon className="h-3 w-3" aria-hidden />
        <span>{trajectory.replace(/_/g, ' ')}</span>
      </div>
    </div>
  );
}
