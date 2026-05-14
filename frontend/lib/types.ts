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

export interface TriageResponse {
  level: CareLevel;
  reasoning: string;
  red_flags?: Array<string | { rule_id?: string; rule_name?: string; citation?: string }>;
  disclaimer: string;
  /* Plan 3.0+ enrichments — optional so Plan 1.0/2.0 responses stay valid. */
  esi?: 1 | 2 | 3 | 4 | 5;
  citations?: Array<{ source: string; section?: string; excerpt?: string }>;
  mental_health_flag?: boolean;
  /* Plan 3.0+ doctor view — three-tier differential. Optional. */
  differential?: {
    most_likely?: Array<{ name: string; confidence?: number; why?: string }>;
    expanded?: Array<{ name: string; confidence?: number; why?: string }>;
    cant_miss?: Array<{ name: string; confidence?: number; why?: string }>;
  };
  /* Optional reference to source language when input was non-English. */
  source_language?: 'en' | 'hi' | 'kn';
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
