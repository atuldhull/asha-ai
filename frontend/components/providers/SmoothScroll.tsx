'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { useReduced } from '@/lib/reduced-motion';

/**
 * Plan 6.2 — SmoothScroll provider (Lenis).
 *
 * Wraps marketing-style children with a smooth-scroll instance so long
 * pages (landing, pitch, about) feel cinematic. **CRITICAL: never wrap a
 * triage / verdict / cockpit route — clinical UIs need 1:1 native scroll
 * for tap precision.** Per [FRONTEND_BLUEPRINT §3.5](docs/FRONTEND_BLUEPRINT.md#35--smooth-scroll-provider-lenis).
 *
 * Reduced-motion contract: when `prefers-reduced-motion: reduce` is set,
 * Lenis is **never instantiated** — the component becomes a pure
 * pass-through render. No hidden frame loop, no extra CPU.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReduced();

  useEffect(() => {
    if (reduced) return;
    if (typeof window === 'undefined') return;

    const lenis = new Lenis({
      duration: 1.2,
      // Standard "smooth" easing — power4-out feel.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      orientation: 'vertical',
    });

    let raf = 0;
    function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
