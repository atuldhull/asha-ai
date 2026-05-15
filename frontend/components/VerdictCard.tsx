'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Home, Stethoscope, Siren, BookOpen, ChevronDown } from 'lucide-react';
import { CareLevel, TriageResponse } from '@/lib/types';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/lib/i18n/I18nProvider';

interface VerdictCardProps {
  verdict: TriageResponse;
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

export function VerdictCard({ verdict }: VerdictCardProps) {
  const c = config[verdict.level];
  const Icon = c.icon;
  const isEmergency = verdict.level === 'Emergency Room';
  const reduce = useReducedMotion();
  const { t, locale } = useTranslation();
  const [showSources, setShowSources] = useState(false);

  const subtitle = locale !== 'en' ? t(SUBTITLE_KEY[verdict.level]) : null;

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
          </div>

          <h3 className={cn('mt-3 text-lg font-bold', c.text)}>{c.label}</h3>
          {subtitle && (
            <p className={cn('text-sm font-medium', c.text)} aria-hidden>
              {subtitle}
            </p>
          )}

          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {verdict.reasoning}
          </p>

          <div className="mt-4 rounded-lg bg-white/70 dark:bg-slate-900/40 p-3 border border-slate-200/60 dark:border-slate-700/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Next step
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {c.nextStep}
            </p>
          </div>

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

          <p className="mt-4 text-xs italic text-slate-500 dark:text-slate-500 leading-snug">
            {verdict.disclaimer}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
