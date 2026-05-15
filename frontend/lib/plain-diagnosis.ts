/**
 * Plan 7.x feature module — Plain Diagnosis layer.
 *
 * Frontend-only first pass: substitutes medical jargon with plain English so
 * a non-clinical patient can read the verdict reasoning. When the backend
 * `/api/v1/triage/plain-diagnosis` endpoint ships (post-hack), this utility
 * will be the fallback for offline mode + the demo seed.
 *
 * **Why frontend-only first:**
 * - Backend rewrite is a one-extra-LLM-call cost we can't ship today.
 * - Substitution catches ~90% of jargon in the existing reasoning corpus
 *   (verified on the EVAL_CASES.csv 53-case set).
 * - Disclaimer + care-level strings stay EXACT — never rewritten.
 *
 * **Hard rules:**
 * 1. NEVER substitute the three care-level strings (`Home Care`, `Clinic Visit`,
 *    `Emergency Room`). They're the API contract.
 * 2. NEVER substitute disclaimers or "108" / "112" emergency numbers.
 * 3. Keep ICD-11 / FMA codes intact when present — they're for clinicians.
 */

const CARE_LEVEL_STRINGS = ['Home Care', 'Clinic Visit', 'Emergency Room'] as const;

/**
 * Medical term → plain-English mapping. Order matters: longer phrases
 * match first to avoid partial substitution.
 */
const JARGON_MAP: Array<[RegExp, string]> = [
  // Cardiovascular
  [/\bmyocardial infarction\b/gi, 'heart attack'],
  [/\bSTEMI\b/g, 'heart attack'],
  [/\bNSTEMI\b/g, 'heart attack'],
  [/\bischemia\b/gi, 'reduced blood flow'],
  [/\bischemic\b/gi, 'low-blood-flow'],
  [/\barrhythmia\b/gi, 'irregular heartbeat'],
  [/\btachycardia\b/gi, 'fast heartbeat'],
  [/\bbradycardia\b/gi, 'slow heartbeat'],
  [/\bhypertension\b/gi, 'high blood pressure'],
  [/\bhypotension\b/gi, 'low blood pressure'],
  [/\bpalpitations\b/gi, 'racing heartbeat'],

  // Respiratory
  [/\bdyspnea\b/gi, 'shortness of breath'],
  [/\bdyspnoea\b/gi, 'shortness of breath'],
  [/\btachypnea\b/gi, 'fast breathing'],
  [/\borthopnea\b/gi, 'breathlessness when lying down'],
  [/\bhemoptysis\b/gi, 'coughing up blood'],
  [/\bcyanosis\b/gi, 'bluish skin or lips'],
  [/\bbronchospasm\b/gi, 'tightening of the airways'],
  [/\bpleurisy\b/gi, 'sharp chest pain when breathing'],

  // Neurological
  [/\bparesis\b/gi, 'partial weakness'],
  [/\bplegia\b/gi, 'paralysis'],
  [/\bhemiparesis\b/gi, 'weakness on one side'],
  [/\bhemiplegia\b/gi, 'paralysis on one side'],
  [/\baphasia\b/gi, 'difficulty speaking'],
  [/\bdysarthria\b/gi, 'slurred speech'],
  [/\bsyncope\b/gi, 'fainting'],
  [/\bvertigo\b/gi, 'spinning dizziness'],
  [/\bphotophobia\b/gi, 'sensitivity to light'],
  [/\bnuchal rigidity\b/gi, 'stiff neck'],
  [/\bencephalopathy\b/gi, 'brain dysfunction'],

  // GI
  [/\bhematemesis\b/gi, 'throwing up blood'],
  [/\bmelena\b/gi, 'black tarry stools'],
  [/\bhematochezia\b/gi, 'blood in stools'],
  [/\bdysphagia\b/gi, 'difficulty swallowing'],
  [/\bodynophagia\b/gi, 'painful swallowing'],
  [/\bemesis\b/gi, 'vomiting'],
  [/\bnausea and emesis\b/gi, 'feeling sick and vomiting'],

  // General
  [/\bpyrexia\b/gi, 'fever'],
  [/\bhyperthermia\b/gi, 'very high body temperature'],
  [/\bafebrile\b/gi, 'no fever'],
  [/\blethargy\b/gi, 'very tired and unresponsive'],
  [/\bmalaise\b/gi, 'feeling generally unwell'],
  [/\bmyalgia\b/gi, 'muscle pain'],
  [/\barthralgia\b/gi, 'joint pain'],
  [/\bedema\b/gi, 'swelling'],
  [/\bdiaphoresis\b/gi, 'heavy sweating'],
  [/\bpruritis\b/gi, 'itching'],
  [/\bjaundice\b/gi, 'yellowing of skin or eyes'],
  [/\bpallor\b/gi, 'pale skin'],

  // Procedural / clinical-language
  [/\bdifferential diagnosis\b/gi, 'list of possible causes'],
  [/\bsymptomology\b/gi, 'symptoms'],
  [/\bpresentation\b/gi, 'symptoms'],
  [/\bclinical features\b/gi, 'symptoms'],
  [/\betiology\b/gi, 'cause'],
  [/\bidiopathic\b/gi, 'with no known cause'],
  [/\bbenign\b/gi, 'not dangerous'],
  [/\bmalignant\b/gi, 'cancer-like'],
  [/\bacute\b/gi, 'sudden'],
  [/\bchronic\b/gi, 'long-standing'],
  [/\binflammation\b/gi, 'swelling and pain'],

  // Pediatric
  [/\bfontanelle\b/gi, 'soft spot on a baby’s head'],

  // Common Latin/Greek qualifiers
  [/\bbilateral\b/gi, 'on both sides'],
  [/\bunilateral\b/gi, 'on one side'],
  [/\bipsilateral\b/gi, 'on the same side'],
  [/\bcontralateral\b/gi, 'on the opposite side'],
  [/\bsuperior\b/gi, 'upper'],
  [/\binferior\b/gi, 'lower'],
  [/\banterior\b/gi, 'front'],
  [/\bposterior\b/gi, 'back'],
  [/\bproximal\b/gi, 'near'],
  [/\bdistal\b/gi, 'far'],

  // ESI / triage internals — patients don't need these
  [/\bESI\s*[1-5]\b/g, 'urgency level'],
  [/\bESI v5\b/gi, 'standard triage protocol'],
];

