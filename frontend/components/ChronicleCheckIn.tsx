'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  getChronicle,
  recordCheckIn,
  shouldPromptToday,
  trajectoryFromChronicle,
  type ChronicleStatus,
  type SessionChronicle,
} from '@/lib/chronicle';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import type { StoredSession } from '@/lib/sessions';

interface ChronicleCheckInProps {
  /** The session being checked in on. Must have a verdict + risk to compute deltas. */
  session: StoredSession;
}

const STATUS_META: Record<
  ChronicleStatus,
  { Icon: typeof ArrowDown; tone: string; bg: string }
> = {
  better: {
    Icon: ArrowDown,
    tone: 'text-emerald-300',
    bg: 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20',
  },
  same: {
    Icon: ArrowRight,
    tone: 'text-slate-300',
    bg: 'border-slate-700 bg-slate-900/40 hover:bg-slate-800/60',
  },
  worse: {
    Icon: ArrowUp,
    tone: 'text-red-300',
    bg: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20',
  },
};

const TRAJECTORY_LABEL: Record<
  ReturnType<typeof trajectoryFromChronicle>,
  string
> = {
  rapidly_worsening: 'risk.trajectory.rapidly_worsening',
  worsening: 'risk.trajectory.worsening',
  stable: 'risk.trajectory.stable',
  improving: 'risk.trajectory.improving',
  insufficient_data: 'risk.trajectory.insufficient_data',
};

/**
 * Plan 7.x — Chronicle Mode daily check-in card. Renders inline on /history
 * for sessions inside the 7-day active window where today's check-in hasn't
 * landed yet. Three-button "Better / Same / Worse" capture; optional note;
 * appends a synthetic risk-score sample so the doctor cockpit picks up the
 * reported trajectory in real time.
 */
export function ChronicleCheckIn({ session }: ChronicleCheckInProps) {
  const { t } = useTranslation();
  const reduced = useReduced();
  const [chronicle, setChronicle] = useState<SessionChronicle>(() =>
    getChronicle(session.id),
  );
  const [showNote, setShowNote] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ChronicleStatus | null>(null);
  const [note, setNote] = useState('');
  const [justSubmitted, setJustSubmitted] = useState<ChronicleStatus | null>(null);

  useEffect(() => {
    setChronicle(getChronicle(session.id));
  }, [session.id]);

  if (!session.verdict) return null;
  if (!shouldPromptToday(session.startedAt, chronicle) && !justSubmitted) {
    // Show a compact summary instead of the prompt when already done today.
    if (chronicle.entries.length === 0) return null;
    return <ChronicleSummary chronicle={chronicle} />;
  }

  function handleQuickPick(status: ChronicleStatus) {
    setPendingStatus(status);
    setShowNote(true);
  }

  function handleSubmit() {
    if (!pendingStatus) return;
    const prev = session.verdict?.risk?.score ?? 30;
    const next = recordCheckIn(session.id, pendingStatus, prev, note.trim() || undefined);
    setChronicle(next);
    setJustSubmitted(pendingStatus);
    setPendingStatus(null);
    setNote('');
    setShowNote(false);
  }

  function handleSkipNote() {
    if (!pendingStatus) return;
    const prev = session.verdict?.risk?.score ?? 30;
    const next = recordCheckIn(session.id, pendingStatus, prev);
    setChronicle(next);
    setJustSubmitted(pendingStatus);
    setPendingStatus(null);
    setShowNote(false);
  }

  if (justSubmitted) {
    return (
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-xs text-emerald-200"
      >
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden />
        <span>
          {t('chronicle.thankYou')}{' '}
          <span className="text-emerald-100 font-medium">
            {t(`chronicle.status.${justSubmitted}`)}
          </span>
          .
        </span>
      </motion.div>
    );
  }

  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
      aria-labelledby={`chr-${session.id}-title`}
    >
      <header className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-emerald-400" aria-hidden />
        <h3
          id={`chr-${session.id}-title`}
          className="text-xs font-semibold uppercase tracking-wider text-emerald-300"
        >
          {t('chronicle.title')}
        </h3>
        <span className="ml-auto text-[10px] text-slate-500 inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {t('chronicle.daily')}
        </span>
      </header>

      <p className="text-sm text-slate-200 mb-3">{t('chronicle.prompt')}</p>

      {!showNote ? (
        <div className="grid grid-cols-3 gap-2">
          {(['better', 'same', 'worse'] as const).map((status) => {
            const { Icon, tone, bg } = STATUS_META[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleQuickPick(status)}
                className={`inline-flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition-colors ${bg} ${tone}`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{t(`chronicle.status.${status}`)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {t('chronicle.noteOptional')}{' '}
            <span className="text-slate-500">
              ({t(`chronicle.status.${pendingStatus!}`)})
            </span>
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={t('chronicle.notePlaceholder')}
            className="w-full resize-none rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleSkipNote}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600"
            >
              {t('chronicle.skipNote')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
            >
              {t('chronicle.save')}
            </button>
          </div>
        </div>
      )}

      {chronicle.entries.length > 0 && !showNote && (
        <div className="mt-3 pt-3 border-t border-emerald-500/20">
          <ChronicleSummary chronicle={chronicle} compact />
        </div>
      )}
    </motion.section>
  );
}

interface ChronicleSummaryProps {
  chronicle: SessionChronicle;
  compact?: boolean;
}

function ChronicleSummary({ chronicle, compact = false }: ChronicleSummaryProps) {
  const { t } = useTranslation();
  const trajectory = trajectoryFromChronicle(chronicle);
  const last = chronicle.entries[chronicle.entries.length - 1];

  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        compact ? '' : 'rounded-xl border border-slate-800 bg-slate-900/40 p-3'
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        <span>
          {chronicle.entries.length} {t('chronicle.checkInsCount')} ·{' '}
          <span className="text-slate-200">{t(TRAJECTORY_LABEL[trajectory])}</span>
        </span>
      </div>
      {last && (
        <span className="text-[10px] text-slate-500" suppressHydrationWarning>
          {new Date(last.ts).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
