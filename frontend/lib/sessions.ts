/**
 * Session + history persistence layer.
 *
 * Stores a list of triage sessions per signed-in user. Each session has
 * messages + an optional verdict. Plan 2.0 uses localStorage; Plan 3.0+
 * swaps to Supabase via the same interface.
 *
 * KEY DESIGN: keyed by user.id so doctor users (when impersonating a
 * patient ID) can be filtered later. The doctor cockpit reads from
 * `listAllSessionsForDoctor()` which iterates across all user keys.
 */
'use client';

import { compositePriority } from './risk';
import type {
  ChatMessage,
  InputMode,
  RiskHistoryPoint,
  TriageResponse,
} from './types';

export interface StoredSession {
  id: string;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  messages: ChatMessage[];
  verdict: TriageResponse | null;
  reviewedAt: number | null; // for doctor cockpit
  /** Plan 5.1 — last 48 risk score samples, oldest-first. */
  riskHistory?: RiskHistoryPoint[];
  /** Plan 6.1 — origin of the symptom data (chat / voice / 3D body map).
   *  Surfaced on the doctor cockpit so the reviewer knows whether the
   *  patient pointed at a 3D body or typed in chat. */
  inputMode?: InputMode;
}

const SESSIONS_KEY = 'asha-ai:sessions';
const RISK_HISTORY_MAX = 48;

/* ──────── private helpers ──────── */

function readAll(): Record<string, StoredSession> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredSession>) : {};
  } catch {
    return {};
  }
}

function writeAll(sessions: Record<string, StoredSession>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new CustomEvent('asha-ai:sessions-change'));
}

/* ──────── public API ──────── */

export function createSession(userId: string): StoredSession {
  const session: StoredSession = {
    id: crypto.randomUUID(),
    userId,
    startedAt: Date.now(),
    endedAt: null,
    messages: [],
    verdict: null,
    reviewedAt: null,
  };
  const all = readAll();
  all[session.id] = session;
  writeAll(all);
  return session;
}

export function getSession(sessionId: string): StoredSession | null {
  return readAll()[sessionId] ?? null;
}

export function appendMessage(sessionId: string, message: ChatMessage): void {
  const all = readAll();
  const s = all[sessionId];
  if (!s) return;
  s.messages.push(message);
  writeAll(all);
}

export function setVerdict(sessionId: string, verdict: TriageResponse): void {
  const all = readAll();
  const s = all[sessionId];
  if (!s) return;
  s.verdict = verdict;
  s.endedAt = Date.now();
  if (verdict.risk) {
    const history = s.riskHistory ?? [];
    history.push({
      ts: verdict.risk.computed_at ?? new Date().toISOString(),
      score: verdict.risk.score,
    });
    s.riskHistory = history.slice(-RISK_HISTORY_MAX);
  }
  writeAll(all);
}

/**
 * Append a fresh risk-score sample without rewriting the verdict — used by
 * the backend recompute task or by the demo seeder that synthesises history.
 */
export function appendRiskSample(sessionId: string, point: RiskHistoryPoint): void {
  const all = readAll();
  const s = all[sessionId];
  if (!s) return;
  const history = s.riskHistory ?? [];
  history.push(point);
  s.riskHistory = history.slice(-RISK_HISTORY_MAX);
  writeAll(all);
}

export function markReviewed(sessionId: string): void {
  const all = readAll();
  const s = all[sessionId];
  if (!s) return;
  s.reviewedAt = Date.now();
  writeAll(all);
}

/**
 * Plan 6.1 — record the origin of the symptom data on the session so the
 * doctor cockpit can surface a "3D body" vs "chat" vs "voice" chip. Idempotent.
 */
export function setInputMode(sessionId: string, mode: InputMode): void {
  const all = readAll();
  const s = all[sessionId];
  if (!s) return;
  if (s.inputMode === mode) return;
  s.inputMode = mode;
  writeAll(all);
}

/**
 * List sessions for one user, newest-first.
 */
export function listSessionsForUser(userId: string): StoredSession[] {
  return Object.values(readAll())
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * List ALL sessions (doctor cockpit). Excludes already-reviewed by default.
 *
 * Sort: composite ESI × risk score (Plan 5.1). ESI is dominant (clinical
 * protocol takes precedence) and the dynamic risk score breaks ties
 * between same-ESI cases — so a deteriorating ESI-3 floats above a stable ESI-3.
 */
export function listAllSessionsForDoctor(opts?: { includeReviewed?: boolean }): StoredSession[] {
  const includeReviewed = opts?.includeReviewed ?? false;
  return Object.values(readAll())
    .filter((s) => s.verdict !== null && (includeReviewed || !s.reviewedAt))
    .sort((a, b) => {
      const priorityDelta = compositePriority(b.verdict) - compositePriority(a.verdict);
      return priorityDelta !== 0 ? priorityDelta : b.startedAt - a.startedAt;
    });
}

/**
 * Convenience — get the first user message of a session for list previews.
 */
export function previewText(s: StoredSession, maxLen = 80): string {
  const firstUser = s.messages.find((m) => m.role === 'user');
  if (!firstUser) return '(no input yet)';
  return firstUser.content.length > maxLen
    ? firstUser.content.slice(0, maxLen) + '…'
    : firstUser.content;
}
