'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Stethoscope,
  Siren,
  Home,
  Clock,
  CheckCircle2,
  RefreshCw,
  ShieldOff,
  Radio,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { DifferentialPanel } from '@/components/DifferentialPanel';
import { RiskTrajectoryCard } from '@/components/RiskTrajectoryCard';
import { useUser } from '@/lib/auth';
import {
  listAllSessionsForDoctor,
  markReviewed,
  type StoredSession,
} from '@/lib/sessions';
import type { CareLevel, RiskLevel } from '@/lib/types';
import { subscribeToNewVerdicts } from '@/lib/realtime';
import { seedDoctorDemo, clearDoctorDemo } from '@/lib/demo-seed';
import { formatDistanceToNow } from 'date-fns';

export default function DoctorDashboardPage() {
  // useSearchParams() requires a Suspense boundary in production builds,
  // matching the pattern used in /sign-in (where the seeder is invoked via
  // ?seed=demo on the cockpit URL).
  return (
    <Suspense fallback={
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
      </>
    }>
      <DoctorDashboardInner />
    </Suspense>
  );
}

function DoctorDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useUser();
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [liveBadgeId, setLiveBadgeId] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const chimeRef = useRef<HTMLAudioElement | null>(null);

  // Preload an audio chime for ER cases (silent ping built from a tiny WAV data URL).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 0.15s 880Hz sine — generated inline so we don't need a separate asset
    chimeRef.current = new Audio(
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
    );
    chimeRef.current.volume = 0.4;
  }, []);

  // Plan 5.1 demo seeder — `?seed=demo` populates 6 synthetic sessions
  // covering all care levels, risk tiers, and trajectory states. Idempotent;
  // re-runs replace the same rows by id. `?seed=clear` removes them.
  useEffect(() => {
    const seed = searchParams?.get('seed');
    if (seed === 'demo') seedDoctorDemo({ force: true });
    else if (seed === 'clear') clearDoctorDemo();
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/sign-in?next=/doctor/dashboard');
      return;
    }
    function refresh() {
      setSessions(listAllSessionsForDoctor({ includeReviewed }));
    }
    refresh();
    // Plan 3.0 realtime — Supabase Realtime when configured, BroadcastChannel otherwise
    const unsubscribe = subscribeToNewVerdicts((newSession) => {
      refresh();
      setLiveBadgeId(newSession.id);
      setTimeout(() => setLiveBadgeId(null), 1800);
      // Audio cue on ER cases (respect reduced-motion preference for silence too)
      if (newSession.verdict?.level === 'Emergency Room' && !reduce) {
        chimeRef.current?.play().catch(() => {
          /* autoplay may be blocked; that's fine */
        });
      }
    });
    // Polling kept as a 60s safety net in case realtime drops
    const interval = setInterval(refresh, 60_000);
    // Catch local-storage writes (seeder, /triage submissions) so the queue
    // updates instantly without waiting for the 60s poll.
    window.addEventListener('asha-ai:sessions-change', refresh);
    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('asha-ai:sessions-change', refresh);
    };
  }, [user, authLoading, includeReviewed, refreshTick, reduce]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  if (authLoading) {
    return (
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
      </>
    );
  }

  if (user && user.role !== 'doctor') {
    return <DoctorAccessDenied />;
  }

  const counts = countsByLevel(sessions);

  return (
    <>
      <Navbar />
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-800 bg-[#111728] px-4 sm:px-6 py-4">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Stethoscope className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  Doctor cockpit
                  <span
                    className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                    title="Realtime subscription is active"
                  >
                    <Radio className="h-3 w-3 animate-pulse" aria-hidden /> live
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  {sessions.length} {includeReviewed ? 'total' : 'pending'} case
                  {sessions.length === 1 ? '' : 's'} · ER:{counts.er} · Clinic:{counts.clinic} ·
                  Home:{counts.home}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeReviewed}
                  onChange={(e) => setIncludeReviewed(e.target.checked)}
                  className="accent-emerald-500"
                />
                Show reviewed
              </label>
              <button
                onClick={() => setRefreshTick((t) => t + 1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors"
                aria-label="Refresh queue"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-[420px_1fr] gap-0 md:gap-4 p-2 sm:p-4">
          {/* Queue */}
          <aside className="rounded-xl border border-slate-800 bg-[#111728] overflow-hidden">
            {sessions.length === 0 ? (
              <DoctorEmpty />
            ) : (
              <ul className="divide-y divide-slate-800 max-h-[calc(100vh-240px)] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {sessions.map((s, i) => (
                    <motion.li
                      key={s.id}
                      initial={reduce ? false : { opacity: 0, height: 0, y: -4 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, x: 8 }}
                      transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 8) * 0.02 }}
                    >
                      <QueueRow
                        session={s}
                        active={s.id === selectedId}
                        live={s.id === liveBadgeId}
                        onClick={() => setSelectedId(s.id)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </aside>

          {/* Detail */}
          <main className="rounded-xl border border-slate-800 bg-[#111728] overflow-y-auto max-h-[calc(100vh-240px)]">
            {selected ? (
              <DetailPane session={selected} />
            ) : (
              <DetailEmpty />
            )}
          </main>
        </div>
      </div>
    </>
  );
}

function QueueRow({
  session,
  active,
  live,
  onClick,
}: {
  session: StoredSession;
  active: boolean;
  live?: boolean;
  onClick: () => void;
}) {
  const v = session.verdict;
  const meta = v ? VERDICT_STYLES[v.level] : null;
  const Icon = meta?.Icon ?? Home;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 transition-colors flex gap-3 items-start ${
        active
          ? 'bg-emerald-500/10 border-l-2 border-emerald-400'
          : live
            ? 'bg-emerald-500/5 border-l-2 border-emerald-500/50'
            : 'hover:bg-[#141b30] border-l-2 border-transparent'
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
          meta?.bg ?? 'bg-slate-800'
        } border border-slate-700 ${
          v?.level === 'Emergency Room' ? 'animate-pulse' : ''
        }`}
        aria-hidden
      >
        <Icon className={`h-4 w-4 ${meta?.color ?? 'text-slate-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-semibold ${meta?.color ?? 'text-slate-400'}`}>
            {v?.level ?? 'In progress'}
          </span>
          {v?.risk && <RiskPill level={v.risk.level} score={v.risk.score} />}
          {session.inputMode && session.inputMode !== 'text' && (
            <InputModeChip mode={session.inputMode} />
          )}
          {session.reviewedAt && (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-label="Reviewed" />
          )}
        </div>
        <div className="text-xs text-slate-400 truncate">P-{session.id.slice(-6)}</div>
        <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
          <Clock className="h-3 w-3" aria-hidden />
          <span suppressHydrationWarning>
            {formatDistanceToNow(session.startedAt, { addSuffix: true })}
          </span>
        </div>
      </div>
    </button>
  );
}

function RiskPill({ level, score }: { level: RiskLevel; score: number }) {
  const tone = RISK_PILL_TONE[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium tabular-nums ${tone}`}
      title={`Dynamic risk score: ${score}/100 (${level})`}
    >
      <span className="opacity-70">risk</span>
      {score}
    </span>
  );
}

/**
 * Plan 6.1 — surfaces how the patient input arrived (3D body tap vs voice
 * vs chat). Helps the doctor weight the structured-symptom signal: a
 * `body_map_3d` session has FMA-anchored regions in the LLM context, while
 * a `text` session is free text.
 */
function InputModeChip({ mode }: { mode: 'voice' | 'body_map' | 'body_map_3d' }) {
  const META: Record<typeof mode, { label: string; title: string; tone: string }> = {
    voice: {
      label: '🎤 voice',
      title: 'Patient submitted via voice (Bhashini ASR)',
      tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    },
    body_map: {
      label: 'body',
      title: 'Patient submitted via 2D body map',
      tone: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
    },
    body_map_3d: {
      label: '3D body',
      title: 'Patient submitted via 3D body map (FMA-coded regions)',
      tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    },
  };
  const meta = META[mode];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium ${meta.tone}`}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

const RISK_PILL_TONE: Record<RiskLevel, string> = {
  CRITICAL: 'bg-red-500/15 border-red-500/40 text-red-300',
  HIGH: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
  MODERATE: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  LOW: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
};

function DetailPane({ session }: { session: StoredSession }) {
  const v = session.verdict;
  const meta = v ? VERDICT_STYLES[v.level] : null;

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Case</div>
          <h2 className="text-xl font-semibold">P-{session.id.slice(-6)}</h2>
          <p className="text-xs text-slate-400 mt-1" suppressHydrationWarning>
            Triaged {formatDistanceToNow(session.startedAt, { addSuffix: true })}
          </p>
        </div>
        {!session.reviewedAt && session.verdict && (
          <button
            onClick={() => markReviewed(session.id)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Mark reviewed
          </button>
        )}
        {session.reviewedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Reviewed
          </span>
        )}
      </div>

      {v && meta && (
        <div
          className={`rounded-xl border-2 p-4 mb-6 ${meta.bgPanel} ${meta.borderPanel}`}
          role="status"
        >
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-sm font-semibold ${meta.color}`}>{v.level}</span>
            {v.risk_escalated && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                title="Dynamic risk score escalated this verdict to a higher care level. Risk can only escalate, never downgrade."
              >
                ↑ escalated by risk
              </span>
            )}
            {v.red_flags && v.red_flags.length > 0 && (
              <span className="text-xs text-slate-400">
                · {v.red_flags.map((rf) => (typeof rf === 'string' ? rf : rf.rule_name)).join(', ')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{v.reasoning}</p>
        </div>
      )}

      {v?.risk && (
        <div className="mb-6">
          <RiskTrajectoryCard risk={v.risk} history={session.riskHistory ?? []} />
        </div>
      )}

      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
        Differential diagnosis
      </h3>
      <DifferentialPanel differential={v?.differential ?? null} />

      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mt-6 mb-3">
        Conversation
      </h3>
      {session.messages.length === 0 ? (
        <p className="text-sm text-slate-500">No messages.</p>
      ) : (
        <ul className="space-y-2">
          {session.messages.map((m) => (
            <li
              key={m.id}
              className={
                m.role === 'user'
                  ? 'rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm'
                  : 'rounded-lg bg-[#0a0e1a] border border-slate-800 px-3 py-2 text-sm text-slate-300'
              }
            >
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                {m.role === 'user' ? 'Patient' : 'ASHA-AI'}
              </div>
              {m.content}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500">
        <Link
          href={`/result/${session.id}`}
          className="text-emerald-400 hover:text-emerald-300"
        >
          Open in patient view →
        </Link>
      </div>
    </div>
  );
}

function DoctorEmpty() {
  return (
    <div className="px-4 py-12 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400 mb-3">
        <Stethoscope className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-base font-semibold mb-1">No active cases</h2>
      <p className="text-sm text-slate-400">
        Patient triages will appear here in real time (Plan 3.0).
      </p>
    </div>
  );
}

function DetailEmpty() {
  return (
    <div className="h-full flex items-center justify-center px-6 py-12 text-center text-slate-500">
      <div>
        <Stethoscope className="h-8 w-8 mx-auto mb-2 text-slate-600" aria-hidden />
        <p className="text-sm">Select a case from the queue</p>
      </div>
    </div>
  );
}

function DoctorAccessDenied() {
  return (
    <>
      <Navbar />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-sm text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 mb-4">
            <ShieldOff className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold mb-2">Doctor access only</h1>
          <p className="text-sm text-slate-400 mb-6">
            This area is restricted to clinicians. If you&apos;re a doctor, sign in with your
            registered phone number.
          </p>
          <Link
            href="/triage"
            className="inline-flex items-center justify-center px-5 h-11 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-400 transition-colors"
          >
            Back to triage
          </Link>
        </div>
      </div>
    </>
  );
}

function countsByLevel(sessions: StoredSession[]) {
  let er = 0,
    clinic = 0,
    home = 0;
  for (const s of sessions) {
    if (!s.verdict) continue;
    if (s.verdict.level === 'Emergency Room') er++;
    else if (s.verdict.level === 'Clinic Visit') clinic++;
    else home++;
  }
  return { er, clinic, home };
}

const VERDICT_STYLES: Record<
  CareLevel,
  {
    Icon: typeof Home;
    color: string;
    bg: string;
    bgPanel: string;
    borderPanel: string;
  }
> = {
  'Home Care': {
    Icon: Home,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    bgPanel: 'bg-emerald-500/5',
    borderPanel: 'border-emerald-500/30',
  },
  'Clinic Visit': {
    Icon: Stethoscope,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    bgPanel: 'bg-amber-500/5',
    borderPanel: 'border-amber-500/30',
  },
  'Emergency Room': {
    Icon: Siren,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    bgPanel: 'bg-red-500/5',
    borderPanel: 'border-red-500/30',
  },
};
