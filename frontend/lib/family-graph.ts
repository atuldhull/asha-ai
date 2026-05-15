'use client';

/**
 * Plan 7.x feature module — Family Health Graph.
 *
 * Lets one signed-in account triage on behalf of multiple family members
 * ("self", "mom", "child", etc.). Common Indian use case: ASHA worker /
 * primary caregiver triages for elderly + children who don't own a phone.
 *
 * **Frontend-first scope:** profiles + active selection live in localStorage,
 * keyed by user id. All triage submissions optionally tag `profile_id` so
 * /history can filter and the doctor cockpit can group. Backend persistence
 * (per-account profiles in Postgres) is Plan 7.x backend — not blocking.
 *
 * **Privacy / DPDP:** profiles store first name + age + sex + relationship
 * only. NEVER full names, addresses, ABHA IDs, or photos client-side. ABHA
 * linkage is Tier 6.6 Phase C and stays server-side.
 */

import type { Sex } from './types';

export type Relationship =
  | 'self'
  | 'spouse'
  | 'parent'
  | 'child'
  | 'sibling'
  | 'grandparent'
  | 'grandchild'
  | 'in_law'
  | 'other';

export interface PatientProfile {
  /** UUID. Stable across renames. */
  id: string;
  /** First name only — never full names per DPDP minimization. */
  display_name: string;
  /** Approximate age. Required for triage age-modifiers (pediatric, elderly). */
  age: number;
  sex: Sex | 'other';
  relationship: Relationship;
  /** Optional comma-separated short tags (e.g. "diabetes, hypertension"). */
  comorbidities?: string;
  /** ISO timestamp of creation. */
  created_at: string;
}

const STORAGE_KEY = 'asha-ai:family-graph';
const ACTIVE_KEY = 'asha-ai:family-active';

interface FamilyGraph {
  profiles: PatientProfile[];
}

/* ──────────────── private helpers ──────────────── */

function readGraph(userId: string): FamilyGraph {
  if (typeof window === 'undefined') return { profiles: [] };
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as FamilyGraph) : { profiles: [] };
  } catch {
    return { profiles: [] };
  }
}

function writeGraph(userId: string, graph: FamilyGraph): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(graph));
  window.dispatchEvent(new CustomEvent('asha-ai:family-change'));
}

/* ──────────────── public API ──────────────── */

export function listProfiles(userId: string): PatientProfile[] {
  return readGraph(userId).profiles;
}

export function getProfile(userId: string, profileId: string): PatientProfile | null {
  return readGraph(userId).profiles.find((p) => p.id === profileId) ?? null;
}

/**
 * Bootstrap a "self" profile on first sign-in. Idempotent: returns the
 * existing self profile when one is already present.
 */
export function ensureSelfProfile(
  userId: string,
  defaults: { display_name?: string; age?: number; sex?: Sex | 'other' } = {},
): PatientProfile {
  const graph = readGraph(userId);
  const existing = graph.profiles.find((p) => p.relationship === 'self');
  if (existing) return existing;

  const self: PatientProfile = {
    id: crypto.randomUUID(),
    display_name: defaults.display_name ?? 'You',
    age: defaults.age ?? 30,
    sex: defaults.sex ?? 'other',
    relationship: 'self',
    created_at: new Date().toISOString(),
  };
  graph.profiles.unshift(self);
  writeGraph(userId, graph);
  setActiveProfile(userId, self.id);
  return self;
}

export function addProfile(
  userId: string,
  profile: Omit<PatientProfile, 'id' | 'created_at'>,
): PatientProfile {
  const graph = readGraph(userId);
  // Cap at 8 profiles per account to discourage abuse and keep UI readable.
  if (graph.profiles.length >= 8) {
    throw new Error('Maximum 8 family profiles per account');
  }
  const next: PatientProfile = {
    ...profile,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  graph.profiles.push(next);
  writeGraph(userId, graph);
  return next;
}

export function updateProfile(
  userId: string,
  profileId: string,
  patch: Partial<Omit<PatientProfile, 'id' | 'created_at'>>,
): PatientProfile | null {
  const graph = readGraph(userId);
  const idx = graph.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return null;
  graph.profiles[idx] = { ...graph.profiles[idx], ...patch };
  writeGraph(userId, graph);
  return graph.profiles[idx];
}

export function removeProfile(userId: string, profileId: string): void {
  const graph = readGraph(userId);
  const profile = graph.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  if (profile.relationship === 'self') {
    throw new Error('Cannot delete the self profile — sign out instead');
  }
  graph.profiles = graph.profiles.filter((p) => p.id !== profileId);
  writeGraph(userId, graph);
  if (getActiveProfileId() === profileId) {
    const fallback = graph.profiles.find((p) => p.relationship === 'self') ?? graph.profiles[0];
    setActiveProfile(userId, fallback?.id ?? null);
  }
}

/* ──────────────── active profile ──────────────── */

export function getActiveProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProfile(_userId: string, profileId: string | null): void {
  if (typeof window === 'undefined') return;
  if (profileId) localStorage.setItem(ACTIVE_KEY, profileId);
  else localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent('asha-ai:family-change'));
}

export function getActiveProfile(userId: string): PatientProfile | null {
  const id = getActiveProfileId();
  if (!id) return null;
  return getProfile(userId, id);
}
