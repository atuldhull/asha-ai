'use client';

/**
 * Demo seeder for the doctor cockpit. Populates localStorage with 31 synthetic
 * triage sessions — the top well-known presentations across all three care
 * levels, four risk tiers and four trajectory states, six of them arriving via
 * the 3D body map — so a demo shows a full, realistic queue (with symptoms +
 * self-care from the condition KB on every card) instead of an empty cockpit.
 *
 * Intentionally gated:
 *   - URL param `?seed=demo` triggers it (read by the doctor dashboard)
 *   - The "Load 30 demo cases" button on the empty cockpit
 *   - Or call `seedDoctorDemo({ force: true })` from the browser console
 *
 * NOT load-bearing for safety. Synthetic data only — no PHI.
 */

import type {
  CareLevel,
  Differential,
  InputMode,
  RiskAssessment,
  RiskHistoryPoint,
  RiskLevel,
  RiskTrajectory,
  TriageResponse,
} from './types';
import { conditionById } from './conditions';

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
  /** Links to the pre-fed condition KB so the seeded verdict carries
   *  symptoms + self-care/treatment, exactly like a live verdict. */
  conditionId?: string;
  /** Origin chip shown on the doctor cockpit (chat vs 3D body map). */
  inputMode?: InputMode;
  /** Patient's chief complaint / pin summary shown as the first message.
   *  For body-map cases this reads like the 3D pin summary string. */
  chiefComplaint?: string;
}

