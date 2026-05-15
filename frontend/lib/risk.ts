import type {
  CareLevel,
  RiskAssessment,
  RiskComponents,
  RiskComputeRequest,
  RiskHistoryPoint,
  RiskLevel,
  RiskTrajectory,
  TriageResponse,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

/* ──────────────── public API ──────────────── */

export async function computeRisk(req: RiskComputeRequest): Promise<RiskAssessment> {
  if (!API_BASE) return mockComputeRisk(req);
  // Same hard-timeout reasoning as postTriage — never let a stalled backend
  // hang the verdict path forever. 8s is enough; risk is a fast endpoint.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${API_BASE}/api/v1/risk/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Risk API returned ${res.status}`);
    return (await res.json()) as RiskAssessment;
  } catch (err) {
    console.warn('Risk API failed/timed out, falling back to mock:', err);
    return mockComputeRisk(req);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Composite priority for doctor queue sort. Higher = more urgent.
 * Combines ESI (1=most urgent…5=least) with the dynamic risk score.
 *  - ESI weight: dominant — clinical protocol takes precedence
 *  - Risk weight: secondary — breaks ties between same-ESI cases
 *
 * Score domain: 0–600. ER (ESI 1–2) lands 400+, Clinic 200–400, Home <200.
 */
export function compositePriority(verdict: TriageResponse | null | undefined): number {
  if (!verdict) return 0;
  const esi = verdict.esi ?? esiFromLevel(verdict.level);
  const esiWeight = (6 - esi) * 100; // ESI 1→500, 5→100
  const riskWeight = verdict.risk?.score ?? 0; // 0–100
  return esiWeight + riskWeight;
}

function esiFromLevel(level: TriageResponse['level']): 1 | 2 | 3 | 4 | 5 {
  if (level === 'Emergency Room') return 2;
  if (level === 'Clinic Visit') return 3;
  return 4;
}

/* ──────────────── deterministic mock ──────────────── */

/**
 * Mock risk scoring used when no backend is reachable. Mirrors the backend
 * logic at app/risk/scoring.py so the demo behaves consistently in both modes.
 * Weights are anchored to ESI v5 + WHO IMCI severity guidance — full rationale
 * lives in docs/METHODOLOGY.md when Role D writes it.
 */
function mockComputeRisk(req: RiskComputeRequest): Promise<RiskAssessment> {
  const symScore = symptomScore(req.symptoms);
  const ageMult = ageMultiplier(req.age);
  const comScore = comorbidityScore(req.comorbidities ?? []);
  const vitScore = vitalScore(req.vital_proxy);

  const raw = symScore * ageMult + comScore + vitScore;
  const baseScore = Math.min(Math.round(raw), 100);

  const trajectory = computeTrajectory(req.history ?? []);
  const trajMult = trajectoryMultiplier(trajectory);
  const score = Math.min(Math.round(baseScore * trajMult), 100);

  const { level, action } = classify(score);

  const components: RiskComponents = {
    symptoms: Math.round(symScore),
    age_factor: Number(ageMult.toFixed(2)),
    comorbidities: Math.round(comScore),
    vitals: Math.round(vitScore),
  };

  return Promise.resolve({
    score,
    level,
    trajectory,
    action,
    components,
    computed_at: new Date().toISOString(),
  });
}

const SYMPTOM_BASE: Record<string, number> = {
  fever: 20,
  high_fever: 35,
  chest_pain: 45,
  difficulty_breathing: 50,
  shortness_of_breath: 50,
  severe_headache: 35,
  vomiting: 15,
  diarrhea: 10,
  cough: 12,
  fatigue: 8,
  joint_pain: 15,
  rash: 20,
  confusion: 55,
  loss_of_consciousness: 90,
  neck_stiffness: 60,
  blueness_lips: 85,
  abdominal_pain: 18,
  dizziness: 12,
  bleeding: 40,
};

function symptomScore(symptoms: RiskComputeRequest['symptoms']): number {
  let total = 0;
  for (const s of symptoms) {
    const key = s.name.toLowerCase().replace(/\s+/g, '_');
    const base = SYMPTOM_BASE[key] ?? 10;
    const sev = Math.max(1, Math.min(10, s.severity));
    const sevFactor = Math.pow(sev / 10, 0.7) * 1.5;
    let timeFactor = 1.0;
    if (s.onset_hours_ago < 6) timeFactor = 1.3;
    else if (s.onset_hours_ago < 24) timeFactor = 1.1;
    else if (s.onset_hours_ago >= 72) timeFactor = 0.85;
    total += base * sevFactor * timeFactor;
  }
  return Math.min(total, 100);
}

function ageMultiplier(age: number): number {
  if (age < 2) return 1.8;
  if (age < 5) return 1.5;
  if (age < 12) return 1.2;
  if (age < 60) return 1.0;
  if (age < 75) return 1.4;
  return 1.8;
}

const COMORBIDITY_SCORE: Record<string, number> = {
  diabetes: 15,
  hypertension: 10,
  heart_disease: 20,
  asthma: 12,
  copd: 18,
  immunocompromised: 25,
  pregnancy: 20,
  malnutrition: 15,
  hiv: 20,
};

function comorbidityScore(items: string[]): number {
  const total = items.reduce(
    (acc, c) => acc + (COMORBIDITY_SCORE[c.toLowerCase().replace(/\s+/g, '_')] ?? 0),
    0,
  );
  return Math.min(total, 30);
}

function vitalScore(v?: RiskComputeRequest['vital_proxy']): number {
  if (!v) return 0;
  let score = 0;
  if (typeof v.breathing_rate === 'number') {
    if (v.breathing_rate > 30 || v.breathing_rate < 10) score += 25;
    else if (v.breathing_rate > 25) score += 10;
  }
  if (typeof v.heart_rate === 'number') {
    if (v.heart_rate > 130 || v.heart_rate < 45) score += 20;
    else if (v.heart_rate > 110) score += 8;
  }
  return score;
}

export function computeTrajectory(history: RiskHistoryPoint[]): RiskTrajectory {
  if (history.length < 2) return 'insufficient_data';
  const scores = history.map((p) => p.score);
  const n = scores.length;
  const xs = scores.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = scores.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * scores[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  if (slope > 3) return 'rapidly_worsening';
  if (slope > 0.5) return 'worsening';
  if (slope > -0.5) return 'stable';
  return 'improving';
}

function trajectoryMultiplier(t: RiskTrajectory): number {
  switch (t) {
    case 'rapidly_worsening':
      return 1.3;
    case 'worsening':
      return 1.15;
    case 'improving':
      return 0.9;
    default:
      return 1.0;
  }
}

function classify(score: number): { level: RiskLevel; action: string } {
  if (score >= 70) return { level: 'CRITICAL', action: 'Go to emergency room now.' };
  if (score >= 50) return { level: 'HIGH', action: 'See a doctor within 2 hours.' };
  if (score >= 30) return { level: 'MODERATE', action: 'See a doctor within 24 hours.' };
  return { level: 'LOW', action: 'Monitor at home — rest and hydrate.' };
}

/* ──────────────── safety property: escalate-only ──────────────── */

/**
 * Apply the Plan 5.1 safety property: risk score can only escalate the verdict
 * (Home Care → Clinic Visit, Clinic Visit → Emergency Room), never downgrade.
 * An existing red-flag-driven Emergency Room verdict is NEVER overridden.
 */
export function escalateCareLevel(
  current: CareLevel,
  risk: RiskAssessment,
): CareLevel {
  if (current === 'Emergency Room') return current;
  if (risk.level === 'CRITICAL') return 'Emergency Room';
  if (risk.level === 'HIGH' && current === 'Home Care') return 'Clinic Visit';
  return current;
}

/* ──────────────── client-side risk inference (mock-mode UX) ──────────────── */

/**
 * Cheap heuristic that scans free-text input for symptom + comorbidity keywords
 * and returns a RiskComputeRequest. Used to populate the dynamic-risk sparkline
 * on the doctor cockpit when the backend hasn't enriched the verdict with a
 * `risk` field (mock mode, or older Plan 4.0 backend).
 *
 * NOT load-bearing for safety — the deterministic 9-rule red-flag layer
 * remains the safety floor.
 */
export function inferRiskInputsFromText(
  text: string,
  age = 35,
  sex: 'M' | 'F' | 'other' = 'other',
): RiskComputeRequest {
  const lower = text.toLowerCase();
  const symptoms: RiskComputeRequest['symptoms'] = [];

  for (const key of Object.keys(SYMPTOM_BASE)) {
    const phrase = key.replace(/_/g, ' ');
    if (lower.includes(phrase)) {
      const severity = /\b(severe|crushing|worst|extreme|unbearable)\b/.test(lower)
        ? 9
        : /\b(mild|slight|little)\b/.test(lower)
          ? 4
          : 6;
      symptoms.push({ name: key, severity, onset_hours_ago: 6 });
    }
  }
  if (symptoms.length === 0) {
    symptoms.push({ name: 'fatigue', severity: 4, onset_hours_ago: 24 });
  }

  const comorbidities: string[] = [];
  for (const c of Object.keys(COMORBIDITY_SCORE)) {
    if (lower.includes(c.replace(/_/g, ' '))) comorbidities.push(c);
  }

  return { symptoms, age, sex, comorbidities };
}

/**
 * If the verdict already carries a `risk` block (backend Plan 5.1+), use it.
 * Otherwise compute one locally so the cockpit sparkline always has data.
 */
export async function ensureRisk(
  verdict: TriageResponse,
  inputText: string,
  opts: { age?: number; sex?: 'M' | 'F' | 'other'; history?: RiskHistoryPoint[] } = {},
): Promise<RiskAssessment> {
  if (verdict.risk) return verdict.risk;
  const req = inferRiskInputsFromText(inputText, opts.age ?? 35, opts.sex ?? 'other');
  req.history = opts.history ?? [];
  return computeRisk(req);
}
