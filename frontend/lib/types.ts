// Shared types between frontend and backend.
// MUST stay in sync with backend/app/models/ (Role B).
// API contract source of truth: docs/API_CONTRACT.md (when written).

export type CareLevel = 'Home Care' | 'Clinic Visit' | 'Emergency Room';

export const CARE_LEVELS: CareLevel[] = ['Home Care', 'Clinic Visit', 'Emergency Room'];

/** Patient sex — matches backend `Sex` enum. */
export type Sex = 'M' | 'F';

/** Plan 6.1 — origin of the triage submission. Must match `InputMode` in
 *  `backend/app/models/triage.py` exactly. */
export type InputMode = 'text' | 'voice' | 'body_map' | 'body_map_3d';

export interface TriageRequest {
  symptoms: string;
  age?: number;
  sex?: 'M' | 'F' | 'other';
  history?: string[];
  /** Plan 6.1 — structured body-map pins from /triage/body-map-3d. Optional;
   *  Plan 4.0 / 5.1 chat-only payloads still validate. */
  structured_symptoms?: Pin[];
  /** Plan 6.1 — input mode hint for backend prompt routing. */
  input_mode?: InputMode;
  /** Plan 6.1 — session id for cross-route continuity. */
  session_id?: string;
}

/* ──────────────── Plan 6.1 — Symptom Cinema 3D ──────────────── */

export type BodyView = 'front' | 'back' | 'left' | 'right' | 'interior';
export type PainQuality = 'burning' | 'stabbing' | 'throbbing' | 'pressure' | 'cramping';
export type PainDuration =
  | 'just_started'
  | 'few_hours'
  | 'since_yesterday'
  | 'days_or_weeks';
export type PainAggravator =
  | 'moving'
  | 'eating'
  | 'breathing'
  | 'pressing'
  | 'standing_up'
  | 'nothing';
export type AnatomyLayer = 'skin' | 'muscle' | 'skeleton' | 'organs';

/**
 * Plan 6.1 Pin v1.5 — structured body-map output. Schema baked in with the
 * v1.5 anatomical-3D fields (fma_id, mesh_position_3d, layer_visible) since
 * the v1 SVG body map was never shipped and we go straight to 3D.
 *
 * `body_region` stays the canonical join key (e.g. "chest_left_anterior")
 * for backwards compat with the SYMPTOM_CINEMA §4 region taxonomy.
 */
export interface Pin {
  body_region: string;
  body_view: BodyView;
  /** Normalized 0..1 within the canvas (for replay / rendering). */
  x: number;
  y: number;
  intensity: number;
  quality: PainQuality[];
  duration_band: PainDuration;
  aggravators: PainAggravator[];
  /** Foundational Model of Anatomy code (e.g. "FMA:43799"). */
  fma_id?: string;
  /** Mesh-local 3D coordinates of the tap, for replay across rotations. */
  mesh_position_3d?: [number, number, number];
  /** Which layer was visible when the user tapped. */
  layer_visible?: AnatomyLayer;
}

/**
 * Backend response shape — must stay in sync with `backend/app/models/triage.py`.
 * Older Plan 1.0/2.0 backends still pass validation because every field added
 * later is optional.
 */
export interface RedFlag {
  rule_id?: string;
  rule_name?: string;
  citation?: string;
}

export interface Citation {
  id?: string;
  source: string;
  section?: string;
  /** Backend Plan 3.0 uses `text`; some older mock responses used `excerpt`. */
  text?: string;
  excerpt?: string;
  score?: number;
}

export interface DifferentialItem {
  name: string;
  confidence?: number;
  why?: string;
}

export interface Differential {
  most_likely?: DifferentialItem[];
  expanded?: DifferentialItem[];
  cant_miss?: DifferentialItem[];
}

export interface TriageResponse {
  /* Required, since Plan 1.0 */
  level: CareLevel;
  reasoning: string;
  disclaimer: string;
  /* Optional fields — present from Plan 2.0 / 3.0 backends */
  red_flags?: Array<string | RedFlag>;
  version?: string;
  verdict_id?: string;
  esi?: 1 | 2 | 3 | 4 | 5;
  confidence?: number;
  model_version?: string;
  citations?: Array<string | Citation>;
  differential?: Differential | null;
  /** ISO 639-1 code of the language the patient input was in. */
  language?: 'en' | 'hi' | 'kn' | string;
  /** True when the safety layer detected suicidal-ideation patterns. */
  mental_health_flag?: boolean;
  /** Plan 5.1 — dynamic risk score. */
  risk?: RiskAssessment;
  /** Plan 5.1 — true when risk caused an escalation from a lower care level. */
  risk_escalated?: boolean;
}

/* ──────────────── Plan 5.1 — Risk Scoring ──────────────── */

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type RiskTrajectory =
  | 'rapidly_worsening'
  | 'worsening'
  | 'stable'
  | 'improving'
  | 'insufficient_data';

export interface RiskComponents {
  symptoms: number;
  age_factor: number;
  comorbidities: number;
  vitals?: number;
}

export interface RiskAssessment {
  /** 0–100, higher = more urgent. */
  score: number;
  level: RiskLevel;
  trajectory: RiskTrajectory;
  /** Human-readable next-step instruction, English. */
  action: string;
  components: RiskComponents;
  /** ISO timestamp of when this score was computed. */
  computed_at?: string;
}

export interface RiskHistoryPoint {
  /** ISO timestamp. */
  ts: string;
  score: number;
}

export interface RiskComputeRequest {
  symptoms: Array<{ name: string; severity: number; onset_hours_ago: number }>;
  age: number;
  sex: 'M' | 'F' | 'other';
  comorbidities?: string[];
  vital_proxy?: { breathing_rate?: number; heart_rate?: number };
  history?: RiskHistoryPoint[];
}

export interface VoiceTranscribeResponse {
  transcript_source: string;
  transcript_english: string;
  audio_request_path?: string | null;
  audio_response_url?: string | null;
  verdict: TriageResponse;
}

export interface MentalHealthHelpline {
  name: string;
  number: string;
  language?: string;
  hours?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  verdict?: TriageResponse;
}

export const DISCLAIMER =
  'This is not a replacement for professional medical diagnosis. Please consult a qualified medical practitioner for any real medical concern.';
