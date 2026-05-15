'use client';

/**
 * Plan 6.6 Phase B (frontend) — DPDP Act 2023 consent + right-to-deletion client.
 *
 * Mirrors `backend/app/routers/consent.py` + `backend/app/routers/user_data.py`.
 * Anonymous-friendly: consent can be recorded without auth (server stores
 * only a hashed IP). Authenticated calls attach the Supabase JWT so the
 * backend ties consent rows to a stable user_id.
 *
 * **Local-first fallback:** when no `NEXT_PUBLIC_API_BASE` is configured
 * (demo/offline mode), all calls short-circuit to localStorage so the UI
 * still works for hackathon demos. Real production wiring kicks in when
 * the env var is set.
 */

import { getSupabase } from './supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const LOCAL_KEY = 'asha-ai:consent';
const DELETION_LOCAL_KEY = 'asha-ai:deletion-status';

/** Mirrors backend `ConsentScope` enum. Order matters for UI rendering. */
export const CONSENT_SCOPES = [
  'triage_processing',
  'session_history',
  'longitudinal_memory',
  'abdm_health_locker',
  'analytics_aggregate',
  'research_pseudonymized',
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export interface ConsentStatus {
  user_id: string | null;
  current_version: string;
  granted_scopes: ConsentScope[];
  needs_reprompt: boolean;
  last_granted_at: string | null;
  last_granted_version: string | null;
}

export interface ConsentResponse {
  consent_id: string;
  user_id: string | null;
  scopes: ConsentScope[];
  consent_version: string;
  language: string;
  ip_hash: string | null;
  granted_at: string;
}

export interface ConsentPolicy {
  version: string;
  language: string;
  text_markdown: string;
  legal_review_status: 'pending' | 'approved';
}

export interface DeletionResponse {
  deletion_id: string;
  user_id: string;
  soft_deleted_at: string;
  hard_delete_after: string;
  affected_tables: string[];
  audit_event: string;
}

export interface DeletionStatus {
  user_id: string;
  has_pending_deletion: boolean;
  soft_deleted_at: string | null;
  hard_delete_after: string | null;
}

/** Local fallback shape — kept compatible with the server payload. */
interface LocalConsent {
  scopes: ConsentScope[];
  granted_at: string;
  consent_version: string;
  language: string;
}

const PLACEHOLDER_VERSION = '2026-05-15.v1';

const PLACEHOLDER_POLICY: ConsentPolicy = {
  version: PLACEHOLDER_VERSION,
  language: 'en',
  legal_review_status: 'pending',
  text_markdown: [
    '# ASHA-AI privacy & consent',
    '',
    '_Pending legal review._',
    '',
    '**What we do:**',
    '- Process the symptoms you type or speak to suggest one of three care levels: `Home Care`, `Clinic Visit`, or `Emergency Room`.',
    '- The model is decision support — not a diagnosis. Per India Telemedicine Practice Guidelines 2020, AI assists registered medical practitioners; it does not diagnose or prescribe.',
    '',
    '**What we never do:**',
    '- Sell your data.',
    '- Share PHI with advertisers.',
    '- Store your phone number alongside your medical history without explicit consent.',
    '',
    '**Per scope you grant below, you control:**',
    '- Triage processing (required to use ASHA-AI at all)',
    '- Session history (so you can review past triages)',
    '- Longitudinal memory (so the model recalls relevant past visits)',
    '- ABDM Health Locker push (so a doctor at any ABHA-linked facility can see your verdicts)',
    '- Aggregate analytics (anonymous district-level outbreak patterns)',
    '- Pseudonymized research dataset (academic + ICMR collaboration)',
    '',
    'Per DPDP Act 2023 §13, you can withdraw any scope or request total deletion at any time from Settings → Privacy. Soft-delete is immediate; hard-delete completes within 72 hours.',
    '',
    'Disclaimer on every screen: *"This is not a replacement for professional medical diagnosis."*',
  ].join('\n'),
};

/* ──────────────── helpers ──────────────── */

function readLocal(): LocalConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalConsent) : null;
  } catch {
    return null;
  }
}

function writeLocal(c: LocalConsent | null): void {
  if (typeof window === 'undefined') return;
  if (c) localStorage.setItem(LOCAL_KEY, JSON.stringify(c));
  else localStorage.removeItem(LOCAL_KEY);
  window.dispatchEvent(new CustomEvent('asha-ai:consent-change'));
}

function readLocalDeletion(): DeletionStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DELETION_LOCAL_KEY);
    return raw ? (JSON.parse(raw) as DeletionStatus) : null;
  } catch {
    return null;
  }
}

function writeLocalDeletion(d: DeletionStatus | null): void {
  if (typeof window === 'undefined') return;
  if (d) localStorage.setItem(DELETION_LOCAL_KEY, JSON.stringify(d));
  else localStorage.removeItem(DELETION_LOCAL_KEY);
  window.dispatchEvent(new CustomEvent('asha-ai:deletion-change'));
}

async function authHeader(): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/* ──────────────── public API ──────────────── */

/**
 * Fetch the consent policy text. When the backend isn't wired, returns the
 * local placeholder so the UI still has copy to render.
 */
export async function fetchConsentPolicy(language: 'en' | 'hi' | 'kn' = 'en'): Promise<ConsentPolicy> {
  if (!API_BASE) return { ...PLACEHOLDER_POLICY, language };
  try {
    const res = await fetch(`${API_BASE}/api/v1/consent/policy?language=${language}`);
    if (!res.ok) throw new Error(`policy ${res.status}`);
    return (await res.json()) as ConsentPolicy;
  } catch {
    return { ...PLACEHOLDER_POLICY, language };
  }
}

