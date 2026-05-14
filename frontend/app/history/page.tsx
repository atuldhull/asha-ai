'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { History, Home, Stethoscope, Siren, ChevronRight, MessageSquare } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useUser } from '@/lib/auth';
import { listSessionsForUser, previewText, type StoredSession } from '@/lib/sessions';
import type { CareLevel } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/sign-in?next=/history');
      return;
    }
    function refresh() {
      if (!user) return;
      setSessions(listSessionsForUser(user.id));
      setLoading(false);
    }
    refresh();
    window.addEventListener('asha-ai:sessions-change', refresh);
    return () => window.removeEventListener('asha-ai:sessions-change', refresh);
  }, [user, authLoading, router]);

  return (
    <>
      <Navbar />
      <div className="flex-1 px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3">
              <History className="h-5 w-5" aria-hidden />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Your triage history</h1>
            <p className="text-sm text-slate-400 mt-1">
              Sessions you ran on ASHA-AI. Stored locally on this device (Plan 2.0 fallback).
            </p>
          </header>

          {loading || authLoading ? (
            <SkeletonList />
          ) : sessions.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3" aria-label="Triage sessions">
              {sessions.map((s, i) => (
                <motion.li
                  key={s.id}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.03 }}
                >
                  <SessionRow session={s} />
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function SessionRow({ session }: { session: StoredSession }) {
  const verdict = session.verdict;
  const verdictMeta = verdict
    ? VERDICT_STYLES[verdict.level]
    : { Icon: MessageSquare, color: 'text-slate-400', label: 'In progress', bg: 'bg-slate-800' };
  const { Icon } = verdictMeta;

  return (
    <Link
      href={`/result/${session.id}`}
      className="block rounded-xl border border-slate-800 bg-[#111728] p-4 hover:border-slate-700 hover:bg-[#141b30] transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${verdictMeta.bg} border border-slate-700`}
          aria-hidden
        >
          <Icon className={`h-5 w-5 ${verdictMeta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-sm font-semibold ${verdictMeta.color}`}>{verdictMeta.label}</span>
            <span className="text-xs text-slate-500" suppressHydrationWarning>
              · {formatDistanceToNow(session.startedAt, { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-slate-300 truncate">{previewText(session)}</p>
        </div>
        <ChevronRight
          className="h-5 w-5 text-slate-600 group-hover:text-slate-400 mt-2 flex-shrink-0"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-3" aria-label="Loading history">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="rounded-xl border border-slate-800 bg-[#111728] p-4 animate-pulse"
        >
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-slate-800" />
              <div className="h-3 w-full rounded bg-slate-800" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-[#111728]/40 p-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400 mb-4">
        <MessageSquare className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold mb-1">No sessions yet</h2>
      <p className="text-sm text-slate-400 mb-6">Start your first triage to see it appear here.</p>
      <Link
        href="/triage"
        className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-400 transition-colors"
      >
        Start triage
      </Link>
    </div>
  );
}

const VERDICT_STYLES: Record<
  CareLevel,
  { Icon: typeof Home; color: string; label: string; bg: string }
> = {
  'Home Care': { Icon: Home, color: 'text-emerald-400', label: 'Home Care', bg: 'bg-emerald-500/10' },
  'Clinic Visit': {
    Icon: Stethoscope,
    color: 'text-amber-400',
    label: 'Clinic Visit',
    bg: 'bg-amber-500/10',
  },
  'Emergency Room': {
    Icon: Siren,
    color: 'text-red-400',
    label: 'Emergency Room',
    bg: 'bg-red-500/10',
  },
};
