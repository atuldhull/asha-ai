'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Globe2,
  Loader2,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CONSENT_SCOPES,
  type ConsentScope,
  fetchConsentPolicy,
  recordConsent,
} from '@/lib/consent';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { toast } from '@/lib/toast';

interface ConsentSheetProps {
  /** Called once consent is recorded successfully (server or local). */
  onAccepted: (granted: ConsentScope[]) => void;
  /** Called when the user declines / closes without accepting. App should
   *  treat this as "no triage_processing consent" and surface a non-blocking
   *  re-prompt later. */
  onDeclined?: () => void;
  /** Hide the close X — for the legally-required first-use prompt, the user
   *  can decline only via an explicit button, not a UI dismiss. */
  blocking?: boolean;
}

const SCOPE_META: Record<
  ConsentScope,
  { Icon: typeof Shield; required: boolean; titleKey: string; bodyKey: string }
> = {
  triage_processing: {
    Icon: Shield,
    required: true,
    titleKey: 'consent.scope.triage_processing.title',
    bodyKey: 'consent.scope.triage_processing.body',
  },
  session_history: {
    Icon: Database,
    required: false,
    titleKey: 'consent.scope.session_history.title',
    bodyKey: 'consent.scope.session_history.body',
  },
  longitudinal_memory: {
    Icon: Activity,
    required: false,
    titleKey: 'consent.scope.longitudinal_memory.title',
    bodyKey: 'consent.scope.longitudinal_memory.body',
  },
  abdm_health_locker: {
    Icon: CheckCircle2,
    required: false,
    titleKey: 'consent.scope.abdm_health_locker.title',
    bodyKey: 'consent.scope.abdm_health_locker.body',
  },
  analytics_aggregate: {
    Icon: Globe2,
    required: false,
    titleKey: 'consent.scope.analytics_aggregate.title',
    bodyKey: 'consent.scope.analytics_aggregate.body',
  },
  research_pseudonymized: {
    Icon: Sparkles,
    required: false,
    titleKey: 'consent.scope.research_pseudonymized.title',
    bodyKey: 'consent.scope.research_pseudonymized.body',
  },
};

/**
 * Plan 6.6 Phase B (frontend) — DPDP Act 2023 consent UI.
 *
 * Bottom-sheet modal that captures specific, informed, withdrawable consent
 * before any personal data is processed. Mirrors the 6 scopes on
 * `backend/app/models/consent.py::ConsentScope`. Defaults: triage_processing
 * pre-checked + locked (required to use the app); other scopes off.
 *
 * **Reduced-motion contract:** sheet appears without spring; close transition
 * is instant. No keyframe animations.
 */
export function ConsentSheet({ onAccepted, onDeclined, blocking = true }: ConsentSheetProps) {
  const { t, locale } = useTranslation();
  const reduced = useReduced();
  const [granted, setGranted] = useState<Set<ConsentScope>>(
    new Set<ConsentScope>(['triage_processing']),
  );
  const [showPolicy, setShowPolicy] = useState(false);
  const [policyMd, setPolicyMd] = useState<string | null>(null);
  const [legalStatus, setLegalStatus] = useState<'pending' | 'approved'>('pending');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchConsentPolicy(locale).then((p) => {
      if (cancelled) return;
      setPolicyMd(p.text_markdown);
      setLegalStatus(p.legal_review_status);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  function toggle(scope: ConsentScope) {
    if (SCOPE_META[scope].required) return; // locked on
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleAccept() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const out = await recordConsent(Array.from(granted), locale);
      if (out === null) {
        setErrorMsg(t('consent.error.networkBackup'));
        toast.warning(t('consent.error.networkBackup'));
      } else {
        toast.success(t('consent.toast.saved'), {
          description: `${granted.size} ${t('consent.toast.scopesGranted')}`,
        });
      }
      onAccepted(Array.from(granted));
    } catch {
      setErrorMsg(t('consent.error.unknown'));
      toast.error(t('consent.error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduced ? undefined : { opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm"
        aria-hidden
      />
      <motion.aside
        key="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('consent.title')}
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reduced ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-[#0f1421] shadow-2xl"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-700" />

        <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
              {t('consent.kicker')}
            </p>
            <h2 className="text-lg font-semibold text-slate-100">
              {t('consent.title')}
            </h2>
            <p className="mt-1 max-w-md text-xs text-slate-400 leading-relaxed">
              {t('consent.intro')}
            </p>
          </div>
          {!blocking && (
            <button
              type="button"
              onClick={onDeclined}
              aria-label={t('consent.closeAria')}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </header>

        {legalStatus === 'pending' && (
          <div className="mx-5 my-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
            {t('consent.legalPending')}
          </div>
        )}

        <ul className="space-y-2 px-5 pt-2 pb-4">
          {CONSENT_SCOPES.map((scope) => {
            const meta = SCOPE_META[scope];
            const on = granted.has(scope);
            return (
              <li key={scope}>
                <button
                  type="button"
                  onClick={() => toggle(scope)}
                  aria-pressed={on}
                  disabled={meta.required}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    on
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                  } ${meta.required ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      on ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                    aria-hidden
                  >
                    <meta.Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">
                        {t(meta.titleKey)}
                      </span>
                      {meta.required && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">
                          {t('consent.required')}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">
                      {t(meta.bodyKey)}
                    </span>
                  </span>
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${
                      on ? 'bg-emerald-500 text-slate-950' : 'border border-slate-600'
                    }`}
                    aria-hidden
                  >
                    {on && <CheckCircle2 className="h-4 w-4" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Policy expander */}
        <div className="px-5 pb-3">
          <button
            type="button"
            onClick={() => setShowPolicy((v) => !v)}
            aria-expanded={showPolicy}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            {showPolicy ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
            {t('consent.readFullPolicy')}
          </button>
          {showPolicy && (
            <pre className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap font-sans">
              {policyMd ?? t('common.loading')}
            </pre>
          )}
        </div>

        {errorMsg && (
          <p className="mx-5 mb-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
            {errorMsg}
          </p>
        )}

        <footer className="sticky bottom-0 border-t border-slate-800 bg-[#0f1421]/95 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {t('consent.disclaimer')}
            </p>
            <div className="flex gap-2">
              {onDeclined && (
                <button
                  type="button"
                  onClick={onDeclined}
                  disabled={submitting}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
                >
                  {t('consent.decline')}
                </button>
              )}
              <button
                type="button"
                onClick={handleAccept}
                disabled={submitting || granted.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t('consent.acceptAria')}
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                )}
                {t('consent.accept')}
              </button>
            </div>
          </div>
        </footer>
      </motion.aside>
    </AnimatePresence>
  );
}
