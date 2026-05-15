'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  fetchConsentStatus,
  hasLocalConsent,
} from '@/lib/consent';

// ConsentSheet is heavyweight (Framer Motion AnimatePresence + policy fetch).
// Lazy-load so it doesn't bundle on every page — only mounts after the gate
// determines a re-prompt is needed.
const ConsentSheet = dynamic(
  () => import('./ConsentSheet').then((m) => ({ default: m.ConsentSheet })),
  { ssr: false, loading: () => null },
);

/**
 * Plan 6.6 Phase B (frontend) — DPDP consent gate.
 *
 * Mounted in the root layout. On first paint:
 *   1. If localStorage already has the current consent version → no UI.
 *   2. Otherwise hits `/api/v1/consent/me` (anonymous-friendly) to check the
 *      server-side posture, and shows the bottom sheet when `needs_reprompt`.
 *   3. After accept, the sheet records to backend + localStorage and
 *      disappears for the rest of the session.
 *
 * Non-blocking: the user can decline; we mark a session-only "declined"
 * flag so they won't see it again until next browser session — the app
 * still works in degraded mode for users who refuse session_history /
 * longitudinal_memory / etc.
 */
export function ConsentGate() {
  const [show, setShow] = useState(false);
  const [decision, setDecision] = useState<'pending' | 'accepted' | 'declined'>(
    'pending',
  );

  useEffect(() => {
    // Skip on SSR; this is purely a client-side gate.
    if (typeof window === 'undefined') return;

    // Don't re-show within the same browser session if the user already
    // declined the prompt this session.
    if (sessionStorage.getItem('asha-ai:consent-declined') === '1') {
      setDecision('declined');
      return;
    }

    if (hasLocalConsent('triage_processing')) {
      setDecision('accepted');
      return;
    }

    let cancelled = false;
    void fetchConsentStatus().then((status) => {
      if (cancelled) return;
      if (status.needs_reprompt) {
        setShow(true);
      } else {
        setDecision('accepted');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAccepted = useCallback(() => {
    setShow(false);
    setDecision('accepted');
  }, []);

  const handleDeclined = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('asha-ai:consent-declined', '1');
    }
    setShow(false);
    setDecision('declined');
  }, []);

  if (!show) return null;

  return (
    <ConsentSheet
      onAccepted={handleAccepted}
      onDeclined={handleDeclined}
      blocking={false}
    />
  );
}
