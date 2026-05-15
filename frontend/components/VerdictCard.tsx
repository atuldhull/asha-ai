'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Home,
  Stethoscope,
  Siren,
  BookOpen,
  ChevronDown,
  Sparkles,
  Pill,
  ListChecks,
  AlertTriangle,
  Activity,
  Volume2,
  Pause,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { CareLevel, TriageResponse } from '@/lib/types';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { playVerdictCue } from '@/lib/audio';
import { speak, stopSpeaking, isSpeechSupported } from '@/lib/speech';
import { canSimplify, toPlainEnglish } from '@/lib/plain-diagnosis';
import { RiskTrajectoryCard } from './RiskTrajectoryCard';
import { VerdictActions } from './VerdictActions';

// Plan 6.2 — RiskOrb is lazily loaded so the R3F + drei bundle (~225 KB)
// doesn't ship to chat-only routes. Loaded only when a verdict's `risk`
// field is present, which means the user has gone through the triage flow.
// SSR is off because R3F requires browser-only WebGL APIs.
const RiskOrb = dynamic(
  () => import('./3d/RiskOrb').then((m) => ({ default: m.RiskOrb })),
  { ssr: false, loading: () => null },
);

interface VerdictCardProps {
  verdict: TriageResponse;
  /** Auto-read the verdict aloud on mount (live triage flows only — off in
   *  chat history / replay so browsing doesn't trigger speech). */
  autoSpeak?: boolean;
}

const config: Record<
  CareLevel,
  {
    icon: typeof Home;
    bg: string;
    border: string;
    text: string;
    badge: string;
    label: string;
    nextStep: string;
  }
> = {
  'Home Care': {
    icon: Home,
    bg: 'bg-care-home-bg',
    border: 'border-care-home-border',
    text: 'text-care-home',
    badge: 'bg-care-home text-white',
    label: '✓ Home Care',
    nextStep: 'Rest, hydrate, and monitor symptoms. Contact a doctor if symptoms worsen or persist beyond 48 hours.',
  },
  'Clinic Visit': {
    icon: Stethoscope,
    bg: 'bg-care-clinic-bg',
    border: 'border-care-clinic-border',
    text: 'text-care-clinic',
    badge: 'bg-care-clinic text-white',
    label: '⚠ Clinic Visit',
    nextStep: 'Book a doctor\'s appointment within 24-48 hours. If symptoms suddenly worsen, escalate to ER.',
  },
  'Emergency Room': {
    icon: Siren,
    bg: 'bg-care-emergency-bg',
    border: 'border-care-emergency-border',
    text: 'text-care-emergency',
    badge: 'bg-care-emergency text-white',
    label: '🚨 Emergency Room — GO NOW',
    nextStep: 'Seek immediate medical attention. In India, call 108 for an ambulance.',
  },
};

const SUBTITLE_KEY: Record<CareLevel, string> = {
  'Home Care': 'verdict.homeCare.subtitle',
  'Clinic Visit': 'verdict.clinicVisit.subtitle',
  'Emergency Room': 'verdict.emergencyRoom.subtitle',
};

