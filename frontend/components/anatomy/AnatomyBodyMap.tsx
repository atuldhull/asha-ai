'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  REGIONS_BY_ID,
  type BodyRegion,
} from '@/lib/body-map/regions';
import type { Pin } from '@/lib/types';

/**
 * Plan 6.1 — full-screen realistic anatomy body map.
 *
 * Replaces the procedural Three.js placeholder with a high-fidelity
 * écorché (muscular-system) reference image plus an absolutely-positioned
 * tap-target overlay. Two figures: anterior (left) + posterior (right),
 * matching the supplied reference plate.
 *
 * Why 2D image instead of the 3D scene:
 *   - No WebGL2 requirement → works on the low-end rural Android the whole
 *     product targets (the 3D route hard-redirected those devices away).
 *   - Photoreal anatomy reads as a real clinical tool, not a toy.
 *
 * The overlay div shrink-wraps the <img> exactly (img is display:block,
 * overlay is inset-0 absolute), so every hotspot percentage is relative to
 * the rendered image box and stays aligned at any screen size.
 *
 * Region ids are byte-identical to regions.ts, so Pin / PainPanel / triage
 * submission downstream are unchanged.
 */

const IMAGE_SRC = '/anatomy/muscular-system.png';

/** Hotspot centre as a percentage of the image box. r = tap radius (%). */
interface Hotspot {
  id: string;
  x: number;
  y: number;
  r?: number;
}

/**
 * Coordinates calibrated to the anterior (left) + posterior (right)
 * écorché plate. Anterior figure ≈ x28 centre; posterior ≈ x72 centre.
 * Anterior view faces the viewer, so patient-right regions sit on the
 * viewer's left (lower x%) and patient-left on the right (higher x%).
 * Posterior view is mirrored. Targets are deliberately generous — large
 * tap zones are the right call for shaky low-end touchscreens anyway.
 */
const HOTSPOTS: Hotspot[] = [
  /* ── Anterior figure (left) ── */
  { id: 'head_front', x: 28, y: 8, r: 3.4 },
  { id: 'face', x: 28, y: 11, r: 2.6 },
  { id: 'neck_front', x: 28, y: 16.5, r: 2.4 },
  { id: 'shoulder_right', x: 20.5, y: 19.5, r: 3 },
  { id: 'shoulder_left', x: 35.5, y: 19.5, r: 3 },
  { id: 'chest_right_anterior', x: 24.5, y: 25, r: 3 },
  { id: 'chest_left_anterior', x: 31.5, y: 25, r: 3 },
  { id: 'sternum', x: 28, y: 25.5, r: 2.2 },
  { id: 'upper_abdomen_right', x: 25, y: 31, r: 2.8 },
  { id: 'upper_abdomen_left', x: 31, y: 31, r: 2.8 },
  { id: 'epigastrium', x: 28, y: 30, r: 2.2 },
  { id: 'lower_abdomen_right', x: 25.5, y: 38, r: 2.8 },
  { id: 'lower_abdomen_left', x: 30.5, y: 38, r: 2.8 },
  { id: 'suprapubic', x: 28, y: 44, r: 2.6 },
  { id: 'pelvis', x: 28, y: 47.5, r: 3 },
  { id: 'groin', x: 28, y: 50.5, r: 2.4 },
  { id: 'upper_arm_right', x: 18, y: 28, r: 2.8 },
  { id: 'upper_arm_left', x: 38, y: 28, r: 2.8 },
  { id: 'elbow_right', x: 16, y: 36, r: 2.4 },
  { id: 'elbow_left', x: 40, y: 36, r: 2.4 },
  { id: 'forearm_right', x: 14.5, y: 43, r: 2.6 },
  { id: 'forearm_left', x: 41.5, y: 43, r: 2.6 },
  { id: 'wrist_right', x: 13.5, y: 50, r: 2.2 },
  { id: 'wrist_left', x: 42.5, y: 50, r: 2.2 },
  { id: 'hand_right', x: 12.5, y: 55, r: 2.8 },
  { id: 'hand_left', x: 43.5, y: 55, r: 2.8 },
  { id: 'thigh_right', x: 24.5, y: 60, r: 3.2 },
  { id: 'thigh_left', x: 31.5, y: 60, r: 3.2 },
  { id: 'knee_right', x: 24.5, y: 71, r: 2.6 },
  { id: 'knee_left', x: 31.5, y: 71, r: 2.6 },
  { id: 'calf_right', x: 24.5, y: 80, r: 2.8 },
  { id: 'calf_left', x: 31.5, y: 80, r: 2.8 },
  { id: 'ankle_right', x: 25, y: 89, r: 2.2 },
  { id: 'ankle_left', x: 31, y: 89, r: 2.2 },
  { id: 'foot_right', x: 25, y: 94, r: 2.6 },
  { id: 'foot_left', x: 31, y: 94, r: 2.6 },
  /* ── Posterior figure (right) ── */
  { id: 'head_back', x: 72, y: 8, r: 3.4 },
  { id: 'neck_back', x: 72, y: 16.5, r: 2.4 },
  { id: 'upper_back_left', x: 68.5, y: 25, r: 3 },
  { id: 'upper_back_right', x: 75.5, y: 25, r: 3 },
  { id: 'mid_back', x: 72, y: 32, r: 3 },
  { id: 'lower_back', x: 72, y: 40, r: 3 },
  { id: 'buttocks_left', x: 68.5, y: 48, r: 3 },
  { id: 'buttocks_right', x: 75.5, y: 48, r: 3 },
  { id: 'back_thigh_left', x: 68.5, y: 60, r: 3.2 },
  { id: 'back_thigh_right', x: 75.5, y: 60, r: 3.2 },
  { id: 'calf_back_left', x: 68.5, y: 80, r: 2.8 },
  { id: 'calf_back_right', x: 75.5, y: 80, r: 2.8 },
  { id: 'heel_left', x: 68.5, y: 94, r: 2.4 },
  { id: 'heel_right', x: 75.5, y: 94, r: 2.4 },
];

