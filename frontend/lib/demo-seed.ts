'use client';

/**
 * Demo seeder for the doctor cockpit. Populates localStorage with a small set
 * of synthetic triage sessions covering the three care levels, four risk
 * levels, and four trajectory states — so the verifier sees the new Plan 5.1
 * composite-sort + sparkline behaviour on first page load instead of having
 * to manually run six triages.
 *
 * Intentionally gated:
 *   - URL param `?seed=demo` triggers it (read by the doctor dashboard)
 *   - Or call `seedDoctorDemo({ force: true })` from the browser console
 *
 * NOT load-bearing for safety. Synthetic data only — no PHI.
 */

import type {
  CareLevel,
  Differential,
  RiskAssessment,
  RiskHistoryPoint,
  RiskLevel,
  RiskTrajectory,
  TriageResponse,
} from './types';

const SEEDED_FLAG = 'asha-ai:demo-seeded';
const SESSIONS_KEY = 'asha-ai:sessions';
const DEMO_USER_ID = 'demo-patient-pool';

interface SeedSpec {
  /** Stable id so re-seeding overwrites the same row instead of duplicating. */
  id: string;
  level: CareLevel;
  esi: 1 | 2 | 3 | 4 | 5;
  reasoning: string;
  redFlags: string[];
  riskScore: number;
  trajectory: RiskTrajectory;
  ageMinutesAgo: number;
  comorbidities: number;
  vitals: number;
  sx: number;
  ageFactor: number;
  differential?: Differential;
  /** Plan 5.1 — set true for cases where risk score escalated the verdict from a lower care level. */
  riskEscalated?: boolean;
}

const SPECS: SeedSpec[] = [
  {
    id: 'demo-er-elderly-cardiac',
    level: 'Emergency Room',
    esi: 2,
    reasoning:
      'Crushing retrosternal chest pain radiating to left arm + diaphoresis. Diabetic, hypertensive 68F. Red-flag: cardiac ischemia pattern.',
    redFlags: ['cardiac_ischemia_pattern'],
    riskScore: 92,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 4,
    comorbidities: 25,
    vitals: 25,
    sx: 60,
    ageFactor: 1.4,
    differential: {
      most_likely: [
        { name: 'Acute coronary syndrome', confidence: 0.74 },
        { name: 'Aortic dissection', confidence: 0.11 },
      ],
      expanded: [{ name: 'Pulmonary embolism', confidence: 0.08 }],
      cant_miss: [{ name: 'Tension pneumothorax', confidence: 0.04 }],
    },
  },
  {
    id: 'demo-er-pediatric-respiratory',
    level: 'Emergency Room',
    esi: 1,
    reasoning:
      '11-month infant, RR 62, lips dusky on inspection, mother reports lethargy >2h. Red-flag: pediatric respiratory failure.',
    redFlags: ['pediatric_respiratory_failure', 'cyanosis'],
    riskScore: 96,
    trajectory: 'worsening',
    ageMinutesAgo: 12,
    comorbidities: 0,
    vitals: 25,
    sx: 75,
    ageFactor: 1.8,
  },
  {
    id: 'demo-clinic-fever-worsening',
    level: 'Clinic Visit',
    esi: 3,
    reasoning:
      '38C fever × 3 days, joint pain, faint trunk rash. No red flags. Possible dengue cluster — see outbreak feed (Tier 5.4).',
    redFlags: [],
    riskScore: 58,
    trajectory: 'worsening',
    ageMinutesAgo: 26,
    comorbidities: 0,
    vitals: 0,
    sx: 50,
    ageFactor: 1.0,
    differential: {
      most_likely: [
        { name: 'Dengue fever', confidence: 0.42 },
        { name: 'Chikungunya', confidence: 0.21 },
      ],
      expanded: [{ name: 'Viral exanthem', confidence: 0.14 }],
      cant_miss: [{ name: 'Meningococcemia', confidence: 0.03 }],
    },
  },
  {
    id: 'demo-clinic-fever-stable',
    level: 'Clinic Visit',
    esi: 3,
    reasoning:
      '38.2C fever × 2 days, sore throat, no cough. Patient stable. Within-tier ordering puts this BELOW the worsening case above.',
    redFlags: [],
    riskScore: 41,
    trajectory: 'stable',
    ageMinutesAgo: 38,
    comorbidities: 0,
    vitals: 0,
    sx: 35,
    ageFactor: 1.0,
  },
  {
    id: 'demo-home-mild-improving',
    level: 'Home Care',
    esi: 4,
    reasoning:
      'Mild headache × 12h, responding to paracetamol. No red flags, no comorbidities, trajectory improving. Home care confirmed.',
    redFlags: [],
    riskScore: 18,
    trajectory: 'improving',
    ageMinutesAgo: 55,
    comorbidities: 0,
    vitals: 0,
    sx: 18,
    ageFactor: 1.0,
  },
  {
    id: 'demo-home-stable',
    level: 'Home Care',
    esi: 5,
    reasoning:
      'Sore throat × 1 day, mild. No fever, no red flags. Self-care + return precautions.',
    redFlags: [],
    riskScore: 12,
    trajectory: 'stable',
    ageMinutesAgo: 70,
    comorbidities: 0,
    vitals: 0,
    sx: 12,
    ageFactor: 1.0,
  },
  {
    id: 'demo-escalated-by-risk',
    level: 'Clinic Visit',
    esi: 3,
    reasoning:
      '72 M with diabetes + CKD, fatigue + low-grade fever × 48h, RR 27. No single rule fired, but composite risk crossed HIGH threshold → triage upgraded from Home to Clinic.',
    redFlags: [],
    riskScore: 64,
    trajectory: 'worsening',
    ageMinutesAgo: 18,
    comorbidities: 25,
    vitals: 10,
    sx: 35,
    ageFactor: 1.4,
    riskEscalated: true,
  },
];

