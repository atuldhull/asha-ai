'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MessageSquare } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { VerdictCard } from '@/components/VerdictCard';
import { useUser } from '@/lib/auth';
import { getSession, type StoredSession } from '@/lib/sessions';
import { formatDistanceToNow } from 'date-fns';

export default function ResultPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const { user, loading: authLoading } = useUser();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/sign-in?next=/result/${params.sessionId}`);
      return;
    }
    const s = getSession(params.sessionId);
    if (!s) {
      setNotFound(true);
    } else if (s.userId !== user.id && user.role !== 'doctor') {
      // Owner or doctor only
      setNotFound(true);
    } else {
      setSession(s);
    }
    setLoading(false);
  }, [user, authLoading, params.sessionId, router]);

  return (
    <>
      <Navbar />
      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href={user?.role === 'doctor' ? '/doctor/dashboard' : '/history'}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-6"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>

          {loading || authLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-[#111728] p-8 animate-pulse">
              <div className="h-6 w-40 bg-slate-800 rounded mb-4" />
              <div className="h-32 bg-slate-800 rounded" />
            </div>
          ) : notFound ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
              <h2 className="text-lg font-semibold text-red-300 mb-2">Session not found</h2>
              <p className="text-sm text-slate-400 mb-6">
                This session doesn&apos;t exist, or you don&apos;t have access to it.
              </p>
              <Link
                href="/history"
                className="inline-flex items-center justify-center px-5 h-11 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-400 transition-colors"
              >
                Back to history
              </Link>
            </div>
          ) : session ? (
            <ResultContent session={session} />
          ) : null}
        </div>
      </div>
    </>
  );
}

function ResultContent({ session }: { session: StoredSession }) {
  return (
    <article>
      <header className="mb-6">
        <div className="flex items-center gap-3 text-sm text-slate-400 mb-2">
          <Clock className="h-4 w-4" aria-hidden />
          <span suppressHydrationWarning>
            {formatDistanceToNow(session.startedAt, { addSuffix: true })}
          </span>
          <span className="text-slate-600">·</span>
          <span>
            {session.messages.length} message{session.messages.length === 1 ? '' : 's'}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Triage result</h1>
      </header>

      {session.verdict && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-6"
        >
          <VerdictCard verdict={session.verdict} />
        </motion.div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-[#111728] p-4 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" aria-hidden />
          Conversation
        </h2>
        {session.messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages in this session.</p>
        ) : (
          <ul className="space-y-3">
            {session.messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-slate-100'
                    : 'rounded-xl bg-[#0a0e1a] border border-slate-800 px-4 py-3 text-sm text-slate-300'
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
      </section>
    </article>
  );
}