const HOTSPOT_BY_ID: Record<string, Hotspot> = Object.fromEntries(
  HOTSPOTS.map((h) => [h.id, h]),
);

const PIN_INTENSITY_COLORS = [
  '#86efac', '#bef264', '#fde047', '#fdba74', '#fb923c',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d',
];

export interface AnatomySelection {
  region: BodyRegion;
}

interface AnatomyBodyMapProps {
  pins: Pin[];
  maxPins?: number;
  onRegionTap: (selection: AnatomySelection) => void;
  locale?: 'en' | 'hi' | 'kn';
}

export function AnatomyBodyMap({
  pins,
  maxPins = 5,
  onRegionTap,
  locale = 'en',
}: AnatomyBodyMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const atCap = pins.length >= maxPins;

  const handleTap = useCallback(
    (id: string) => {
      const region = REGIONS_BY_ID[id];
      if (!region || atCap) return;
      onRegionTap({ region });
    },
    [atCap, onRegionTap],
  );

  const layLabel = useCallback(
    (region: BodyRegion) =>
      locale === 'hi'
        ? region.layperson_hi
        : locale === 'kn'
          ? region.layperson_kn
          : region.layperson_en,
    [locale],
  );

  const placedIds = useMemo(
    () => new Set(pins.map((p) => p.body_region)),
    [pins],
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#070b14]">
      {/* Clinical-scanner backdrop: faint cyan grid + radial vignette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.35) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 78%)',
        }}
      />

      {/* Image + hotspot overlay — the frame shrink-wraps the <img> so
          every percentage coordinate maps onto the rendered image box. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative h-full max-h-full"
        style={{ aspectRatio: '1.05 / 1' }}
      >
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={IMAGE_SRC}
            alt="Human muscular anatomy — anterior and posterior views"
            onError={() => setImgError(true)}
            className="block h-full w-full select-none object-contain drop-shadow-[0_0_45px_rgba(56,189,248,0.18)]"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center">
            <p className="text-sm font-medium text-slate-300">
              Anatomy image not found
            </p>
            <p className="max-w-xs text-xs text-slate-500">
              Drop the muscular-system reference at
              <br />
              <code className="text-emerald-400">
                frontend/public/anatomy/muscular-system.png
              </code>
              <br />
              The body map below is still fully tappable.
            </p>
          </div>
        )}

        {/* Tap-target overlay — exactly covers the image box. */}
        <div className="absolute inset-0">
          {HOTSPOTS.map((h) => {
            const region = REGIONS_BY_ID[h.id];
            if (!region) return null;
            const isHover = hovered === h.id;
            const isPlaced = placedIds.has(h.id);
            const d = (h.r ?? 3) * 2;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => handleTap(h.id)}
                onMouseEnter={() => setHovered(h.id)}
                onMouseLeave={() => setHovered((c) => (c === h.id ? null : c))}
                onFocus={() => setHovered(h.id)}
                onBlur={() => setHovered((c) => (c === h.id ? null : c))}
                disabled={atCap && !isPlaced}
                aria-label={`${region.clinical_term} — ${layLabel(region)}`}
                title={layLabel(region)}
                className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-150 focus:outline-none disabled:cursor-not-allowed"
                style={{
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: `${d}%`,
                  height: `${d}%`,
                }}
              >
                <span
                  aria-hidden
                  className={`absolute inset-0 rounded-full border transition-all duration-150 ${
                    isHover
                      ? 'border-emerald-400/90 bg-emerald-400/25 shadow-[0_0_20px_rgba(52,211,153,0.55)]'
                      : 'border-cyan-300/0 bg-cyan-300/0 group-hover:border-cyan-300/40'
                  }`}
                />
                {isHover && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300"
                  />
                )}
              </button>
            );
          })}

          {/* Placed pins — colour-coded by intensity. */}
          {pins.map((pin, i) => {
            const h = HOTSPOT_BY_ID[pin.body_region];
            if (!h) return null;
            const color =
              PIN_INTENSITY_COLORS[
                Math.max(0, Math.min(9, pin.intensity - 1))
              ] ?? '#fdba74';
            return (
              <div
                key={`${pin.body_region}-${i}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
              >
                <span
                  className="block h-3 w-3 rounded-full ring-2 ring-white/70"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 12px ${color}`,
                  }}
                />
                <span
                  className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full motion-reduce:animate-none"
                  style={{ backgroundColor: color, opacity: 0.18 }}
                />
                <span
                  className="absolute left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ border: `1px solid ${color}` }}
                >
                  {pin.intensity}/10
                </span>
              </div>
            );
          })}
        </div>

        {/* View captions. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-around px-[10%] text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
          <span>Front</span>
          <span>Back</span>
        </div>
      </motion.div>
    </div>
  );
}
