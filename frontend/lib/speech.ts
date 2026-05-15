'use client';

/**
 * Browser-native text-to-speech (Web Speech API).
 *
 * Why the platform speechSynthesis instead of a cloud TTS:
 *   - Zero backend, zero API keys, works fully offline / in installed PWA
 *   - en-IN / hi-IN / kn-IN voices ship on most modern Android & desktop
 *   - Instant — critical for a low-literacy rural user who needs to *hear*
 *     "Emergency Room — go now, call 108", not read it
 *
 * Gating: auto-speak honours the global mute preference (shared with the
 * verdict audio cues via `isMuted()`); an explicit "Listen" tap passes
 * `force` so a deliberate user action always works even when muted.
 */

import { isMuted } from './audio';

export type SpeechLang = 'en' | 'hi' | 'kn';

// Preferred BCP-47 tags per app locale, best-first. Indian English leads so
// the accent matches the audience when the voice is available.
const LANG_TAGS: Record<SpeechLang, string[]> = {
  en: ['en-IN', 'en-GB', 'en-US', 'en'],
  hi: ['hi-IN', 'hi'],
  kn: ['kn-IN', 'kn'],
};

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

let _voices: SpeechSynthesisVoice[] = [];

function refreshVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) _voices = v;
  return _voices;
}

// Some browsers populate the voice list asynchronously — prime it now and
// keep it fresh as the engine loads voices.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  try {
    window.speechSynthesis.onvoiceschanged = () => refreshVoices();
  } catch {
    /* noop */
  }
}

function pickVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
  const voices = refreshVoices();
  if (!voices.length) return null;
  for (const tag of LANG_TAGS[lang]) {
    const exact = voices.find(
      (v) => v.lang?.toLowerCase() === tag.toLowerCase(),
    );
    if (exact) return exact;
  }
  // Loose prefix match (e.g. app 'en' → any 'en-*' voice).
  return voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) ?? null;
}

export interface SpeakOptions {
  lang?: SpeechLang;
  onstart?: () => void;
  onend?: () => void;
  /** Speak even when globally muted — for explicit user taps. */
  force?: boolean;
}

/** Cancel any in-flight speech. */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}

/**
 * Speak `text`. Returns false if speech is unsupported, muted (and not
 * forced), or the text is empty — so callers can fall back gracefully.
 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!isSpeechSupported()) return false;
  const { lang = 'en', onstart, onend, force = false } = opts;
  if (!force && isMuted()) return false;

  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return false;

  try {
    // Stop anything already speaking so taps don't queue up.
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(clean);
    u.lang = LANG_TAGS[lang][0];
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = 0.95; // slightly slower — clearer for low-literacy listeners
    u.pitch = 1;
    u.volume = 1;
    if (onstart) u.onstart = () => onstart();
    if (onend) {
      u.onend = () => onend();
      u.onerror = () => onend();
    }

    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
