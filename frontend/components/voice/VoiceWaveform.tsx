'use client';

import { useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';

interface VoiceWaveformProps {
  /** When true, opens an AudioContext + AnalyserNode and paints bars to a canvas. */
  isRecording: boolean;
  /** Optional MediaStream — when provided, taps that stream instead of asking
   *  for a fresh getUserMedia (avoids prompting twice / racing with VoiceButton). */
  stream?: MediaStream | null;
  /** Visual height in px (canvas). */
  height?: number;
  className?: string;
}

/**
 * Plan 6.2 — VoiceWaveform. Live mic visualizer using the Web Audio API.
 * No external library; pure AudioContext + AnalyserNode + Canvas2D.
 *
 * **Privacy:** the audio buffer never leaves the AnalyserNode in this
 * component. Nothing is uploaded, recorded, or persisted by VoiceWaveform —
 * it is purely visual. The existing VoiceButton/voiceTranscribe pipeline
 * owns the upload path independently.
 *
 * **Reduced-motion contract:** falls back to the static "● Recording" pill
 * (lucide Mic icon + pulsing red dot via Tailwind animate-pulse). NEVER
 * mounts a Canvas in reduced-motion — saves CPU on entry Android.
 *
 * **Stream handling:** if `stream` is provided, it taps that. Otherwise it
 * makes its own `getUserMedia` call (browsers grant the same permission to
 * multiple in-page consumers; on the rare browser that races, the canvas
 * just shows silence — no error UI).
 */
export function VoiceWaveform({
  isRecording,
  stream,
  height = 64,
  className = '',
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReduced();
  const { t } = useTranslation();

  useEffect(() => {
    if (reduced) return;
    if (!isRecording) return;
    if (typeof window === 'undefined') return;

    let raf = 0;
    let ownedStream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let cancelled = false;

    async function start() {
      try {
        const useStream =
          stream ??
          (await navigator.mediaDevices.getUserMedia({ audio: true }));
        if (cancelled) {
          if (!stream) useStream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        if (!stream) ownedStream = useStream;

        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new Ctx();
        source = audioCtx.createMediaStreamSource(useStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        source.connect(analyser);

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const data = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          if (cancelled || !analyser) return;
          analyser.getByteFrequencyData(data);

          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          const barCount = Math.min(48, data.length);
          const barWidth = (w / barCount) * 0.78;
          const gap = (w / barCount) * 0.22;

          for (let i = 0; i < barCount; i++) {
            // Sample evenly across the spectrum.
            const idx = Math.floor((i / barCount) * data.length);
            const amp = data[idx] / 255; // 0..1
            const barH = Math.max(2, amp * h * 0.95);

            // Hue interpolation: 260° (purple) -> 180° (teal) by amplitude.
            const hue = 260 - amp * 80;
            const sat = 70;
            const light = 55 + amp * 10;
            ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;

            const x = i * (barWidth + gap);
            const y = h - barH;
            ctx.fillRect(x, y, barWidth, barH);
          }

          raf = requestAnimationFrame(draw);
        };

        draw();
      } catch (err) {
        // Permission denied / stream conflict — silently falls through to a
        // blank canvas rather than blocking the recording flow.
        // eslint-disable-next-line no-console
        console.warn('VoiceWaveform: mic init failed', err);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        /* noop */
      }
      try {
        // Safari requires close() to be guarded.
        if (audioCtx && audioCtx.state !== 'closed') void audioCtx.close();
      } catch {
        /* noop */
      }
      ownedStream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [isRecording, reduced, stream]);

  // Resize canvas to its CSS-rendered size to keep pixels crisp without DPR jank.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }, [isRecording, height]);

  if (!isRecording) return null;

  if (reduced) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={t('voice.recordingAria')}
        className={`inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-300 ${className}`}
      >
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <Mic className="h-3 w-3" aria-hidden />
        <span>{t('voice.recordingPill')}</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t('voice.recordingAria')}
      className={`block w-full rounded-md bg-[#0f0a1e]/70 ${className}`}
      style={{ height }}
    />
  );
}