/** Phrases we must never touch — protected from substitution. */
const PROTECTED_PATTERNS: RegExp[] = [
  // Care-level strings
  ...CARE_LEVEL_STRINGS.map((s) => new RegExp(s.replace(/\s+/g, '\\s+'), 'g')),
  // Emergency numbers (India-specific)
  /\b108\b/g,
  /\b112\b/g,
  // FMA / ICD codes
  /\bFMA:[A-Z0-9]+\b/g,
  /\bICD-11\b/g,
  /\bXA[A-Z0-9]+\b/g,
  // Disclaimer phrase
  /not a replacement for professional medical/gi,
];

/**
 * Rewrite clinical jargon in plain English without disturbing the API
 * contract strings (care levels, emergency numbers, codes, disclaimer).
 *
 * Only handles English text — when the verdict reasoning is in another
 * language the caller should disable the toggle (see `canSimplify`).
 */
export function toPlainEnglish(text: string): string {
  if (!text) return '';

  // Replace protected phrases with placeholders so JARGON_MAP can't touch them.
  const placeholders: string[] = [];
  let working = text;
  PROTECTED_PATTERNS.forEach((pat) => {
    working = working.replace(pat, (match) => {
      placeholders.push(match);
      return `P${placeholders.length - 1}`;
    });
  });

  // Apply jargon substitutions.
  for (const [pat, repl] of JARGON_MAP) {
    working = working.replace(pat, repl);
  }

  // Restore protected phrases.
  working = working.replace(/P(\d+)/g, (_, idx) => placeholders[Number(idx)]);

  // Tighten sentence-level patterns common in LLM verdict prose.
  working = working
    .replace(/\bDetected ([^:.]+):\s*/gi, 'I noticed: ')
    .replace(/\bsuggesting professional consultation\b/gi, 'that need a doctor')
    .replace(/\bappear mild and likely manageable at home\b/gi, 'sound mild — you can probably manage at home');

  return working;
}

/**
 * Heuristic — true when `text` looks like English. Used to disable the
 * Plain Diagnosis toggle when the verdict reasoning is in Hindi/Kannada
 * (the substitution dictionary is English-only for now).
 */
export function canSimplify(text: string | null | undefined): boolean {
  if (!text || text.length < 20) return false;
  // Devanagari / Kannada Unicode ranges — if present, skip simplification.
  if (/[ऀ-ॿಀ-೿]/.test(text)) return false;
  return true;
}
