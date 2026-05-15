'use client';

import { useReducedMotion } from 'framer-motion';

/**
 * Plan 6.1 reduced-motion convenience hook. Returns a strict boolean (not
 * `true | null` like framer-motion's primitive) so 3D / animation code can
 * use it as a guard without nullish-coalescing every check.
 *
 * Convention across the app: every animation primitive (sparkline, R3F
 * scenes, GSAP timelines, Lenis smooth scroll) MUST short-circuit to a
 * non-animated fallback when this returns true. Required for the DPDP a11y
 * posture per FRONTEND_BLUEPRINT §1.
 */
export function useReduced(): boolean {
  const r = useReducedMotion();
  return !!r;
}
