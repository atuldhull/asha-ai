import {
  type CareLevel,
  type MentalHealthHelpline,
  type TriageRequest,
  type TriageResponse,
  type VoiceTranscribeResponse,
  DISCLAIMER,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

/**
 * Calls the backend triage endpoint, OR returns a deterministic mock if
 * NEXT_PUBLIC_API_BASE is not set. This lets the frontend be developed
 * and demoed standalone before Role B's backend is ready.
 */
export async function postTriage(req: TriageRequest): Promise<TriageResponse> {
  if (!API_BASE) {
    return mockTriage(req);
  }

  // Hard timeout. A backend that's unreachable, cold-starting (Render free
  // tier sleeps after 15 min idle), or stalled would otherwise hang `fetch`
  // FOREVER — a stalled connection never throws, so the catch below would
  // never fire → infinite "Analyzing…" spinner. Abort after 15s and fall
  // back to the deterministic keyword mock so the UI ALWAYS resolves.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API_BASE}/api/v1/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Triage API returned ${res.status}`);
    }

    return (await res.json()) as TriageResponse;
  } catch (err) {
    console.error('Triage API failed/timed out, falling back to mock:', err);
    return mockTriage(req);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mock triage logic for when no backend is connected.
 * Maps common keyword patterns to one of the three care levels.
 * Used for: development without backend, demo fallback, offline scenarios.
 */
function mockTriage(req: TriageRequest): Promise<TriageResponse> {
  const text = req.symptoms.toLowerCase();

  // Emergency keywords (any of these → ER)
  const emergencyKeywords = [
    'chest pain', 'cant breathe', "can't breathe", 'difficulty breathing',
    'shortness of breath', 'face droop', 'arm weak', 'arm numb',
    'slurred speech', 'severe headache', 'unconscious', 'fainted',
    'heavy bleeding', 'vomiting blood', 'coughing blood',
    'suicide', 'kill myself', 'end my life',
    'allergic reaction', 'anaphylaxis', 'throat swelling',
    'severe pain', 'crushing pain', 'sweating profusely',
    'high fever child', 'lethargic child', 'fever 40',
    'diabetic ketoacidosis', 'fruity breath',
  ];

  // Clinic visit keywords (moderate concerns)
  const clinicKeywords = [
    'persistent cough', 'cough for weeks', 'cough 3 weeks',
    'urinary', 'burning urine', 'uti',
    'recurring headache', 'migraine',
    'mild asthma', 'wheezing', 'inhaler',
    'fever 38', 'fever for days',
    'skin infection', 'rash spreading',
    'back pain new', 'sprain', 'twisted',
    'stomach pain', 'abdominal pain',
    'diarrhea', 'vomiting',
    'ear pain', 'sore throat', 'sinus',
  ];

  let level: CareLevel = 'Home Care';
  const matchedKeywords: string[] = [];

  for (const kw of emergencyKeywords) {
    if (text.includes(kw)) {
      level = 'Emergency Room';
      matchedKeywords.push(kw);
      break;
    }
  }

  if (level === 'Home Care') {
    for (const kw of clinicKeywords) {
      if (text.includes(kw)) {
        level = 'Clinic Visit';
        matchedKeywords.push(kw);
        break;
      }
    }
  }

  // Build reasoning text
  let reasoning: string;
  if (level === 'Emergency Room') {
    reasoning = `Detected emergency-level signs: ${matchedKeywords.join(', ')}. Please seek immediate medical attention. If in India, call 108 for an ambulance.`;
  } else if (level === 'Clinic Visit') {
    reasoning = `Detected symptoms suggesting professional consultation: ${matchedKeywords.join(', ')}. Please book a doctor's appointment within 24-48 hours.`;
  } else {
    reasoning = `Symptoms appear mild and likely manageable at home with rest and hydration. Monitor for worsening — if symptoms persist beyond 48 hours or get worse, escalate to a clinic visit.`;
  }

  // Simulate latency for realism (200-600ms)
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          level,
          reasoning,
          red_flags: matchedKeywords,
          disclaimer: DISCLAIMER,
        }),
      200 + Math.random() * 400
    );
  });
}

/**
 * Backend health check. Returns true if backend is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export function isUsingMock(): boolean {
  return !API_BASE;
}

// ---------------------------------------------------------------------------
// Naming aliases — keep this file resilient to either naming convention.
// Some files import `triage`, others `postTriage`. Both point to the same fn.
// ---------------------------------------------------------------------------
export const triage = postTriage;

// ---------------------------------------------------------------------------
// Plan 3.0 endpoints (voice + helplines + profile language sync)
// ---------------------------------------------------------------------------

/**
 * POST audio to Bhashini-backed `/api/v1/voice/transcribe` via the Next.js
 * Edge proxy. Returns the English transcript (use as triage input) and the
 * verdict already computed server-side.
 *
 * Throws if the backend isn't configured for voice (503).
 */
export async function voiceTranscribe(
  blob: Blob,
  lang: 'en' | 'hi' | 'kn' = 'en',
  authToken?: string,
): Promise<VoiceTranscribeResponse> {
  const fd = new FormData();
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'wav';
  fd.append('audio', blob, `audio.${ext}`);
  fd.append('lang', lang);
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, headers });
  if (!res.ok) throw new Error(`Voice transcribe failed: ${res.status}`);
  return (await res.json()) as VoiceTranscribeResponse;
}

/**
 * Persist the user's preferred language to Supabase via the backend.
 * Silently no-ops when the backend isn't configured — the frontend's
 * localStorage copy is the source of truth in demo mode.
 */
export async function setLanguagePreference(
  lang: 'en' | 'hi' | 'kn',
  authToken: string,
): Promise<void> {
  if (!API_BASE || !authToken) return;
  try {
    await fetch(`${API_BASE}/api/v1/profile/language`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ language: lang }),
    });
  } catch (err) {
    console.warn('Failed to sync language preference', err);
  }
}

/**
 * Fetch the canonical helpline directory from backend's
 * `/api/v1/mental-health-check`. Anonymous-friendly (no auth required).
 *
 * Returns null when the backend isn't reachable — the frontend has hardcoded
 * fallback helplines in MentalHealthScreen for that case.
 */
export async function fetchMentalHealthHelplines(): Promise<MentalHealthHelpline[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/mental-health-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { helplines?: MentalHealthHelpline[] };
    return data?.helplines ?? null;
  } catch {
    return null;
  }
}
