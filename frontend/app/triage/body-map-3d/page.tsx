'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Send, Trash2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import {
  AnatomyBodyMap,
  type AnatomySelection,
} from '@/components/anatomy/AnatomyBodyMap';
import type { SelectedRegion } from '@/components/3d/BodyMap3DStage';
import { PainPanel } from '@/components/3d/PainPanel';
import { VerdictCard } from '@/components/VerdictCard';
import { postTriage } from '@/lib/api';
import { ensureRisk, escalateCareLevel } from '@/lib/risk';
import {
  appendMessage,
  createSession,
  getSession,
  setInputMode,
  setVerdict as persistVerdict,
} from '@/lib/sessions';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { interp } from '@/lib/i18n/dict';
import { regionForId, type BodyRegion } from '@/lib/body-map/regions';
import type { ChatMessage, Pin, TriageResponse } from '@/lib/types';

const MAX_PINS = 5;

// R3F can't server-render (WebGL is browser-only), so the 3D stage is loaded
// client-side. Keeps the heavy three/drei bundle off SSR and off other routes.
const BodyMap3DStage = dynamic(
  () =>
    import('@/components/3d/BodyMap3DStage').then((m) => ({
      default: m.BodyMap3DStage,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        Loading 3D body…
      </div>
    ),
  },
);

/** Unified tap selection — 3D adds the mesh position, 2D fallback doesn't. */
interface RegionSelection {
  region: BodyRegion;
  meshLocalPos?: [number, number, number];
}

/**
 * Plan 6.1 entry route — Symptom Cinema 3D body map.
 *
 * Renders a real, orbitable procedural anatomical figure (R3F). When WebGL2
 * is unavailable (very low-end devices), it degrades to the 2D anatomy plate
 * so the route still works end-to-end on the rural Android this serves.
 */
export default function BodyMap3DPage() {
  // useSearchParams() requires a Suspense boundary in production builds.
  return (
    <Suspense
      fallback={
        <>
          <Navbar />
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading anatomy…
          </div>
        </>
      }
    >
      <BodyMap3DPageInner />
    </Suspense>
  );
}

function BodyMap3DPageInner() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { t, locale } = useTranslation();

  // 'pending' until we know if WebGL2 is usable; then '3d' or '2d'.
  const [mode, setMode] = useState<'pending' | '3d' | '2d'>('pending');
  const [pins, setPins] = useState<Pin[]>([]);
  const [selection, setSelection] = useState<RegionSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict] = useState<TriageResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(
    searchParams.get('session'),
  );

  // WebGL2 capability probe. The 3D body is the primary experience; only
  // genuinely incapable devices fall back to the 2D plate.
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') || canvas.getContext('webgl');
      setMode(gl ? '3d' : '2d');
    } catch {
      setMode('2d');
    }
  }, []);

  function ensureSessionId(): string | null {
    if (sessionId) {
      setInputMode(sessionId, 'body_map_3d');
      return sessionId;
    }
    if (!user) return null;
    const s = createSession(user.id);
    setInputMode(s.id, 'body_map_3d');
    setSessionId(s.id);
    return s.id;
  }

  const handleRegionTap3D = useCallback((sel: SelectedRegion) => {
    setSelection({ region: sel.region, meshLocalPos: sel.meshLocalPos });
  }, []);

  const handleRegionTap2D = useCallback((sel: AnatomySelection) => {
    setSelection({ region: sel.region });
  }, []);

  const handleSavePin = useCallback((pin: Pin) => {
    setPins((prev) => (prev.length >= MAX_PINS ? prev : [...prev, pin]));
    setSelection(null);
  }, []);

  const handleClearPins = useCallback(() => {
    setPins([]);
    setVerdict(null);
  }, []);

  async function handleSubmit() {
    if (pins.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const sId = ensureSessionId();
      const summary = summarizePins(pins);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: summary,
        timestamp: Date.now(),
      };
      if (sId) appendMessage(sId, userMsg);

      const response = await postTriage({
        symptoms: summary,
        structured_symptoms: pins,
        input_mode: 'body_map_3d',
        session_id: sId ?? undefined,
      });

      const history = sId ? (getSession(sId)?.riskHistory ?? []) : [];
      const risk = await ensureRisk(response, summary, { history });
      const escalated = escalateCareLevel(response.level, risk);
      const enriched: TriageResponse = {
        ...response,
        risk,
        risk_escalated:
          response.risk_escalated ?? escalated !== response.level,
        level: escalated,
      };

      setVerdict(enriched);

      if (sId) {
        const asstMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: enriched.reasoning,
          timestamp: Date.now(),
          verdict: enriched,
        };
        appendMessage(sId, asstMsg);
        persistVerdict(sId, enriched);
      }
    } catch (err) {
      console.error('Body-map triage submission failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />
      <noscript>
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 text-sm text-amber-200">
          {t('bodymap.noscriptFallback')}{' '}
          <Link href="/triage" className="underline">
            {t('bodymap.useChat')}
          </Link>
        </div>
      </noscript>

      <div className="flex flex-1 flex-col bg-[#0a0e1a]">
        <header className="flex items-center justify-between border-b border-slate-800 bg-[#0a0e1a]/95 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/triage"
              className="flex items-center gap-1.5 rounded-md p-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label={t('bodymap.backToChat')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('nav.triage')}</span>
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">
                {t('bodymap.title')}
              </h1>
              <p className="text-[11px] text-slate-500">
                {interp(t('bodymap.subtitleHint'), { max: MAX_PINS })}
              </p>
            </div>
          </div>
          <Link
            href="/triage"
            className="text-xs text-slate-400 hover:text-emerald-400 underline"
          >
            {t('bodymap.useChat')}
          </Link>
        </header>

        {/* Body map surface — 3D Canvas (or 2D fallback) fills all space */}
        <div className="relative flex-1 min-h-[520px] overflow-hidden">
          {mode === 'pending' && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              {t('bodymap.checkingDevice')}
            </div>
          )}

          {mode === '3d' && (
            <BodyMap3DStage
              pins={pins}
              maxPins={MAX_PINS}
              onRegionTap={handleRegionTap3D}
            />
          )}

          {mode === '2d' && (
            <AnatomyBodyMap
              pins={pins}
              maxPins={MAX_PINS}
              onRegionTap={handleRegionTap2D}
              locale={locale === 'hi' || locale === 'kn' ? locale : 'en'}
            />
          )}

          {mode !== 'pending' && (
            <>
              {/* Pin counter chip */}
              <div className="absolute left-4 top-4 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-300 backdrop-blur">
                {interp(t('bodymap.placedOf'), {
                  n: pins.length,
                  max: MAX_PINS,
                })}
              </div>

              {pins.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearPins}
                  className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-300 backdrop-blur hover:border-red-500/40 hover:text-red-400"
                  aria-label={t('bodymap.clearAria')}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  {t('bodymap.clear')}
                </button>
              )}

              {pins.length === 0 && !selection && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="pointer-events-none absolute inset-x-4 bottom-6 mx-auto max-w-sm rounded-xl border border-slate-700 bg-slate-900/85 p-3 text-center text-xs text-slate-300 backdrop-blur"
                >
                  {mode === '3d'
                    ? 'Drag to rotate the body. Tap a body part where it hurts.'
                    : t('bodymap.hint')}
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Pin list strip */}
        {pins.length > 0 && !verdict && (
          <div className="border-t border-slate-800 bg-[#0a0e1a]/95 px-4 py-3">
            <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
              {pins.map((pin, i) => {
                const region = regionForId(pin.body_region);
                const layLabel =
                  locale === 'hi'
                    ? region?.layperson_hi
                    : locale === 'kn'
                      ? region?.layperson_kn
                      : region?.layperson_en;
                return (
                  <span
                    key={`${pin.body_region}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200"
                  >
                    <span className="font-medium">
                      {layLabel ?? pin.body_region}
                    </span>
                    <span className="text-emerald-400/80">
                      {pin.intensity}/10
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit bar */}
        {!verdict && (
          <div className="sticky bottom-0 border-t border-slate-800 bg-[#0a0e1a] px-4 py-3">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                {t('common.notReplacement')}
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pins.length === 0 || submitting}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t('bodymap.submitAria')}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                <span>
                  {submitting
                    ? t('bodymap.reviewing')
                    : pins.length === 1
                      ? t('bodymap.submitOne')
                      : interp(t('bodymap.submitMany'), { n: pins.length })}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Verdict surface */}
        {verdict && (
          <div className="border-t border-slate-800 bg-[#0a0e1a] px-4 py-6">
            <div className="mx-auto max-w-2xl">
              <VerdictCard verdict={verdict} />
              <div className="mt-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setVerdict(null);
                    setPins([]);
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
                >
                  {t('bodymap.startOver')}
                </button>
                <Link
                  href="/triage"
                  className="rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {t('bodymap.continueChat')}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Pain panel — slides up from bottom on tap */}
        {selection && pins.length < MAX_PINS && (
          <PainPanel
            region={selection.region}
            meshLocalPos={selection.meshLocalPos}
            layerVisible={selection.region.layer}
            pinNumber={pins.length + 1}
            maxPins={MAX_PINS}
            onSave={handleSavePin}
            onClose={() => setSelection(null)}
          />
        )}
      </div>
    </>
  );
}

function summarizePins(pins: Pin[]): string {
  return pins
    .map((p) => {
      const region = regionForId(p.body_region);
      const where = region?.layperson_en ?? p.body_region;
      const qualities =
        p.quality.length > 0 ? ` (${p.quality.join(', ')})` : '';
      const dur = p.duration_band.replace(/_/g, ' ');
      return `${where}: intensity ${p.intensity}/10${qualities}, ${dur}`;
    })
    .join('. ');
}
