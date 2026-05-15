// Shared types between frontend and backend.
// MUST stay in sync with backend/app/models/ (Role B).
// API contract source of truth: docs/API_CONTRACT.md (when written).

export type CareLevel = 'Home Care' | 'Clinic Visit' | 'Emergency Room';

export const CARE_LEVELS: CareLevel[] = ['Home Care', 'Clinic Visit', 'Emergency Room'];

export interface TriageRequest {
  symptoms: string;
  age?: number;
  sex?: 'M' | 'F' | 'other';
  history?: string[];
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