const RISK_LEVEL: Record<RiskLevel | 'INTERNAL', string> = {
  CRITICAL: 'Go to emergency room now.',
  HIGH: 'See a doctor within 2 hours.',
  MODERATE: 'See a doctor within 24 hours.',
  LOW: 'Monitor at home — rest and hydrate.',
  INTERNAL: '',
};

function classifyLevel(score: number): RiskLevel {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MODERATE';
  return 'LOW';
}

/** Synthesise a 24-sample history that ends at riskScore and matches trajectory. */
function buildHistory(finalScore: number, trajectory: RiskTrajectory): RiskHistoryPoint[] {
  const points: RiskHistoryPoint[] = [];
  const now = Date.now();
  const samples = 24;
  const slopePerStep =
    trajectory === 'rapidly_worsening'
      ? 4
      : trajectory === 'worsening'
        ? 1.5
        : trajectory === 'improving'
          ? -1.2
          : 0;
  const start = Math.max(0, Math.min(100, finalScore - slopePerStep * (samples - 1)));
  for (let i = 0; i < samples; i++) {
    const noise = trajectory === 'stable' ? (Math.random() - 0.5) * 4 : (Math.random() - 0.5) * 2;
    const v = Math.max(0, Math.min(100, start + slopePerStep * i + noise));
    points.push({
      ts: new Date(now - (samples - 1 - i) * 60 * 60 * 1000).toISOString(),
      score: Math.round(v),
    });
  }
  // Force the last sample to match the spec exactly so the badge + sparkline align.
  points[points.length - 1].score = finalScore;
  return points;
}

function buildVerdict(spec: SeedSpec): TriageResponse {
  const level = classifyLevel(spec.riskScore);
  const risk: RiskAssessment = {
    score: spec.riskScore,
    level,
    trajectory: spec.trajectory,
    action: RISK_LEVEL[level],
    components: {
      symptoms: spec.sx,
      age_factor: spec.ageFactor,
      comorbidities: spec.comorbidities,
      vitals: spec.vitals,
    },
    computed_at: new Date(Date.now() - spec.ageMinutesAgo * 60_000).toISOString(),
  };
  return {
    level: spec.level,
    reasoning: spec.reasoning,
    disclaimer:
      'This is not a replacement for professional medical diagnosis. Please consult a qualified medical practitioner for any real medical concern.',
    red_flags: spec.redFlags,
    esi: spec.esi,
    confidence: 0.78,
    model_version: 'demo-seed-v1',
    differential: spec.differential,
    risk,
    risk_escalated: spec.riskEscalated ?? false,
  };
}

interface SeederOpts {
  force?: boolean;
  /** Override the seeded user id (defaults to a shared demo pool). */
  userId?: string;
}

/**
 * Idempotent: re-runs replace the same six rows by id. Returns the count seeded
 * (0 if skipped because already-seeded and `force` not set).
 */
export function seedDoctorDemo(opts: SeederOpts = {}): number {
  if (typeof window === 'undefined') return 0;
  const force = opts.force ?? false;
  if (!force && localStorage.getItem(SEEDED_FLAG)) return 0;

  const userId = opts.userId ?? DEMO_USER_ID;
  const raw = localStorage.getItem(SESSIONS_KEY);
  const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

  for (const spec of SPECS) {
    const verdict = buildVerdict(spec);
    const startedAt = Date.now() - spec.ageMinutesAgo * 60_000;
    all[spec.id] = {
      id: spec.id,
      userId,
      startedAt,
      endedAt: startedAt + 90_000,
      messages: [
        {
          id: `${spec.id}-u`,
          role: 'user',
          content: spec.reasoning.split('.')[0] + '.',
          timestamp: startedAt,
        },
        {
          id: `${spec.id}-a`,
          role: 'assistant',
          content: spec.reasoning,
          timestamp: startedAt + 90_000,
          verdict,
        },
      ],
      verdict,
      reviewedAt: null,
      riskHistory: buildHistory(spec.riskScore, spec.trajectory),
    };
  }

  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  localStorage.setItem(SEEDED_FLAG, new Date().toISOString());
  window.dispatchEvent(new CustomEvent('asha-ai:sessions-change'));
  return SPECS.length;
}

export function clearDoctorDemo(): void {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return;
  const all = JSON.parse(raw) as Record<string, unknown>;
  for (const spec of SPECS) delete all[spec.id];
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  localStorage.removeItem(SEEDED_FLAG);
  window.dispatchEvent(new CustomEvent('asha-ai:sessions-change'));
}
