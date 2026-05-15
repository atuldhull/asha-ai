'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Sword, Heart, ArrowDownToLine, RotateCw } from 'lucide-react';
import type {
  AnatomyLayer,
  PainAggravator,
  PainDuration,
  PainQuality,
  Pin,
} from '@/lib/types';
import type { BodyRegion } from '@/lib/body-map/regions';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { interp } from '@/lib/i18n/dict';

const QUALITY_CHIPS: Array<{
  value: PainQuality;
  Icon: typeof Flame;
  emoji: string;
}> = [
  { value: 'burning', Icon: Flame, emoji: '🔥' },
  { value: 'stabbing', Icon: Sword, emoji: '🗡' },
  { value: 'throbbing', Icon: Heart, emoji: '💗' },
  { value: 'pressure', Icon: ArrowDownToLine, emoji: '⏬' },
  { value: 'cramping', Icon: RotateCw, emoji: '🌀' },
];

const DURATION_OPTIONS: PainDuration[] = [
  'just_started',
  'few_hours',
  'since_yesterday',
  'days_or_weeks',
];

const AGGRAVATOR_OPTIONS: PainAggravator[] = [
  'moving',
  'eating',
  'breathing',
  'pressing',
  'standing_up',
  'nothing',
];

const INTENSITY_EMOJI = ['😊', '🙂', '😐', '😟', '😖'];
function emojiForIntensity(n: number): string {
  // 1-2 -> 0, 3-4 -> 1, 5-6 -> 2, 7-8 -> 3, 9-10 -> 4
  const idx = Math.min(4, Math.floor((n - 1) / 2));
  return INTENSITY_EMOJI[idx];
}

const INTENSITY_COLORS = [
  'bg-emerald-400',
  'bg-lime-400',
  'bg-yellow-400',
  'bg-amber-400',
  'bg-orange-400',
  'bg-orange-500',
  'bg-red-400',
  'bg-red-500',
  'bg-red-600',
  'bg-red-700',
];

interface PainPanelProps {
  /** Region the user tapped — drives the panel header. */
  region: BodyRegion;
  /** Local mesh-space tap point, forwarded into the Pin. */
  meshLocalPos?: [number, number, number];
  /** Currently visible anatomy layer when the user tapped. */
  layerVisible?: AnatomyLayer;
  /** Pin number for the header (1-of-5 etc.). */
  pinNumber: number;
  /** Cap. */
  maxPins?: number;
  /** Save handler — receives the assembled Pin. */
  onSave: (pin: Pin) => void;
  /** Close without saving. */
  onClose: () => void;
}

export function PainPanel({
  region,
  meshLocalPos,
  layerVisible = 'skin',
  pinNumber,
  maxPins = 5,
  onSave,
  onClose,
}: PainPanelProps) {
  const reduced = useReduced();
  const { t, locale } = useTranslation();
  const [intensity, setIntensity] = useState(5);
  const [quality, setQuality] = useState<PainQuality[]>([]);
  const [duration, setDuration] = useState<PainDuration>('few_hours');
  const [aggravators, setAggravators] = useState<PainAggravator[]>([]);

  const layperson =
    locale === 'hi'
      ? region.layperson_hi
      : locale === 'kn'
        ? region.layperson_kn
        : region.layperson_en;

  function toggleQuality(q: PainQuality) {
    setQuality((prev) =>
      prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q],
    );
  }

  function toggleAggravator(a: PainAggravator) {
    setAggravators((prev) => {
      // "nothing" is mutually exclusive with everything else.
      if (a === 'nothing') return prev.includes('nothing') ? [] : ['nothing'];
      const cleaned = prev.filter((x) => x !== 'nothing');
      return cleaned.includes(a) ? cleaned.filter((x) => x !== a) : [...cleaned, a];
    });
  }

  function handleSave() {
    if (quality.length === 0) return; // require ≥1 quality per SYMPTOM_CINEMA §2.4
    const pin: Pin = {
      body_region: region.id,
      body_view: region.view,
      x: 0.5, // normalized screen coords — not meaningful in 3D, kept for compat
      y: 0.5,
      intensity,
      quality,
      duration_band: duration,
      aggravators: aggravators.length > 0 ? aggravators : ['nothing'],
      fma_id: region.fma_id,
      mesh_position_3d: meshLocalPos,
      layer_visible: layerVisible,
    };

    // Soft haptic on save (Android only).
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !reduced) {
      try {
        navigator.vibrate(40);
      } catch {
        /* ignore */
      }
    }

    onSave(pin);
  }

  const intensityIdx = Math.max(0, Math.min(9, intensity - 1));

  return (
    <AnimatePresence>
      <motion.aside
        role="dialog"
        aria-label={interp(t('pain.dialogAria'), { region: region.clinical_term })}
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reduced ? undefined : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-[#0f1421] shadow-2xl"
      >
        {/* drag handle */}
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-700"
        />

        <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
              {interp(t('pain.pinNumber'), { n: pinNumber, max: maxPins })}
            </p>
            <h2 className="text-lg font-semibold text-slate-100">
              {layperson}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {region.clinical_term}
              {region.fma_id ? ` · ${region.fma_id}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('pain.closeAria')}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="space-y-5 px-5 pb-6 pt-2">
          {/* Intensity */}
          <section aria-labelledby="ph-intensity">
            <div className="flex items-center justify-between mb-2">
              <h3
                id="ph-intensity"
                className="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                {t('pain.intensityTitle')}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-3xl" aria-hidden>
                  {emojiForIntensity(intensity)}
                </span>
                <span
                  className={`inline-flex h-7 w-12 items-center justify-center rounded-md ${INTENSITY_COLORS[intensityIdx]} text-sm font-bold text-slate-900`}
                  aria-label={`${intensity}/10`}
                >
                  {intensity}/10
                </span>
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-emerald-500"
              aria-label={t('pain.intensityAria')}
            />
            <div className="mt-1 text-center text-[10px] text-slate-500">
              {t('pain.intensityHelp')}
            </div>
          </section>

          {/* Quality */}
          <section aria-labelledby="ph-quality">
            <h3
              id="ph-quality"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
            >
              {t('pain.qualityTitle')}{' '}
              <span className="text-slate-500 normal-case">{t('pain.qualityHelp')}</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {QUALITY_CHIPS.map(({ value, emoji }) => {
                const on = quality.includes(value);
                const label = t(`pain.quality.${value}`);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleQuality(value)}
                    aria-pressed={on}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                      on
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span aria-hidden>{emoji}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Duration */}
          <section aria-labelledby="ph-duration">
            <h3
              id="ph-duration"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
            >
              {t('pain.durationTitle')}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DURATION_OPTIONS.map((value) => {
                const on = duration === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    aria-pressed={on}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      on
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {t(`pain.duration.${value}`)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Aggravators */}
          <section aria-labelledby="ph-aggravators">
            <h3
              id="ph-aggravators"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
            >
              {t('pain.aggravatorsTitle')}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AGGRAVATOR_OPTIONS.map((value) => {
                const on = aggravators.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleAggravator(value)}
                    aria-pressed={on}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                      on
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {t(`pain.agg.${value}`)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={quality.length === 0}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('pain.saveAria')}
          >
            {quality.length === 0
              ? t('pain.savePinPrompt')
              : t('pain.savePin')}
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
