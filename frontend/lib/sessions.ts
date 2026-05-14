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

import type { ChatMessage, TriageResponse } from './types';

export interface StoredSession {
  id: string;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  messages: ChatMessage[];
  verdict: TriageResponse | null;
  reviewedAt: number | null; // for doctor cockpit
}

const SESSIONS_KEY = 'asha-ai:sessions';

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
 * List sessions for one user, newest-first.
 */
export function listSessionsForUser(userId: string): StoredSession[] {
  return Object.values(readAll())
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * List ALL sessions (doctor cockpit). Excludes already-reviewed by default.
 */
export function listAllSessionsForDoctor(opts?: { includeReviewed?: boolean }): StoredSession[] {
  const includeReviewed = opts?.includeReviewed ?? false;
  return Object.values(readAll())
    .filter((s) => s.verdict !== null && (includeReviewed || !s.reviewedAt))
    .sort((a, b) => {
      // Sort by ESI urgency (Emergency > Clinic > Home), then newest first
      const order = esiOrder(b) - esiOrder(a);
      return order !== 0 ? order : b.startedAt - a.startedAt;
    });
}

function esiOrder(s: StoredSession): number {
  if (!s.verdict) return 0;
  if (s.verdict.level === 'Emergency Room') return 3;
  if (s.verdict.level === 'Clinic Visit') return 2;
  return 1;
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
