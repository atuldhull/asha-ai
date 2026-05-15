'use client';

import { useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReduced } from '@/lib/reduced-motion';

gsap.registerPlugin(useGSAP);

/**
 * App-wide route entrance. Every navigation gets a single soft rise+fade
 * on the page content so the whole site feels as deliberate as the
 * landing — without per-page animation code.
 *
 * Keyed on `usePathname()` so the tween re-fires on each route change.
 * Reduced-motion: no-op pass-through (the `useReduced` guard early-returns
 * before any GSAP runs; content renders instantly).
 *
 * Uses only core `gsap` (no plugin) so it adds ~0 KB to every route.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scope = useRef<HTMLDivElement>(null);
  const reduced = useReduced();

  useGSAP(
    () => {
      if (reduced) return;
      gsap.from(scope.current, {
        autoAlpha: 0,
        y: 14,
        duration: 0.45,
        ease: 'power2.out',
        clearProps: 'transform,opacity,visibility',
      });
    },
    { scope, dependencies: [pathname, reduced] },
  );

  return (
    <div ref={scope} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