/**
 * Get the user's current consent posture. Authed when JWT is available;
 * falls back to localStorage when not.
 */
export async function fetchConsentStatus(): Promise<ConsentStatus> {
  if (!API_BASE) return localStatusFromStorage();

  const headers = await authHeader();
  try {
    const res = await fetch(`${API_BASE}/api/v1/consent/me`, { headers });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as ConsentStatus;
  } catch {
    return localStatusFromStorage();
  }
}

/**
 * Record consent. Anonymous-friendly: backend records only a hashed IP if
 * no JWT is present. Always also writes a local cache so the prompt
 * doesn't fire again on next visit.
 */
export async function recordConsent(
  scopes: ConsentScope[],
  language: 'en' | 'hi' | 'kn' = 'en',
): Promise<ConsentResponse | null> {
  // Local cache first — works in every mode.
  const local: LocalConsent = {
    scopes,
    granted_at: new Date().toISOString(),
    consent_version: PLACEHOLDER_VERSION,
    language,
  };
  writeLocal(local);

  if (!API_BASE) {
    return {
      consent_id: `local-${crypto.randomUUID()}`,
      user_id: null,
      scopes,
      consent_version: PLACEHOLDER_VERSION,
      language,
      ip_hash: null,
      granted_at: local.granted_at,
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  try {
    const res = await fetch(`${API_BASE}/api/v1/consent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        scopes,
        consent_version: PLACEHOLDER_VERSION,
        language,
      }),
    });
    if (!res.ok) throw new Error(`record ${res.status}`);
    const out = (await res.json()) as ConsentResponse;
    // Refresh the local copy with server-provided version.
    writeLocal({ ...local, consent_version: out.consent_version });
    return out;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Consent record failed; relying on local cache:', err);
    return null;
  }
}

/**
 * DPDP §13 right-to-deletion. Backend requires the literal confirm phrase
 * `"DELETE MY DATA"` and a valid JWT — anonymous deletion isn't possible
 * (the backend has no row to delete without a user_id).
 */
export async function deleteAllUserData(reason?: string): Promise<DeletionResponse | { error: string }> {
  if (!API_BASE) {
    // Demo mode — clear local caches, simulate the soft-delete window.
    writeLocal(null);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('asha-ai:user');
        localStorage.removeItem('asha-ai:sessions');
      } catch {
        /* noop */
      }
    }
    const now = new Date();
    const after = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const fakeDeletion: DeletionResponse = {
      deletion_id: `local-${crypto.randomUUID()}`,
      user_id: 'local',
      soft_deleted_at: now.toISOString(),
      hard_delete_after: after.toISOString(),
      affected_tables: ['localStorage'],
      audit_event: 'local_demo',
    };
    writeLocalDeletion({
      user_id: 'local',
      has_pending_deletion: true,
      soft_deleted_at: fakeDeletion.soft_deleted_at,
      hard_delete_after: fakeDeletion.hard_delete_after,
    });
    return fakeDeletion;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  try {
    const res = await fetch(`${API_BASE}/api/v1/user/data`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({
        reason: reason ?? null,
        confirm_phrase: 'DELETE MY DATA',
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        error:
          (body as { detail?: string })?.detail ?? `Deletion failed: ${res.status}`,
      };
    }
    const out = (await res.json()) as DeletionResponse;
    writeLocalDeletion({
      user_id: out.user_id,
      has_pending_deletion: true,
      soft_deleted_at: out.soft_deleted_at,
      hard_delete_after: out.hard_delete_after,
    });
    // Also clear the local consent cache — the user wants to start over.
    writeLocal(null);
    return out;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function fetchDeletionStatus(): Promise<DeletionStatus> {
  if (!API_BASE) return readLocalDeletion() ?? {
    user_id: 'local',
    has_pending_deletion: false,
    soft_deleted_at: null,
    hard_delete_after: null,
  };

  const headers = await authHeader();
  try {
    const res = await fetch(`${API_BASE}/api/v1/user/data/status`, { headers });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as DeletionStatus;
  } catch {
    return readLocalDeletion() ?? {
      user_id: 'unknown',
      has_pending_deletion: false,
      soft_deleted_at: null,
      hard_delete_after: null,
    };
  }
}

/* ──────────────── synchronous helpers (UI gate logic) ──────────────── */

/**
 * Quick local-only check used by the consent gate at app load. Returns true
 * when the user has accepted at least the required `triage_processing`
 * scope at the current policy version.
 */
export function hasLocalConsent(scope: ConsentScope = 'triage_processing'): boolean {
  const c = readLocal();
  if (!c) return false;
  if (c.consent_version !== PLACEHOLDER_VERSION) return false;
  return c.scopes.includes(scope);
}

export function readLocalConsentScopes(): ConsentScope[] {
  return readLocal()?.scopes ?? [];
}

/** Server status synthesised from local cache for offline mode. */
function localStatusFromStorage(): ConsentStatus {
  const c = readLocal();
  return {
    user_id: null,
    current_version: PLACEHOLDER_VERSION,
    granted_scopes: c?.scopes ?? [],
    needs_reprompt: !c || c.consent_version !== PLACEHOLDER_VERSION,
    last_granted_at: c?.granted_at ?? null,
    last_granted_version: c?.consent_version ?? null,
  };
}

export const CONSENT_VERSION = PLACEHOLDER_VERSION;
