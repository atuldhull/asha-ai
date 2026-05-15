'use client';

import { useCallback, useState } from 'react';
import { MapPin, Loader2, Share2, MessageCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { toast } from '@/lib/toast';
import type { TriageResponse } from '@/lib/types';

interface VerdictActionsProps {
  verdict: TriageResponse;
}

/**
 * Plan 6.6 Phase H (frontend-only first pass) — patient action row on
 * every verdict.
 *
 *   1. Find nearest clinic — uses browser geolocation + opens Google Maps
 *      in a new tab with a search URL pre-built from coords. Zero-cost
 *      (no Maps Platform API key needed for the search-URL form).
 *      Search query adapts by care level: hospital for ER, clinic for
 *      Clinic Visit, pharmacy for Home Care.
 *
 *   2. WhatsApp share — generates a wa.me deep link with the verdict
 *      summary so the patient can forward it to a doctor or family
 *      member. No PHI beyond what the patient already has.
 *
 *   3. Web Share API fallback — if the device has navigator.share, expose
 *      it for native multi-app share (iOS / Android Chrome).
 *
 * All three actions: privacy-respecting, no API keys required, work
 * offline (graceful degradation).
 */
export function VerdictActions({ verdict }: VerdictActionsProps) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const hasNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const findClinic = useCallback(() => {
    const query =
      verdict.level === 'Emergency Room'
        ? 'hospital emergency'
        : verdict.level === 'Clinic Visit'
          ? 'clinic OR doctor'
          : 'pharmacy';

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // No geolocation — fall back to a query-only search.
      window.open(
        `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${latitude},${longitude},14z`;
        window.open(url, '_blank', 'noopener,noreferrer');
        setLocating(false);
        toast.success(t('actions.clinic.opened'));
      },
      (err) => {
        setLocating(false);
        // Fall back to query-only search; surface a toast so the user
        // knows why the map isn't centered on them.
        window.open(
          `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
          '_blank',
          'noopener,noreferrer',
        );
        const reason =
          err.code === err.PERMISSION_DENIED
            ? t('actions.clinic.locationDenied')
            : t('actions.clinic.locationFailed');
        toast.warning(t('actions.clinic.openedWithoutLocation'), {
          description: reason,
        });
      },
      { timeout: 6000, maximumAge: 60_000 },
    );
  }, [verdict.level, t]);

  const buildShareText = useCallback(() => {
    const lines = [
      `${t('actions.share.intro')} ASHA-AI:`,
      '',
      `📋 ${t('actions.share.careLevel')}: ${verdict.level}`,
    ];
    if (verdict.risk) {
      lines.push(
        `⚠️ ${t('actions.share.risk')}: ${verdict.risk.score}/100 (${verdict.risk.level})`,
      );
    }
    if (verdict.reasoning) {
      lines.push(`💬 ${verdict.reasoning}`);
    }
    lines.push('');
    lines.push(`⚕️ ${t('actions.share.disclaimer')}`);
    return lines.join('\n');
  }, [verdict, t]);

  const shareWhatsApp = useCallback(() => {
    const text = buildShareText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success(t('actions.share.whatsappOpened'));
  }, [buildShareText, t]);

  const shareNative = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: 'ASHA-AI triage',
        text: buildShareText(),
      });
      toast.success(t('actions.share.shared'));
    } catch (err) {
      // AbortError = user cancelled the picker; not an error path.
      const name = (err as { name?: string })?.name;
      if (name && name !== 'AbortError') {
        toast.error(t('actions.share.failed'));
      }
    }
  }, [buildShareText, t]);

  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('actions.aria')}>
      <button
        type="button"
        onClick={findClinic}
        disabled={locating}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
      >
        {locating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <MapPin className="h-3.5 w-3.5" aria-hidden />
        )}
        {locating ? t('actions.clinic.locating') : t('actions.clinic.find')}
      </button>

      <button
        type="button"
        onClick={shareWhatsApp}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/15 transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        {t('actions.share.whatsapp')}
      </button>

      {hasNativeShare && (
        <button
          type="button"
          onClick={shareNative}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          aria-label={t('actions.share.nativeAria')}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          {t('actions.share.native')}
        </button>
      )}
    </div>
  );
}
