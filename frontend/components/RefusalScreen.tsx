'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Phone, Pill, MessageCircleOff, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export type RefusalType = 'drug_dosing' | 'non_medical' | 'suicidal_ideation';

interface RefusalAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'tel';
}

interface RefusalScreenProps {
  type: RefusalType;
  title: string;
  message: string;
  actions: RefusalAction[];
  onClose?: () => void;
}

const TYPE_META: Record<
  RefusalType,
  { Icon: typeof Phone; iconBg: string; iconColor: string }
> = {
  drug_dosing: {
    Icon: Pill,
    iconBg: 'bg-amber-500/15 border-amber-500/40',
    iconColor: 'text-amber-300',
  },
  non_medical: {
    Icon: MessageCircleOff,
    iconBg: 'bg-slate-500/15 border-slate-500/40',
    iconColor: 'text-slate-300',
  },
  suicidal_ideation: {
    Icon: Phone,
    iconBg: 'bg-emerald-500/15 border-emerald-500/40',
    iconColor: 'text-emerald-300',
  },
};

/**
 * Generalized full-screen refusal takeover.
 *
 * Shown when the safety layer flags one of:
 *   - drug_dosing — user asked for medication doses
 *   - non_medical — user asked something off-topic
 *   - suicidal_ideation — kept for parity with MentalHealthScreen
 *
 * Per WHO 2024 ethics + India Mental Healthcare Act 2017, the suicidal
 * variant uses the dedicated MentalHealthScreen for richer UX. Use this
 * component for the lighter refusals.
 */
export function RefusalScreen({ type, title, message, actions, onClose }: RefusalScreenProps) {
  const reduce = useReducedMotion();
  const meta = TYPE_META[type];
  const { Icon } = meta;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0e1a]/98 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#111728] p-6 sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="refusal-title"
        aria-describedby="refusal-body"
      >
        <div
          className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${meta.iconBg} ${meta.iconColor} mb-4`}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>

        <h2 id="refusal-title" className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 mb-2">
          {title}
        </h2>
        <p id="refusal-body" className="text-sm text-slate-400 leading-relaxed mb-5">
          {message}
        </p>

        <div className="space-y-2">
          {actions.map((a, i) => (
            <RefusalActionButton key={i} action={a} />
          ))}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-3 inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Close"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> Close
          </button>
        )}
      </motion.div>
    </div>
  );
}

function RefusalActionButton({ action }: { action: RefusalAction }) {
  const variant = action.variant ?? 'primary';
  const base =
    'w-full h-11 rounded-lg font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors';
  const styles =
    variant === 'tel'
      ? 'bg-emerald-500 text-white hover:bg-emerald-400'
      : variant === 'secondary'
        ? 'border border-slate-700 text-slate-200 hover:bg-slate-800'
        : 'bg-slate-100 text-slate-900 hover:bg-white';

  if (action.href) {
    const isTel = action.href.startsWith('tel:');
    return (
      <Link
        href={action.href}
        className={`${base} ${styles}`}
        aria-label={action.label}
        target={isTel ? undefined : '_self'}
      >
        {isTel ? <Phone className="h-4 w-4" aria-hidden /> : null}
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={`${base} ${styles}`}>
      {action.label}
    </button>
  );
}

/* Pre-baked content packs for the standard refusal types. Use these from the
 * triage page so all refusal copy lives in one place. */
export interface PackedContent {
  title: string;
  message: string;
  actions: RefusalAction[];
}

export function drugDosingPack(onBack: () => void): PackedContent {
  return {
    title: "I can't recommend medication doses.",
    message:
      'Medication dosing requires a registered medical practitioner. Please consult a qualified doctor.',
    actions: [{ label: 'Back to triage', onClick: onBack, variant: 'primary' }],
  };
}

export function nonMedicalPack(onBack: () => void): PackedContent {
  return {
    title: 'I only help with medical triage.',
    message: "This question isn't medical. Ask me about symptoms instead.",
    actions: [{ label: 'Back', onClick: onBack, variant: 'primary' }],
  };
}

export function emergencyDisclaimerNote(): ReactNode {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
      <span>If this is an immediate emergency, call 108 (ambulance) or 112.</span>
    </div>
  );
}
