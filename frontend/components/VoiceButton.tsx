'use client';

/**
 * Voice input button.
 *
 * Strategy:
 *  1. PRIMARY (Plan 4.0+): record audio via MediaRecorder, POST to backend
 *     `/api/v1/voice/transcribe` (Bhashini ASR) and play back the TTS response.
 *     Backend must support that endpoint — Member B owns Plan 3.0 of it.
 *  2. FALLBACK (Plan 3.0 demo): if NEXT_PUBLIC_BHASHINI_ENABLED is unset,
 *     use the browser's Web Speech API (SpeechRecognition) for on-device
 *     transcription. Works on Android Chrome for English + Hindi.
 *
 * Either way the parent receives a string transcript via onTranscript().
 *
 * 30-second auto-stop. Hold-to-talk on touch devices, tap-to-toggle on desktop.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { voiceTranscribe } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';

const BHASHINI_ENABLED =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_BHASHINI_ENABLED === 'true';

const MAX_RECORDING_MS = 30_000;

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type WebSpeechCtor = new () => WebSpeechRecognition;

interface WebSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const { t, locale } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<WebSpeechRecognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capability check on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasMediaRecorder =
      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    const hasWebSpeech = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    setSupported(BHASHINI_ENABLED ? hasMediaRecorder : hasWebSpeech);
  }, []);

  function clearStopTimer() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  async function startBhashini() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';
    const rec = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setBusy(true);
      try {
        // Pull a Supabase JWT if we have one — backend's voice route requires
        // auth in non-mock mode (audio is PHI).
        let token: string | undefined;
        const sb = getSupabase();
        if (sb) {
          const { data } = await sb.auth.getSession();
          token = data.session?.access_token ?? undefined;
        }
        const result = await voiceTranscribe(blob, locale, token);
        // Backend returns the English transcript + the verdict already computed.
        // Surface the English transcript to the parent so the chat UI can show
        // what the system understood. The parent's submit flow may or may not
        // re-run triage with the same text; that's idempotent.
        if (result?.transcript_english) onTranscript(result.transcript_english);
        else if (result?.transcript_source) onTranscript(result.transcript_source);
      } catch (e) {
        console.error('Voice transcribe failed', e);
      } finally {
        setBusy(false);
      }
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    stopTimerRef.current = setTimeout(stop, MAX_RECORDING_MS);
  }

  function startWebSpeech() {
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const sr = new Ctor();
    sr.lang = locale === 'hi' ? 'hi-IN' : 'en-IN';
    sr.interimResults = false;
    sr.continuous = false;
    sr.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i]?.[0]?.transcript;
        if (alt) parts.push(alt);
      }
      const final = parts.join(' ').trim();
      if (final) onTranscript(final);
    };
    sr.onerror = (e) => {
      console.warn('SpeechRecognition error', e?.error);
    };
    sr.onend = () => {
      setRecording(false);
      clearStopTimer();
    };
    sr.start();
    speechRef.current = sr;
    setRecording(true);
    stopTimerRef.current = setTimeout(stop, MAX_RECORDING_MS);
  }

  async function start() {
    if (recording || disabled || busy) return;
    try {
      if (BHASHINI_ENABLED) await startBhashini();
      else startWebSpeech();
    } catch (e) {
      console.error('Voice start failed', e);
      setSupported(false);
    }
  }

  function stop() {
    clearStopTimer();
    if (BHASHINI_ENABLED) {
      recRef.current?.stop();
    } else {
      try {
        speechRef.current?.stop();
      } catch {
        /* noop */
      }
    }
    setRecording(false);
  }

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className="h-10 w-10 rounded-full border border-slate-700 text-slate-500 inline-flex items-center justify-center cursor-not-allowed"
        title={t('triage.voiceUnavailable')}
        aria-label={t('triage.voiceUnavailable')}
      >
        <Mic className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  const Icon = busy ? Loader2 : recording ? Square : Mic;
  const label = recording ? t('triage.stopVoice') : t('triage.startVoice');

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      className={
        'h-10 w-10 rounded-full inline-flex items-center justify-center transition-colors ' +
        (recording
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-slate-800 text-slate-200 hover:bg-slate-700') +
        ' disabled:opacity-40 disabled:cursor-not-allowed'
      }
      title={label}
      aria-label={label}
      aria-pressed={recording}
    >
      <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden />
    </button>
  );
}
