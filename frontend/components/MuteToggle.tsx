'use client';

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, setMuted } from '@/lib/audio';

export function MuteToggle() {
  const [muted, setMutedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMutedState(isMuted());
    function onChange(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail;
      setMutedState(typeof detail === 'boolean' ? detail : isMuted());
    }
    window.addEventListener('asha-ai:mute-change', onChange);
    return () => window.removeEventListener('asha-ai:mute-change', onChange);
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  if (!mounted) {
    return (
      <button
        type="button"
        className="h-8 w-8 rounded-md border border-slate-700 bg-transparent"
        aria-label="Toggle sound"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-transparent text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors"
      aria-label={muted ? 'Unmute audio cues' : 'Mute audio cues'}
      aria-pressed={muted}
      title={muted ? 'Audio cues are muted' : 'Audio cues are on'}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
}