export function VerdictCard({ verdict, autoSpeak = false }: VerdictCardProps) {
  const c = config[verdict.level];
  const Icon = c.icon;
  const isEmergency = verdict.level === 'Emergency Room';
  const reduce = useReducedMotion();
  const { t, locale } = useTranslation();
  const [showSources, setShowSources] = useState(false);
  const [plainMode, setPlainMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const speechAvailable = isSpeechSupported();
  const speechLang: 'en' | 'hi' | 'kn' =
    locale === 'hi' || locale === 'kn' ? locale : 'en';

  const subtitle = locale !== 'en' ? t(SUBTITLE_KEY[verdict.level]) : null;

  // Plan 7.x — Plain Diagnosis layer (frontend-first). Substitutes ~70 medical
  // jargon terms with plain English. Disabled when the reasoning isn't English
  // (Devanagari / Kannada detected). Never touches care-level strings, "108",
  // ICD/FMA codes, or the disclaimer.
  const simplifyAvailable = canSimplify(verdict.reasoning);
  const displayReasoning = useMemo(
    () => (plainMode && simplifyAvailable ? toPlainEnglish(verdict.reasoning) : verdict.reasoning),
    [plainMode, simplifyAvailable, verdict.reasoning],
  );

  // What gets read aloud: localized lead-in (or the exact care level) + the
  // reasoning the user is seeing. Plain-language mode flows through too.
  const speechText = useMemo(
    () => `${subtitle ?? verdict.level}. ${displayReasoning}`,
    [subtitle, verdict.level, displayReasoning],
  );

  // Plan 4.0 — fire audio cue + haptic on first mount of a verdict.
  // Honors user's mute preference + prefers-reduced-motion (handled inside playVerdictCue).
  useEffect(() => {
    playVerdictCue(verdict.level);
    // Re-fire only when the level itself changes (not on every re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict.level]);

  const toggleSpeak = useCallback(() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    // Explicit tap → `force` so it works even if the user muted the cues.
    speak(speechText, {
      lang: speechLang,
      force: true,
      onstart: () => setSpeaking(true),
      onend: () => setSpeaking(false),
    });
  }, [speaking, speechText, speechLang]);

  // Auto-read fresh verdicts (live triage only). Honors the global mute
  // preference (non-forced). Waits for the ~1s verdict cue to finish first.
  useEffect(() => {
    if (!autoSpeak || !speechAvailable) return;
    const id = window.setTimeout(() => {
      speak(speechText, {
        lang: speechLang,
        onstart: () => setSpeaking(true),
        onend: () => setSpeaking(false),
      });
    }, 950);
    return () => {
      window.clearTimeout(id);
      stopSpeaking();
      setSpeaking(false);
    };
    // Re-read only when the verdict identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict.level, autoSpeak, speechAvailable]);

  // Stop any speech if the card unmounts (navigation mid-utterance).
  useEffect(() => () => stopSpeaking(), []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1], // snappy cubic-bezier
      }}
      className={cn(
        'rounded-2xl border-2 p-5 sm:p-6 shadow-sm',
        c.bg,
        c.border,
        isEmergency && !reduce && 'animate-pulse-slow'
      )}
      role={isEmergency ? 'alert' : 'status'}
      aria-live={isEmergency ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full',
            c.badge
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
                c.badge
              )}
            >
              {verdict.level}
            </span>
            {verdict.esi != null && (
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5">
                ESI {verdict.esi}
              </span>
            )}
            {verdict.confidence != null && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400"
                title={`Model confidence ${Math.round(verdict.confidence * 100)}%`}
              >
                {Math.round(verdict.confidence * 100)}% conf.
              </span>
            )}
            {isEmergency && (
              <span className="text-xs font-bold uppercase tracking-wider text-care-emergency">
                Time-critical
              </span>
            )}
            {verdict.risk_escalated && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                title="Risk score escalated this verdict to a higher care level. The reverse never happens — risk can only escalate, never downgrade."
              >
                ↑ escalated by risk
              </span>
            )}
          </div>

          <h3 className={cn('mt-3 text-lg font-bold', c.text)}>{c.label}</h3>
          {subtitle && (
            <p className={cn('text-sm font-medium', c.text)} aria-hidden>
              {subtitle}
            </p>
          )}

          <div className="mt-2 flex items-start gap-2">
            <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {displayReasoning}
            </p>
            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              {speechAvailable && (
                <button
                  type="button"
                  onClick={toggleSpeak}
                  aria-pressed={speaking}
                  aria-label={speaking ? t('verdict.stop') : t('verdict.listen')}
                  title={speaking ? t('verdict.stop') : t('verdict.listen')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    speaking
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  {speaking ? (
                    <Pause className="h-3 w-3" aria-hidden />
                  ) : (
                    <Volume2 className="h-3 w-3" aria-hidden />
                  )}
                  <span>{speaking ? t('verdict.stop') : t('verdict.listen')}</span>
                </button>
              )}
              {simplifyAvailable && (
                <button
                  type="button"
                  onClick={() => setPlainMode((v) => !v)}
                  aria-pressed={plainMode}
                  title={plainMode ? t('plainDiagnosis.toggleOff') : t('plainDiagnosis.toggleOn')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    plainMode
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                      : 'border-slate-600 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                  )}
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  <span>{plainMode ? t('plainDiagnosis.on') : t('plainDiagnosis.off')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-white/70 dark:bg-slate-900/40 p-3 border border-slate-200/60 dark:border-slate-700/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Next step
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {c.nextStep}
            </p>
            {/* Plan 6.6 Phase H (frontend-only first pass) — quick actions:
                Find nearest clinic via Google Maps deep link · share verdict
                via WhatsApp / native share. No API keys needed. */}
            <VerdictActions verdict={verdict} />
          </div>

          {verdict.condition && (
            <div className="mt-4 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 p-4">
              <div className="flex items-start gap-2">
                <Activity className="mt-0.5 h-4 w-4 flex-shrink-0 text-care-clinic" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Likely condition &amp; care
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {verdict.condition.name}
                    {verdict.condition.aka && (
                      <span className="ml-1.5 text-xs font-normal italic text-slate-500 dark:text-slate-400">
                        ({verdict.condition.aka})
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {verdict.condition.summary}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Stethoscope className="h-3.5 w-3.5" aria-hidden />
                    Typical symptoms
                  </p>
                  <ul className="mt-1.5 ml-4 list-disc space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {verdict.condition.symptoms.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden />
                    What to do
                  </p>
                  <ul className="mt-1.5 ml-4 list-disc space-y-1 text-xs text-slate-700 dark:text-slate-200">
                    {verdict.condition.self_care.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {verdict.condition.otc && verdict.condition.otc.length > 0 && (
                <div className="mt-3 flex items-start gap-1.5 rounded-md bg-slate-100/70 dark:bg-slate-800/40 px-3 py-2">
                  <Pill className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Symptom relief:</span>{' '}
                    {verdict.condition.otc.join(' · ')}
                    <span className="block text-[11px] italic text-slate-500 dark:text-slate-400">
                      Confirm any medicine with a doctor or pharmacist — dosing depends on age, weight and pregnancy.
                    </span>
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Get care urgently if
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  {verdict.condition.watch_for.join(' · ')}
                </p>
              </div>

              <p className="mt-3 text-[11px] italic text-slate-500 dark:text-slate-500 leading-snug">
                This is a likely match based on your description — not a confirmed diagnosis. A
                registered practitioner makes the final call.
              </p>
            </div>
          )}

          {verdict.red_flags && verdict.red_flags.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                Why this verdict? ({verdict.red_flags.length} signal{verdict.red_flags.length > 1 ? 's' : ''} matched)
              </summary>
              <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {verdict.red_flags.map((rf, i) => {
                  const text =
                    typeof rf === 'string' ? rf : rf.rule_name ?? rf.rule_id ?? 'red flag';
                  const cite =
                    typeof rf === 'string' ? null : rf.citation ?? null;
                  return (
                    <li key={i}>
                      <span>{text}</span>
                      {cite && (
                        <span className="text-slate-500 ml-1.5">· {cite}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          {verdict.citations && verdict.citations.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowSources((s) => !s)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                aria-expanded={showSources}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                {t('verdict.sources')} ({verdict.citations.length})
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showSources ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {showSources && (
                <ul className="mt-2 space-y-2">
                  {verdict.citations.map((src, i) => {
                    if (typeof src === 'string') {
                      return (
                        <li
                          key={i}
                          className="rounded-md border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2 text-xs text-slate-700 dark:text-slate-300"
                        >
                          {src}
                        </li>
                      );
                    }
                    const body = src.text ?? src.excerpt ?? null;
                    return (
                      <li
                        key={i}
                        className="rounded-md border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 px-3 py-2 text-xs"
                      >
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {src.source}
                          {src.section && (
                            <span className="text-slate-500 ml-1.5 font-normal">
                              · {src.section}
                            </span>
                          )}
                        </div>
                        {body && (
                          <p className="mt-1 text-slate-600 dark:text-slate-400 italic leading-relaxed">
                            “{body}”
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {verdict.risk && (
            <div className="mt-4 space-y-3">
              {/* Plan 6.2 — RiskOrb as the headline (replaces the
                  RiskTrajectoryCard sparkline as the primary visual).
                  RiskTrajectoryCard demotes to a data-rich secondary view
                  per FRONTEND_BLUEPRINT §3.2. */}
              <div className="flex justify-center">
                <RiskOrb
                  score={verdict.risk.score}
                  level={verdict.risk.level}
                  trajectory={verdict.risk.trajectory}
                  careLevel={verdict.level}
                  redFlagFired={(verdict.red_flags?.length ?? 0) > 0}
                />
              </div>
              <RiskTrajectoryCard risk={verdict.risk} />
            </div>
          )}

          <p className="mt-4 text-xs italic text-slate-500 dark:text-slate-500 leading-snug">
            {verdict.disclaimer}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
