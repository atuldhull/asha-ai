/**
 * Plan 7.x — ASHA Co-Pilot presentation library.
 *
 * Eight canonical presentations an ASHA worker triages weekly in rural
 * India. Each one ships with a pre-filled English symptom prompt that
 * encodes the most-common follow-up cues (so the LLM gets a richer signal
 * than just "fever") + a short clinical reminder card the ASHA can read
 * aloud while waiting for the verdict.
 *
 * **Why pre-fill:** ASHA workers triage on a borrowed tablet between
 * home visits. Typing free-text on a touch keyboard with one hand
 * holding a notebook costs visible seconds. Tap-a-presentation +
 * adjust-a-detail trims the flow to ~12 seconds end-to-end.
 *
 * **Localization:** UI strings (chip label + observation hints) flow
 * through i18n. The `prompt` itself stays English — the backend
 * extract_symptoms tool is English-anchored, and the verdict comes back
 * in the user's locale via the existing reasoning translation path.
 */

import type { Sex } from './types';

export type AshaPresentationId =
  | 'fever_child'
  | 'fever_adult'
  | 'cough_breathing'
  | 'abdominal_pain'
  | 'pregnancy_check'
  | 'postpartum_concern'
  | 'elderly_fall'
  | 'mental_distress';

export interface AshaPresentation {
  id: AshaPresentationId;
  /** Single-character emoji for the chip. Tablet-friendly visual cue. */
  emoji: string;
  /** Care band the brief assigns by default — caller can override. */
  default_band: 'pediatric' | 'adult' | 'maternal' | 'elderly' | 'mental_health';
  /** Pre-filled symptom text sent to /api/triage. */
  prompt: string;
  /** When set, presets the patient sex on the picker. */
  default_sex?: Sex;
  /** When set, presets a typical age — ASHA can override. */
  default_age?: number;
  /** Short clinical reminder shown to the ASHA after they pick the chip. */
  reminder_key: string;
}

export const ASHA_PRESENTATIONS: AshaPresentation[] = [
  {
    id: 'fever_child',
    emoji: '🌡️',
    default_band: 'pediatric',
    default_age: 4,
    prompt:
      'Child with fever for more than two days, not eating well, lethargic and listless, no clear source of infection',
    reminder_key: 'asha.reminder.fever_child',
  },
  {
    id: 'fever_adult',
    emoji: '🤒',
    default_band: 'adult',
    default_age: 32,
    prompt:
      'Adult with fever for several days, body ache, headache, mild rash on trunk — concerned about dengue / malaria / typhoid',
    reminder_key: 'asha.reminder.fever_adult',
  },
  {
    id: 'cough_breathing',
    emoji: '🫁',
    default_band: 'adult',
    default_age: 50,
    prompt:
      'Persistent cough for more than three weeks, increasing shortness of breath, especially worse at night',
    reminder_key: 'asha.reminder.cough_breathing',
  },
  {
    id: 'abdominal_pain',
    emoji: '🤢',
    default_band: 'adult',
    default_age: 28,
    prompt:
      'Severe abdominal pain in the right lower quadrant, vomiting, no appetite, low-grade fever',
    reminder_key: 'asha.reminder.abdominal_pain',
  },
  {
    id: 'pregnancy_check',
    emoji: '🤰',
    default_band: 'maternal',
    default_age: 24,
    default_sex: 'F',
    prompt:
      'Pregnant woman, third trimester, mild swelling in feet and hands, occasional headache, blood pressure not measured today',
    reminder_key: 'asha.reminder.pregnancy_check',
  },
  {
    id: 'postpartum_concern',
    emoji: '🤱',
    default_band: 'maternal',
    default_age: 26,
    default_sex: 'F',
    prompt:
      'Postpartum mother, two weeks after delivery, heavy vaginal bleeding, fever, breast pain on one side',
    reminder_key: 'asha.reminder.postpartum_concern',
  },
  {
    id: 'elderly_fall',
    emoji: '👵',
    default_band: 'elderly',
    default_age: 72,
    prompt:
      'Elderly person fell at home, hip pain, unable to bear weight, no head injury, on blood thinners',
    reminder_key: 'asha.reminder.elderly_fall',
  },
  {
    id: 'mental_distress',
    emoji: '🧠',
    default_band: 'mental_health',
    default_age: 22,
    prompt:
      'Young adult feeling persistently sad and hopeless for the past month, sleep disturbed, withdrawing from family — needs mental health screening',
    reminder_key: 'asha.reminder.mental_distress',
  },
];

/**
 * ASHA-relevant external numbers. Real district health officer phone
 * comes from a server-side directory in Tier 6.6 Phase H — placeholder
 * for now so the action chips render.
 */
export const ASHA_RESOURCES = {
  ambulance: '108',
  womens_helpline: '181',
  esanjeevani:
    'https://esanjeevani.mohfw.gov.in/#/teleconsultation',
  // Replace with the verified district health officer number when known.
  district_officer_placeholder: '+91-XXXXXXXXXX',
};
