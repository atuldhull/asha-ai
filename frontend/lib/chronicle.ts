'use client';

/**
 * Plan 7.x feature module — Chronicle Mode (daily check-in).
 *
 * For an active triage session in the last 7 days, prompt the patient daily:
 * "Better today" / "Same" / "Worse". Builds a trajectory string + appends
 * each response as a synthetic risk-history sample so the doctor cockpit's
 * sparkline reflects actual reported progression — not just the day-1 verdict.
 *
 * **Frontend-first scope:** check-ins live in localStorage keyed by session
 * id. When backend Chronicle endpoint ships (Plan 7.x backend), this layer
 * remains the offline-first cache. APScheduler-driven WhatsApp/SMS prompts
 * are entirely backend-side and out of scope here.
 *
 * Per DPDP §6: a check-in IS personal data — only collected when the user
 * has the `triage_processing` consent scope (already required to use the app).
 */

import { appendRiskSample } from './sessions';

export type ChronicleStatus = 'better' | 'same' | 'worse';

export interface ChronicleEntry {
  /** ISO timestamp. */
  ts: string;
  status: ChronicleStatus;
  /** Optional free-text note from the patient. ≤ 200 chars; never PII-validated. */
  note?: string;
}

export interface SessionChronicle {
  session_id: string;
  entries: ChronicleEntry[];
}

const STORAGE_KEY = 'asha-ai:chronicle';
const MAX_ENTRIES_PER_SESSION = 14; // ~2 weeks of daily check-ins
const ACTIVE_WINDOW_DAYS = 7;

/* ──────────────── private helpers ──────────────── */

function readAll(): Record<string, SessionChronicle> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SessionChronicle>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, SessionChronicle>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('asha-ai:chronicle-change'));
}

/**
 * Map a self-reported trajectory to a synthetic risk-score delta. The deltas
 * are deliberately small — the rule layer + ML classifier still own the floor.
 * Chronicle nudges the trajectory; it never produces a CRITICAL by itself.
 */
function statusToScoreDelta(prev: number, status: ChronicleStatus): number {
  switch (status) {
    case 'better':
      return Math.max(0, prev - 8);
    case 'worse':
      return Math.min(100, prev + 12);
    case 'same':
    default:
      return prev;
  }
}

/* ──────────────── public API ──────────────── */

export function getChronicle(sessionId: string): SessionChronicle {
  const all = readAll();
  return all[sessionId] ?? { session_id: sessionId, entries: [] };
}

/**
 * Record a check-in for a session. Appends a corresponding risk-history
 * sample so the doctor cockpit's sparkline picks up the trajectory.
 */
export function recordCheckIn(
  sessionId: string,
  status: ChronicleStatus,
  prevRiskScore: number,
  note?: string,
): SessionChronicle {
  const all = readAll();
  const chronicle = all[sessionId] ?? { session_id: sessionId, entries: [] };
  const entry: ChronicleEntry = {
    ts: new Date().toISOString(),
    status,
    ...(note ? { note } : {}),
  };
  chronicle.entries.push(entry);
  if (chronicle.entries.length > MAX_ENTRIES_PER_SESSION) {
    chronicle.entries = chronicle.entries.slice(-MAX_ENTRIES_PER_SESSION);
  }
  all[sessionId] = chronicle;
  writeAll(all);

  // Append a synthetic risk-score sample so the sparkline + composite priority
  // pick up the trajectory immediately.
  const newScore = statusToScoreDelta(prevRiskScore, status);
  appendRiskSample(sessionId, { ts: entry.ts, score: newScore });

  return chronicle;
}

/**
 * True when:
 *   1. The session is within the active window (7 days since started_at), AND
 *   2. There is no check-in for today already.
 *
 * The card uses this to decide whether to render.
 */
export function shouldPromptToday(
  sessionStartedAt: number,
  chronicle: SessionChronicle,
): boolean {
  const ageMs = Date.now() - sessionStartedAt;
  if (ageMs < 0) return false;
  if (ageMs > ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;

  // Skip if a check-in landed today (UTC day boundary is fine for hackathon scope).
  const today = new Date().toISOString().slice(0, 10);
  const lastEntry = chronicle.entries[chronicle.entries.length - 1];
  if (lastEntry && lastEntry.ts.slice(0, 10) === today) return false;

  return true;
}

/**
 * Tally trajectory across the last N entries. Used in the doctor cockpit
 * detail pane and in the patient's history row.
 */
export function trajectoryFromChronicle(
  chronicle: SessionChronicle,
): 'improving' | 'stable' | 'worsening' | 'rapidly_worsening' | 'insufficient_data' {
  if (chronicle.entries.length < 2) return 'insufficient_data';
  const recent = chronicle.entries.slice(-5);
  let score = 0;
  for (const e of recent) {
    if (e.status === 'better') score -= 1;
    else if (e.status === 'worse') score += 1;
  }
  if (score >= 3) return 'rapidly_worsening';
  if (score >= 1) return 'worsening';
  if (score <= -1) return 'improving';
  return 'stable';
}
