'use client';

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity } from 'lucide-react';
import type { RiskAssessment, RiskHistoryPoint, RiskLevel, RiskTrajectory } from '@/lib/types';

interface Props {
  risk: RiskAssessment;
  /** Last 24h of scores. If empty, only the current point is plotted. */
  history?: RiskHistoryPoint[];
  className?: string;
}

const LEVEL_STYLES: Record<RiskLevel, { color: string; bg: string; border: string; ring: string }> = {
  CRITICAL: {
    color: 'text-red-300',
    bg: 'bg-red-500/10',
    border: 'border-red-500/40',
    ring: 'ring-red-500/30',
  },
  HIGH: {
    color: 'text-orange-300',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/40',
    ring: 'ring-orange-500/30',
  },
  MODERATE: {
    color: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    ring: 'ring-amber-500/30',
  },
  LOW: {
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    ring: 'ring-emerald-500/30',
  },
};

const TRAJECTORY_LABEL: Record<RiskTrajectory, { text: string; Icon: typeof TrendingUp; tone: string }> = {
  rapidly_worsening: { text: 'Rapidly worsening', Icon: TrendingUp, tone: 'text-red-300' },
  worsening: { text: 'Worsening', Icon: TrendingUp, tone: 'text-orange-300' },
  stable: { text: 'Stable', Icon: Minus, tone: 'text-slate-300' },
  improving: { text: 'Improving', Icon: TrendingDown, tone: 'text-emerald-300' },
  insufficient_data: { text: 'New patient', Icon: Activity, tone: 'text-slate-400' },
};

export function RiskTrajectoryCard({ risk, history = [], className = '' }: Props) {
  const reduce = useReducedMotion();
  const style = LEVEL_STYLES[risk.level];
  const traj = TRAJECTORY_LABEL[risk.trajectory];
  const TrajIcon = traj.Icon;

  // Always include the current score as the latest point so the sparkline
  // looks alive even on a freshly-triaged session.
  const points = useMemo(() => {
    const base = history.length > 0 ? history.slice(-24) : [];
    const latest = { ts: risk.computed_at ?? new Date().toISOString(), score: risk.score };
    if (base.length === 0 || base[base.length - 1].score !== risk.score) {
      base.push(latest);
    }
    return base;
  }, [history, risk.score, risk.computed_at]);

  return (
    <section
      role="status"
      aria-label={`Risk score ${risk.score} out of 100, ${risk.level}`}
      className={`rounded-xl border-2 ${style.border} ${style.bg} p-4 sm:p-5 ${className}`}
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900/40 ring-1 ${style.ring}`}>
            <AlertTriangle className={`h-4 w-4 ${style.color}`} aria-hidden />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
              Dynamic risk score
            </div>
            <div className={`text-sm font-semibold ${style.color}`}>{risk.level}</div>
          </div>
        </div>
        <ScoreBadge score={risk.score} colorClass={style.color} reduce={!!reduce} />
      </header>

      <Sparkline points={points} colorClass={style.color} reduce={!!reduce} />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-1.5 text-xs ${traj.tone}`}>
          <TrajIcon className="h-3.5 w-3.5" aria-hidden />
          <span>{traj.text}</span>
        </div>
        <ComponentsPills risk={risk} />
      </div>

      <p className="mt-3 text-sm text-slate-200 leading-relaxed">{risk.action}</p>
    </section>
  );
}

function ScoreBadge({ score, colorClass, reduce }: { score: number; colorClass: string; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="text-right"
    >
      <div className={`text-3xl font-bold tabular-nums leading-none ${colorClass}`}>{score}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">/ 100</div>
    </motion.div>
  );
}

function Sparkline({
  points,
  colorClass,
  reduce,
}: {
  points: RiskHistoryPoint[];
  colorClass: string;
  reduce: boolean;
}) {
  const W = 280;
  const H = 56;
  const pad = 4;

  const { path, area, dotX, dotY } = useMemo(() => {
    if (points.length === 0) return { path: '', area: '', dotX: 0, dotY: H / 2 };
    const max = 100;
    const min = 0;
    const xs = points.map((_, i) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2));
    const ys = points.map(
      (p) => H - pad - ((p.score - min) / (max - min)) * (H - pad * 2),
    );
    let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 1; i < xs.length; i++) {
      d += ` L ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`;
    }
    const a = `${d} L ${xs[xs.length - 1].toFixed(2)} ${H - pad} L ${xs[0].toFixed(2)} ${H - pad} Z`;
    return { path: d, area: a, dotX: xs[xs.length - 1], dotY: ys[ys.length - 1] };
  }, [points]);

  const stroke = colorToHex(colorClass);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-14"
        role="img"
        aria-label="Risk score over the last 24 hours"
      >
        <defs>
          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* dashed thresholds at 30/50/70 so a clinician can read severity at a glance */}
        {[30, 50, 70].map((t) => (
          <line
            key={t}
            x1={pad}
            x2={W - pad}
            y1={H - pad - (t / 100) * (H - pad * 2)}
            y2={H - pad - (t / 100) * (H - pad * 2)}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeDasharray="3 4"
            className="text-slate-400"
          />
        ))}
        {area && <path d={area} fill="url(#riskFill)" />}
        {path && (
          <motion.path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
        {points.length > 0 && (
          <circle cx={dotX} cy={dotY} r="3" fill={stroke} />
        )}
      </svg>
    </div>
  );
}

function ComponentsPills({ risk }: { risk: RiskAssessment }) {
  const c = risk.components;
  const parts: Array<{ label: string; value: string }> = [
    { label: 'sx', value: String(c.symptoms) },
    { label: 'age×', value: c.age_factor.toFixed(1) },
    { label: 'comorb', value: String(c.comorbidities) },
  ];
  if (typeof c.vitals === 'number' && c.vitals > 0) {
    parts.push({ label: 'vitals', value: String(c.vitals) });
  }
  return (
    <div className="flex items-center gap-1.5">
      {parts.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-900/40 px-1.5 py-0.5 text-[10px] text-slate-300"
          title={`Risk component: ${p.label}`}
        >
          <span className="text-slate-500">{p.label}</span>
          <span className="tabular-nums">{p.value}</span>
        </span>
      ))}
    </div>
  );
}

/** Map the Tailwind color class on the level to a literal hex for SVG stroke. */
function colorToHex(twClass: string): string {
  if (twClass.includes('red')) return '#fca5a5';
  if (twClass.includes('orange')) return '#fdba74';
  if (twClass.includes('amber')) return '#fcd34d';
  if (twClass.includes('emerald')) return '#6ee7b7';
  return '#cbd5e1';
}
