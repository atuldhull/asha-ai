'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Phone, HeartHandshake, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/I18nProvider';

interface MentalHealthScreenProps {
  onClose: () => void;
}

/**
 * Full-screen takeover shown when the safety layer flags suicidal ideation.
 *
 * Per WHO 2024 ethics + India Mental Healthcare Act 2017:
 * - This screen does NOT triage suicidality further
 * - Helpline numbers are visible, not buried
 * - Both numbers are tap-to-dial (`tel:` href)
 * - "I'm safe" button is just a UX kindness — no clinical assessment is implied
 */
export function MentalHealthScreen({ onClose }: MentalHealthScreenProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0e1a]/98 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-2xl border-2 border-emerald-500/40 bg-[#111728] p-6 sm:p-8 shadow-2xl shadow-emerald-500/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mh-title"
        aria-describedby="mh-body"
      >
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 mb-4">
          <HeartHandshake className="h-6 w-6" aria-hidden />
        </div>

        <h2 id="mh-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-100 mb-3">
          {t('mh.title')}
        </h2>
        <p id="mh-body" className="text-base text-slate-300 leading-relaxed mb-6">
          {t('mh.body')}
        </p>

        <div className="space-y-3 mb-6">
          <HelplineCard
            label={t('mh.icall')}
            number="9152987821"
            href="tel:+919152987821"
          />
          <HelplineCard
            label={t('mh.vandrevala')}
            number="1860-2662-345"
            href="tel:+9118602662345"
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300 mb-6">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{t('mh.emergency')}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors text-sm"
        >
          {t('mh.safeBack')}
        </button>
      </motion.div>
    </div>
  );
}

function HelplineCard({
  label,
  number,
  href,
}: {
  label: string;
  number: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-400/60 transition-colors px-4 py-3 group"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Phone className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className="text-base font-semibold text-emerald-200 tabular-nums tracking-wide">
          {number}
        </div>
      </div>
      <span className="text-xs text-emerald-400 group-hover:text-emerald-300 hidden sm:inline">
        Tap to call
      </span>
    </a>
  );
}