const SPECS: SeedSpec[] = [
  /* ─────────────── Emergency Room (12) ─────────────── */
  {
    id: 'demo-acs',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'acs',
    chiefComplaint:
      'Crushing chest pressure for 40 minutes, spreading to my left arm and jaw, cold sweat and breathless.',
    reasoning:
      'Crushing retrosternal chest pain radiating to left arm + diaphoresis in a 68F diabetic, hypertensive. Red-flag R1: acute coronary syndrome pattern. Time-critical — 108 dispatched.',
    redFlags: ['cardiac_ischemia_pattern'],
    riskScore: 93,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 3,
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
    id: 'demo-stroke',
    level: 'Emergency Room',
    esi: 1,
    conditionId: 'stroke',
    chiefComplaint:
      'My father’s face suddenly drooped on one side, his speech is slurred and his right arm is weak — started 30 min ago.',
    reasoning:
      'FAST-positive: unilateral facial droop, slurred speech, right arm weakness, onset ~30 min. Red-flag R2: acute stroke. Within thrombolysis window — note exact onset time.',
    redFlags: ['stroke_fast_positive'],
    riskScore: 95,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 6,
    comorbidities: 15,
    vitals: 20,
    sx: 70,
    ageFactor: 1.4,
    differential: {
      most_likely: [
        { name: 'Acute ischaemic stroke', confidence: 0.71 },
        { name: 'Intracerebral haemorrhage', confidence: 0.18 },
      ],
      cant_miss: [{ name: 'Hypoglycaemia mimic', confidence: 0.05 }],
    },
  },
  {
    id: 'demo-anaphylaxis',
    level: 'Emergency Room',
    esi: 1,
    conditionId: 'anaphylaxis',
    chiefComplaint:
      'Stung by a bee, now my throat feels tight, lips swelling and I’m wheezing and dizzy.',
    reasoning:
      'Rapid lip/throat swelling, wheeze and dizziness minutes after a bee sting. Red-flag R3: anaphylaxis with airway compromise. IM adrenaline indicated.',
    redFlags: ['anaphylaxis_airway'],
    riskScore: 90,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 9,
    comorbidities: 0,
    vitals: 22,
    sx: 65,
    ageFactor: 1.0,
  },
  {
    id: 'demo-urosepsis',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'sepsis',
    chiefComplaint:
      'High fever with shaking chills for two days, now confused, breathing fast and passing very little urine.',
    reasoning:
      'Fever + rigors + new confusion + tachypnoea + oliguria in a 70M. Likely urosepsis. Red-flag R4: sepsis with end-organ signs. Needs IV antibiotics + fluids urgently.',
    redFlags: ['sepsis_organ_dysfunction'],
    riskScore: 88,
    trajectory: 'worsening',
    ageMinutesAgo: 14,
    comorbidities: 20,
    vitals: 22,
    sx: 55,
    ageFactor: 1.4,
    differential: {
      most_likely: [
        { name: 'Urosepsis', confidence: 0.58 },
        { name: 'Pneumonia with sepsis', confidence: 0.19 },
      ],
      cant_miss: [{ name: 'Meningococcaemia', confidence: 0.04 }],
    },
  },
  {
    id: 'demo-peds-respiratory',
    level: 'Emergency Room',
    esi: 1,
    conditionId: 'pediatric-danger',
    chiefComplaint:
      '11-month-old, breathing very fast with ribs sucking in, lips look dusky and not feeding since morning.',
    reasoning:
      '11-month infant, RR 62, chest indrawing, perioral cyanosis, refusing feeds, lethargic >2h. WHO IMCI danger signs. Red-flag R6: paediatric respiratory failure.',
    redFlags: ['pediatric_respiratory_failure', 'cyanosis'],
    riskScore: 96,
    trajectory: 'worsening',
    ageMinutesAgo: 11,
    comorbidities: 0,
    vitals: 25,
    sx: 75,
    ageFactor: 1.8,
  },
  {
    id: 'demo-gi-bleed',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'gi-bleed',
    chiefComplaint:
      'Vomited fresh blood twice and passing black tarry stools, feeling faint and cold.',
    reasoning:
      'Haematemesis + melaena with presyncope in a 54M on regular NSAIDs. Red-flag R7: upper GI haemorrhage. Nil by mouth, urgent endoscopy pathway.',
    redFlags: ['gi_haemorrhage'],
    riskScore: 85,
    trajectory: 'worsening',
    ageMinutesAgo: 21,
    comorbidities: 10,
    vitals: 20,
    sx: 55,
    ageFactor: 1.2,
  },
  {
    id: 'demo-meningitis',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'meningitis',
    chiefComplaint:
      'Severe headache, high fever, stiff neck and light hurts my eyes since this morning.',
    reasoning:
      '19M with fever, photophobia, neck rigidity and a non-blanching rash. Red-flag R8: meningitis. Empirical antibiotics must not be delayed.',
    redFlags: ['meningitis_pattern'],
    riskScore: 87,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 17,
    comorbidities: 0,
    vitals: 18,
    sx: 60,
    ageFactor: 1.1,
  },
  {
    id: 'demo-rta-trauma',
    level: 'Emergency Room',
    esi: 1,
    conditionId: 'trauma',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Head: intensity 9/10 (throbbing), just started. Right forearm: intensity 8/10 (stabbing), just started. Chest (centre): intensity 6/10 (pressure), just started.',
    reasoning:
      'Two-wheeler road accident: head injury with brief LOC, deformed right forearm, chest wall pain. Red-flag R9: major trauma. Spinal precautions + 108 trauma transfer.',
    redFlags: ['major_trauma', 'head_injury_loc'],
    riskScore: 92,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 8,
    comorbidities: 0,
    vitals: 22,
    sx: 70,
    ageFactor: 1.1,
  },
  {
    id: 'demo-snakebite',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'snakebite',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Right ankle: intensity 8/10 (burning), just started. Right calf: intensity 6/10 (cramping), just started.',
    reasoning:
      'Snakebite to the right ankle while working in the field 40 min ago; local swelling tracking up the calf, drooping eyelids developing. Red-flag R9: envenomation — antivenom-capable facility.',
    redFlags: ['snakebite_envenomation'],
    riskScore: 81,
    trajectory: 'worsening',
    ageMinutesAgo: 13,
    comorbidities: 0,
    vitals: 16,
    sx: 60,
    ageFactor: 1.0,
  },
  {
    id: 'demo-heat-stroke',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'heat-illness',
    chiefComplaint:
      'Collapsed working in the sun, skin hot and dry, confused and not making sense.',
    reasoning:
      'Field labourer, ~43°C ambient: hot dry skin, altered sensorium, core temp very high. Heat stroke — aggressive cooling + 108.',
    redFlags: ['heat_stroke_cns'],
    riskScore: 79,
    trajectory: 'worsening',
    ageMinutesAgo: 24,
    comorbidities: 0,
    vitals: 20,
    sx: 55,
    ageFactor: 1.2,
  },
  {
    id: 'demo-dengue-warning',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'dengue',
    chiefComplaint:
      'Day 5 of dengue, fever dropped but now severe stomach pain, vomiting and bleeding gums.',
    reasoning:
      'Defervescence-phase dengue with warning signs: severe abdominal pain, persistent vomiting, mucosal bleeding. Risk of plasma leak/DSS — needs in-patient monitoring.',
    redFlags: ['dengue_warning_signs'],
    riskScore: 76,
    trajectory: 'rapidly_worsening',
    ageMinutesAgo: 31,
    comorbidities: 0,
    vitals: 16,
    sx: 58,
    ageFactor: 1.1,
    differential: {
      most_likely: [{ name: 'Dengue with warning signs', confidence: 0.69 }],
      cant_miss: [{ name: 'Dengue shock syndrome', confidence: 0.12 }],
    },
  },
  {
    id: 'demo-dka',
    level: 'Emergency Room',
    esi: 2,
    conditionId: 'diabetes',
    chiefComplaint:
      'Known diabetic, vomiting since last night, breathing fast and deep, very drowsy with fruity breath.',
    reasoning:
      'Type 1 diabetic, missed insulin: vomiting, Kussmaul breathing, ketotic breath, drowsy. Diabetic ketoacidosis — IV fluids + insulin protocol.',
    redFlags: ['dka_pattern'],
    riskScore: 84,
    trajectory: 'worsening',
    ageMinutesAgo: 19,
    comorbidities: 20,
    vitals: 22,
    sx: 55,
    ageFactor: 1.1,
  },

  /* ─────────────── Clinic Visit (12) ─────────────── */
  {
    id: 'demo-malaria',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'malaria',
    chiefComplaint:
      'Fever with shaking chills every alternate day for a week, then heavy sweating, with headache and body ache.',
    reasoning:
      'Cyclical fever with rigors and sweats × 7 days in a malaria-endemic district. Needs same-day RDT/smear and species-directed antimalarials.',
    redFlags: [],
    riskScore: 58,
    trajectory: 'worsening',
    ageMinutesAgo: 27,
    comorbidities: 0,
    vitals: 8,
    sx: 48,
    ageFactor: 1.0,
    differential: {
      most_likely: [
        { name: 'Malaria', confidence: 0.55 },
        { name: 'Enteric fever', confidence: 0.17 },
      ],
      expanded: [{ name: 'Dengue', confidence: 0.12 }],
    },
  },
  {
    id: 'demo-typhoid',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'typhoid',
    chiefComplaint:
      'Fever rising over the last week, dull stomach ache, poor appetite and constipation.',
    reasoning:
      'Step-ladder fever × 7 days, abdominal discomfort, relative bradycardia, recent untreated water source. Enteric fever — blood culture + antibiotics.',
    redFlags: [],
    riskScore: 53,
    trajectory: 'stable',
    ageMinutesAgo: 44,
    comorbidities: 0,
    vitals: 6,
    sx: 45,
    ageFactor: 1.0,
  },
  {
    id: 'demo-pneumonia',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'pneumonia',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Chest (right): intensity 6/10 (pressure), days or weeks. Upper back (right): intensity 4/10, days or weeks.',
    reasoning:
      'Productive cough with rusty sputum, fever × 4 days, right-sided pleuritic chest pain, focal crackles. Community-acquired pneumonia — CXR + antibiotics.',
    redFlags: [],
    riskScore: 62,
    trajectory: 'worsening',
    ageMinutesAgo: 33,
    comorbidities: 10,
    vitals: 12,
    sx: 50,
    ageFactor: 1.2,
    differential: {
      most_likely: [
        { name: 'Community-acquired pneumonia', confidence: 0.6 },
        { name: 'Acute bronchitis', confidence: 0.18 },
      ],
      cant_miss: [{ name: 'Pulmonary tuberculosis', confidence: 0.1 }],
    },
  },
  {
    id: 'demo-tb-suspect',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'tuberculosis',
    chiefComplaint:
      'Cough for more than three weeks, evening fever, night sweats and losing weight.',
    reasoning:
      'Chronic cough >3 weeks with night sweats, weight loss, occasional haemoptysis. Presumptive pulmonary TB — sputum NAAT/CBNAAT under NTEP (free).',
    redFlags: [],
    riskScore: 50,
    trajectory: 'stable',
    ageMinutesAgo: 51,
    comorbidities: 5,
    vitals: 4,
    sx: 44,
    ageFactor: 1.0,
  },
  {
    id: 'demo-uti',
    level: 'Clinic Visit',
    esi: 4,
    conditionId: 'uti',
    chiefComplaint:
      'Burning when passing urine, going very frequently and lower belly discomfort for two days.',
    reasoning:
      'Dysuria, frequency, suprapubic discomfort, no fever/flank pain. Uncomplicated lower UTI — urine dip + short antibiotic course.',
    redFlags: [],
    riskScore: 40,
    trajectory: 'stable',
    ageMinutesAgo: 63,
    comorbidities: 0,
    vitals: 0,
    sx: 38,
    ageFactor: 1.0,
  },
  {
    id: 'demo-dehydration-child',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'dehydration',
    chiefComplaint:
      '3-year-old with loose stools and vomiting since yesterday, drinking poorly, fewer wet nappies.',
    reasoning:
      'Toddler with acute gastroenteritis and some dehydration (reduced urine, sunken eyes, lethargic but rousable). Supervised ORS + zinc; IV if it worsens.',
    redFlags: [],
    riskScore: 56,
    trajectory: 'worsening',
    ageMinutesAgo: 22,
    comorbidities: 0,
    vitals: 10,
    sx: 46,
    ageFactor: 1.5,
  },
  {
    id: 'demo-asthma-moderate',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'asthma',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Chest (centre): intensity 7/10 (pressure), few hours. Throat: intensity 3/10 (tight), few hours.',
    reasoning:
      'Known asthmatic, moderate exacerbation: wheeze, chest tightness, partial relief with reliever, speaking in phrases. Nebulisation + steroid; observe response.',
    redFlags: [],
    riskScore: 60,
    trajectory: 'worsening',
    ageMinutesAgo: 29,
    comorbidities: 8,
    vitals: 14,
    sx: 50,
    ageFactor: 1.0,
  },
  {
    id: 'demo-chikungunya',
    level: 'Clinic Visit',
    esi: 4,
    conditionId: 'chikungunya',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Both knees: intensity 6/10 (throbbing), days or weeks. Both wrists: intensity 5/10 (cramping), days or weeks.',
    reasoning:
      'High fever × 3 days with severe symmetrical poly-arthralgia and rash during a known chikungunya cluster. Supportive care; paracetamol until dengue excluded.',
    redFlags: [],
    riskScore: 44,
    trajectory: 'stable',
    ageMinutesAgo: 47,
    comorbidities: 0,
    vitals: 4,
    sx: 42,
    ageFactor: 1.0,
  },
  {
    id: 'demo-hypertension',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'hypertension',
    chiefComplaint:
      'Headache and dizziness, BP machine at the chemist read 178/104, not on any medicines.',
    reasoning:
      'Newly-detected stage-2 hypertension (178/104) with mild symptoms, no end-organ red flags. Needs confirmation, work-up and antihypertensive initiation.',
    redFlags: [],
    riskScore: 52,
    trajectory: 'stable',
    ageMinutesAgo: 58,
    comorbidities: 12,
    vitals: 10,
    sx: 30,
    ageFactor: 1.2,
  },
  {
    id: 'demo-anemia-pregnancy',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'anemia',
    chiefComplaint:
      '6 months pregnant, very tired and breathless on walking, looks pale, dizzy on standing.',
    reasoning:
      'Pregnant (28 wks) with fatigue, exertional dyspnoea, pallor — likely moderate iron-deficiency anaemia. Hb + IFA/IV iron; antenatal follow-up.',
    redFlags: [],
    riskScore: 48,
    trajectory: 'stable',
    ageMinutesAgo: 66,
    comorbidities: 10,
    vitals: 6,
    sx: 36,
    ageFactor: 1.2,
  },
  {
    id: 'demo-cellulitis',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'skin-infection',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Right calf: intensity 6/10 (throbbing), since yesterday. Right ankle: intensity 4/10, since yesterday.',
    reasoning:
      'Spreading warm, red, tender right calf with low-grade fever from a minor wound. Cellulitis — mark the border, oral antibiotics, review in 48h.',
    redFlags: [],
    riskScore: 47,
    trajectory: 'worsening',
    ageMinutesAgo: 41,
    comorbidities: 8,
    vitals: 6,
    sx: 40,
    ageFactor: 1.1,
  },
  {
    id: 'demo-mental-health',
    level: 'Clinic Visit',
    esi: 4,
    conditionId: 'mental-health',
    chiefComplaint:
      'Feeling very low and hopeless for over two weeks, not sleeping, no interest in anything, no thoughts of self-harm.',
    reasoning:
      'Persistent low mood, anhedonia, insomnia × 3 weeks, no suicidal ideation or psychosis. Moderate depression — counselling referral + Tele-MANAS 14416.',
    redFlags: [],
    riskScore: 42,
    trajectory: 'stable',
    ageMinutesAgo: 72,
    comorbidities: 0,
    vitals: 0,
    sx: 40,
    ageFactor: 1.0,
  },

  /* ─────────────── Home Care (6) ─────────────── */
  {
    id: 'demo-common-cold',
    level: 'Home Care',
    esi: 5,
    conditionId: 'common-cold',
    chiefComplaint:
      'Runny nose, sneezing and a scratchy throat for two days, no fever, feeling otherwise fine.',
    reasoning:
      'Classic viral upper respiratory infection, no fever, no red flags. Self-care with fluids, steam, salt-water gargles; return if it lasts >10 days.',
    redFlags: [],
    riskScore: 14,
    trajectory: 'improving',
    ageMinutesAgo: 88,
    comorbidities: 0,
    vitals: 0,
    sx: 14,
    ageFactor: 1.0,
  },
  {
    id: 'demo-influenza',
    level: 'Home Care',
    esi: 4,
    conditionId: 'influenza',
    chiefComplaint:
      'Sudden fever, chills, body aches and a dry cough since yesterday, otherwise managing.',
    reasoning:
      'Influenza-like illness, sudden onset, no breathlessness/comorbidity. Symptomatic care + isolation; watch for breathing difficulty or persistent high fever.',
    redFlags: [],
    riskScore: 24,
    trajectory: 'stable',
    ageMinutesAgo: 95,
    comorbidities: 0,
    vitals: 0,
    sx: 24,
    ageFactor: 1.0,
  },
  {
    id: 'demo-viral-fever',
    level: 'Home Care',
    esi: 5,
    conditionId: 'viral-fever',
    chiefComplaint:
      'Mild fever and slight body ache since this morning, eating and drinking normally.',
    reasoning:
      'Day-1 undifferentiated viral fever, no localising or danger signs. Rest, fluids, paracetamol; re-triage if fever >3 days or warning signs appear.',
    redFlags: [],
    riskScore: 18,
    trajectory: 'stable',
    ageMinutesAgo: 104,
    comorbidities: 0,
    vitals: 0,
    sx: 18,
    ageFactor: 1.0,
  },
  {
    id: 'demo-acidity',
    level: 'Home Care',
    esi: 5,
    conditionId: 'acid-reflux',
    chiefComplaint:
      'Burning in the upper stomach and sour belching after spicy meals, better with antacid.',
    reasoning:
      'Typical reflux symptoms relieved by antacids, no alarm features (no weight loss, dysphagia, bleeding, cardiac risk). Diet/lifestyle + short antacid course.',
    redFlags: [],
    riskScore: 12,
    trajectory: 'improving',
    ageMinutesAgo: 121,
    comorbidities: 0,
    vitals: 0,
    sx: 12,
    ageFactor: 1.0,
  },
  {
    id: 'demo-migraine',
    level: 'Home Care',
    esi: 4,
    conditionId: 'migraine',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Head: intensity 7/10 (throbbing), few hours. Face: intensity 3/10 (pressure), few hours.',
    reasoning:
      'Recurrent one-sided throbbing headache with photophobia and nausea, normal between attacks, no thunderclap/neuro deficit. Migraine — rest, hydration, early analgesia, trigger diary.',
    redFlags: [],
    riskScore: 20,
    trajectory: 'improving',
    ageMinutesAgo: 137,
    comorbidities: 0,
    vitals: 0,
    sx: 20,
    ageFactor: 1.0,
  },
  {
    id: 'demo-back-pain',
    level: 'Home Care',
    esi: 5,
    conditionId: 'back-pain',
    inputMode: 'body_map_3d',
    chiefComplaint:
      'Lower back: intensity 5/10 (cramping), days or weeks. Right buttock: intensity 3/10, days or weeks.',
    reasoning:
      'Mechanical low-back pain after lifting, no leg weakness, numbness, bladder/bowel change or red flags. Stay active, heat, short analgesia; review if neuro signs appear.',
    redFlags: [],
    riskScore: 16,
    trajectory: 'improving',
    ageMinutesAgo: 152,
    comorbidities: 0,
    vitals: 0,
    sx: 16,
    ageFactor: 1.0,
  },

  /* ─────────────── Risk-escalated showcase (Plan 5.1) ─────────────── */
  {
    id: 'demo-escalated-by-risk',
    level: 'Clinic Visit',
    esi: 3,
    conditionId: 'viral-fever',
    chiefComplaint:
      'Tired with a low fever for two days, breathing a bit fast, known diabetes and kidney disease.',
    reasoning:
      '72 M with diabetes + CKD, fatigue + low-grade fever × 48h, RR 27. No single rule fired, but composite risk crossed the HIGH threshold → triage upgraded from Home to Clinic.',
    redFlags: [],
    riskScore: 64,
    trajectory: 'worsening',
    ageMinutesAgo: 16,
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
    condition: spec.conditionId
      ? (conditionById(spec.conditionId) ?? undefined)
      : undefined,
  };
}

interface SeederOpts {
  force?: boolean;
  /** Override the seeded user id (defaults to a shared demo pool). */
  userId?: string;
}

/**
 * Idempotent: re-runs replace the same rows by id. Returns the count seeded
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
          content: spec.chiefComplaint ?? spec.reasoning.split('.')[0] + '.',
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
      inputMode: spec.inputMode ?? 'text',
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
