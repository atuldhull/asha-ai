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
 * Deterministic client-side triage engine — used when no backend is wired
 * (NEXT_PUBLIC_API_BASE empty) OR the backend is unreachable / timed out.
 *
 * This is NOT a toy keyword list. It mirrors the backend's 9 deterministic
 * red-flag rules (R1–R9, from docs/RED_FLAGS.md — ESI v5 + WHO IMCI + AHA
 * stroke-FAST grounding) plus a graded severity tier for the non-emergency
 * band. Same input → same output (deterministic, no random) so results are
 * trustworthy and relatable. Reasoning echoes the patient's own words +
 * cites the rule that fired, exactly like the real engine.
 *
 * Safety property preserved: rules can only ESCALATE. A red-flag match
 * always wins over the severity tier — never the reverse.
 */
function mockTriage(req: TriageRequest): Promise<TriageResponse> {
  const raw = req.symptoms.trim();
  const t = ` ${raw.toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ')} `;
  const has = (...phrases: string[]) => phrases.some((p) => t.includes(` ${p} `) || t.includes(`${p} `) || t.includes(` ${p}`));
  const cite: string[] = [];

  // ── The 9 deterministic red-flag rules (any one → Emergency Room) ──
  type Rule = { id: string; name: string; hit: boolean };
  const rules: Rule[] = [
    {
      id: 'R1_STEMI', name: 'Acute coronary syndrome (cardiac chest pain)',
      hit: has('chest pain', 'chest pressure', 'chest tightness', 'crushing', 'elephant on chest', 'tight chest')
        && has('left arm', 'jaw', 'sweating', 'sweaty', 'short of breath', 'breathless', 'shortness of breath', 'nausea', 'radiating', 'clammy')
        || has('heart attack'),
    },
    {
      id: 'R2_STROKE', name: 'Stroke — FAST positive',
      hit: has('face droop', 'facial droop', 'face is drooping', 'mouth droop', 'one side of face',
        'arm weak', 'arm weakness', 'cant lift arm', 'cannot lift arm', 'one side weak', 'weakness one side',
        'slurred speech', 'cant speak', 'cannot speak', 'speech difficulty', 'words coming out wrong',
        'sudden numbness', 'face numb', 'vision loss one eye', 'worst headache of my life', 'thunderclap'),
    },
    {
      id: 'R3_ANAPHYLAXIS', name: 'Anaphylaxis — airway compromise',
      hit: has('throat closing', 'throat swelling', 'tongue swelling', 'lips swelling', 'cant swallow', 'cannot swallow',
        'difficulty swallowing', 'hives all over', 'anaphylaxis', 'allergic reaction')
        && has('breath', 'breathing', 'wheez', 'dizzy', 'swelling', 'closing')
        || has('throat is closing', 'tongue is swelling'),
    },
    {
      id: 'R4_SEPSIS', name: 'Sepsis — systemic infection with instability',
      hit: has('high fever', 'fever') &&
        has('confused', 'confusion', 'not making sense', 'drowsy', 'cold hands', 'mottled', 'blue lips',
          'rapid breathing', 'fast heart', 'shaking chills', 'rigors', 'cant stay awake', 'unresponsive'),
    },
    {
      id: 'R5_SUICIDAL', name: 'Suicidal ideation / self-harm',
      hit: has('suicide', 'kill myself', 'end my life', 'want to die', 'harm myself', 'self harm',
        'no reason to live', 'better off dead', 'take all the pills', 'goodbye notes'),
    },
    {
      id: 'R6_PEDIATRIC', name: 'Pediatric critical (WHO IMCI danger sign)',
      hit: (has('baby', 'infant', 'newborn', 'child', 'toddler', 'months old', 'year old')) &&
        has('not breathing', 'blue', 'limp', 'floppy', 'seizure', 'convulsion', 'not waking', 'unresponsive',
          'gasping', 'ribs sucking', 'sunken eyes', 'not feeding', 'cant drink', 'vomiting everything'),
    },
    {
      id: 'R7_GI_BLEED', name: 'GI haemorrhage / surgical abdomen',
      hit: has('vomiting blood', 'vomited blood', 'blood in vomit', 'coughing blood', 'black stool', 'tarry stool',
        'blood in stool', 'rigid abdomen', 'board like abdomen', 'cannot pass gas')
        || (has('severe', 'severe abdominal', 'severe stomach') && has('blood', 'rigid', 'cannot bear touch')),
    },
    {
      id: 'R8_MENINGITIS', name: 'Meningitis — stiff neck + fever',
      hit: has('stiff neck', 'neck stiffness', 'cant touch chin to chest', 'neck rigid') &&
        has('fever', 'headache', 'light hurts', 'photophobia', 'rash', 'vomiting', 'confused'),
    },
    {
      id: 'R9_TRAUMA', name: 'Major trauma / critical injury',
      hit: has('head injury', 'unconscious', 'knocked out', 'fell from', 'road accident', 'rta',
        'cannot move legs', 'cannot move arms', 'snake bite', 'snakebite', 'electric shock',
        'heavy bleeding', 'severe bleeding', 'deep cut', 'bleeding wont stop', 'drowning'),
    },
  ];

  const fired = rules.find((r) => r.hit);
  if (fired) {
    cite.push(`${fired.id} · ${fired.name}`);
    return resolveVerdict(
      'Emergency Room',
      `Based on what you described — "${truncate(raw, 140)}" — this matches ${fired.name} ` +
        `(rule ${fired.id}). This needs immediate in-person emergency care. ` +
        `In India, call 108 for an ambulance now, or go to the nearest emergency room. ` +
        `Do not wait. This tool assists, it does not diagnose — but these signs should never be managed at home.`,
      cite,
    );
  }

  // ── No red flag → graded severity tier (Clinic Visit vs Home Care) ──
  let score = 0;
  const signals: string[] = [];
  const add = (cond: boolean, pts: number, label: string) => {
    if (cond) { score += pts; signals.push(label); }
  };

  add(has('fever', 'temperature', 'bukhar'), 2, 'fever');
  add(has('high fever', '103', '104', '40 degree', '39 degree'), 2, 'high-grade fever');
  add(has('for days', 'several days', 'three days', '3 days', 'a week', 'weeks', 'persistent', 'not going away', 'kal se', 'since yesterday'), 2, 'persistent / multi-day course');
  add(has('cough', 'khasi'), 1, 'cough');
  add(has('blood', 'bleeding'), 3, 'bleeding mentioned');
  add(has('vomiting', 'vomit', 'throwing up', 'ulti'), 2, 'vomiting');
  add(has('diarrhea', 'loose motion', 'dast'), 2, 'diarrhoea');
  add(has('severe', 'unbearable', 'worst', 'very bad', 'intense', 'extreme'), 3, 'severe intensity');
  add(has('pain'), 1, 'pain');
  add(has('breathless', 'short of breath', 'difficulty breathing', 'wheezing', 'breathing problem'), 3, 'breathing difficulty');
  add(has('dizzy', 'dizziness', 'lightheaded', 'fainting', 'chakkar'), 2, 'dizziness');
  add(has('dehydrated', 'cant keep fluids', 'not urinating', 'no urine', 'sunken'), 3, 'possible dehydration');
  add(has('rash', 'spreading rash', 'skin'), 1, 'skin/rash');
  add(has('urinary', 'burning urine', 'uti', 'painful urination'), 2, 'urinary symptoms');
  add(has('pregnant', 'pregnancy'), 3, 'pregnancy context');
  add(has('diabetic', 'diabetes', 'sugar'), 2, 'diabetes context');
  add(has('headache', 'sir dard'), 1, 'headache');
  add(has('injury', 'sprain', 'twisted', 'fell', 'fall', 'hurt my'), 2, 'injury');
  add(has('mild', 'slight', 'a little', 'minor', 'just started'), -2, 'patient describes it as mild');
  add(raw.split(/\s+/).length <= 2, -1, 'very brief description');

  let level: CareLevel;
  let reasoning: string;
  if (score >= 5) {
    level = 'Clinic Visit';
    reasoning =
      `Based on what you described — "${truncate(raw, 140)}" — your symptoms (${signals.join(', ')}) ` +
      `warrant a doctor's assessment within the next 24–48 hours. They aren't immediately ` +
      `life-threatening, but they shouldn't be left unmanaged. Visit a clinic or PHC; ` +
      `seek emergency care sooner if anything rapidly worsens (severe pain, breathing trouble, ` +
      `confusion, or bleeding). This is decision support — a registered practitioner makes the diagnosis.`;
  } else if (score >= 2) {
    level = 'Clinic Visit';
    reasoning =
      `Based on what you described — "${truncate(raw, 140)}" — there are symptoms (${signals.join(', ') || 'mild concerns'}) ` +
      `that are worth a non-urgent doctor's visit in the next 1–2 days, especially if they don't ` +
      `improve. Monitor closely; escalate to emergency care if you develop severe pain, ` +
      `breathlessness, persistent vomiting, or confusion.`;
  } else {
    level = 'Home Care';
    reasoning =
      `Based on what you described — "${truncate(raw, 140)}" — the symptoms appear mild and are ` +
      `usually manageable at home with rest, fluids, and over-the-counter symptom relief. ` +
      `There are no emergency red-flag signs in what you reported. Re-run triage or see a ` +
      `doctor if it persists beyond 48 hours, gets worse, or new symptoms appear (high fever, ` +
      `severe pain, breathing difficulty, bleeding).`;
  }

  return resolveVerdict(level, reasoning, signals.length ? signals : ['no red-flag signs detected']);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function resolveVerdict(
  level: CareLevel,
  reasoning: string,
  red_flags: string[],
): Promise<TriageResponse> {
  // Small fixed latency so the "Analyzing…" state is visible but never long.
  return new Promise((resolve) => {
    setTimeout(
      () => resolve({ level, reasoning, red_flags, disclaimer: DISCLAIMER }),
      350
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
