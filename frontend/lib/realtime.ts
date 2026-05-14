/**
 * Realtime channel for new verdicts.
 *
 * Two implementations behind the same API:
 *   1. Supabase Realtime when configured (Plan 3.0+ production path)
 *   2. BroadcastChannel + storage event fallback when not (cross-tab demo)
 *
 * Both deliver: a new verdict event whenever a new triage result is created.
 *
 * The fallback uses our existing localStorage session store — every
 * `setVerdict()` call dispatches `asha-ai:sessions-change` (in lib/sessions.ts);
 * we re-broadcast that across tabs via BroadcastChannel for the doctor cockpit.
 */
'use client';

import { getSupabase } from './supabase';
import { listAllSessionsForDoctor, type StoredSession } from './sessions';

export type VerdictHandler = (s: StoredSession) => void;

const CHANNEL = 'asha-ai:verdict-feed';

/**
 * Subscribe to new verdicts. Returns an unsubscribe function.
 * The handler receives the freshly-inserted session (with verdict).
 */
export function subscribeToNewVerdicts(handler: VerdictHandler): () => void {
  const sb = getSupabase();

  if (sb) {
    // Real Supabase Realtime path
    const channel = sb
      .channel('verdicts-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'verdicts' },
        (payload) => {
          const row = payload.new as { session_id?: string };
          // We re-fetch the full session locally to keep the cockpit signal source unified.
          const sessions = listAllSessionsForDoctor({ includeReviewed: false });
          const match = sessions.find((s) => s.id === row.session_id) ?? sessions[0];
          if (match) handler(match);
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }

  // Fallback: cross-tab BroadcastChannel + same-tab storage event
  if (typeof window === 'undefined') return () => {};
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
  } catch {
    bc = null;
  }
  let lastSeenId: string | null = null;

  function notifyLatest() {
    const list = listAllSessionsForDoctor({ includeReviewed: false });
    if (list.length === 0) return;
    const newest = list[0];
    if (newest.id !== lastSeenId) {
      lastSeenId = newest.id;
      handler(newest);
    }
  }

  // Initial seed (so we don't fire for the existing first row)
  const seed = listAllSessionsForDoctor({ includeReviewed: false })[0];
  lastSeenId = seed?.id ?? null;

  function onLocalChange() {
    notifyLatest();
    bc?.postMessage({ type: 'verdict', t: Date.now() });
  }
  function onBroadcast() {
    notifyLatest();
  }

  window.addEventListener('asha-ai:sessions-change', onLocalChange);
  window.addEventListener('storage', onLocalChange);
  if (bc) bc.onmessage = onBroadcast;

  return () => {
    window.removeEventListener('asha-ai:sessions-change', onLocalChange);
    window.removeEventListener('storage', onLocalChange);
    if (bc) {
      bc.onmessage = null;
      try {
        bc.close();
      } catch {
        /* noop */
      }
    }
  };
}
