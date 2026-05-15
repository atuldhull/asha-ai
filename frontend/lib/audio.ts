'use client';

/**
 * Verdict audio cues — synthesized at runtime via Web Audio API.
 *
 * Why not MP3 files?
 *   - No licensing risk (royalty-free SFX libraries still need attribution)
 *   - Zero bundle size cost
 *   - Works offline / in PWA installed mode without bundling assets
 *   - Lets us tune the timbre per-tier without re-rendering audio files
 *
 * Three cues, tuned to be calm-to-urgent:
 *   - Home Care     — single soft 660 Hz ding, sine wave, ~600 ms
 *   - Clinic Visit  — neutral two-note (660 Hz → 880 Hz), triangle, ~700 ms
 *   - Emergency Room — urgent two-tone (880 Hz ↔ 660 Hz, twice), square+lp, ~1000 ms
 *
 * Every play is gated by:
 *   1. `prefers-reduced-motion: reduce` — silent
 *   2. localStorage `asha-ai:muted` === "true" — silent
 *   3. AudioContext requires a user gesture; we fail silently if blocked.
 */
import type { CareLevel } from './types';

const STORAGE_KEY = 'asha-ai:muted';

/** Read mute preference. */
export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persist mute preference + notify listeners. */
export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(muted));
    window.dispatchEvent(new CustomEvent('asha-ai:mute-change', { detail: muted }));
  } catch {
    /* noop */
  }
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  type W = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AC = (window as W).AudioContext ?? (window as W).webkitAudioContext;
  if (!AC) return null;
  try {
    _ctx = new AC();
    return _ctx;
  } catch {
    return null;
  }
}

interface Note {
  freq: number;
  /** seconds */ start: number;
  /** seconds */ duration: number;
  type?: OscillatorType;
  /** 0..1 */ peak?: number;
}

function playSequence(notes: Note[]): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const master = ctx.createGain();
  master.gain.value = 0.35; // overall ducking
  master.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.02;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;

    const peak = n.peak ?? 0.8;
    const start = t0 + n.start;
    const end = start + n.duration;
    // Quick attack, smooth release — no pops
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

const PATTERNS: Record<CareLevel, Note[]> = {
  'Home Care': [
    { freq: 660, start: 0.0, duration: 0.45, type: 'sine', peak: 0.8 },
  ],
  'Clinic Visit': [
    { freq: 660, start: 0.0, duration: 0.22, type: 'triangle', peak: 0.7 },
    { freq: 880, start: 0.18, duration: 0.32, type: 'triangle', peak: 0.7 },
  ],
  'Emergency Room': [
    { freq: 880, start: 0.0, duration: 0.18, type: 'square', peak: 0.55 },
    { freq: 660, start: 0.2, duration: 0.18, type: 'square', peak: 0.55 },
    { freq: 880, start: 0.4, duration: 0.18, type: 'square', peak: 0.55 },
    { freq: 660, start: 0.6, duration: 0.32, type: 'square', peak: 0.55 },
  ],
};

/** Vibration pattern in ms — Android Chrome only; no-op elsewhere. */
const HAPTIC_PATTERN: Record<CareLevel, number | number[]> = {
  'Home Care': 50,
  'Clinic Visit': [80, 40, 80],
  'Emergency Room': [200, 60, 200, 60, 400],
};

/**
 * Play the audio cue + fire haptic feedback for a verdict level.
 * Honors the global mute preference and `prefers-reduced-motion`.
 */
export function playVerdictCue(level: CareLevel): void {
  if (typeof window === 'undefined') return;
  if (isMuted() || reducedMotion()) return;

  // Audio
  try {
    const pattern = PATTERNS[level];
    if (pattern) playSequence(pattern);
  } catch {
    /* fail silent — autoplay may be blocked */
  }

  // Haptic
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(HAPTIC_PATTERN[level]);
    }
  } catch {
    /* noop */
  }
}
