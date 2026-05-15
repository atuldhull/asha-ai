'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { subscribeToasts, type ToastEntry } from '@/lib/toast';
import { useReduced } from '@/lib/reduced-motion';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES: Record<ToastEntry['variant'], string> = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  error: 'border-red-500/40 bg-red-500/10 text-red-100',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
};

const ICON_TONE: Record<ToastEntry['variant'], string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-sky-400',
  warning: 'text-amber-400',
};

const MAX_TOASTS = 4;

/**
 * Mounts a fixed bottom-right toast stack. Listens for `asha-ai:toast`
 * CustomEvents fired by `lib/toast.ts`. Auto-dismisses per-toast duration;
 * click anywhere on the toast to dismiss immediately.
 *
 * Render in the root layout once, OUTSIDE any route-specific tree, so
 * toasts persist across navigation.
 *
 * Reduced-motion: collapses animation. Bottom anchoring kept for
 * predictable focus order (always after main content for screen readers).
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const reduced = useReduced();

  useEffect(() => {
    return subscribeToasts((entry) => {
      setToasts((prev) => [...prev, entry].slice(-MAX_TOASTS));
      if (entry.duration > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== entry.id));
        }, entry.duration);
      }
    });
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:right-4 sm:left-auto sm:bottom-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <motion.div
              key={t.id}
              initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? undefined : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              role="status"
              className={`pointer-events-auto w-full max-w-sm rounded-lg border bg-[#0f1421]/95 backdrop-blur px-3.5 py-2.5 shadow-2xl flex items-start gap-2.5 ${STYLES[t.variant]}`}
              onClick={() => dismiss(t.id)}
            >
              <Icon
                className={`h-4 w-4 flex-shrink-0 mt-0.5 ${ICON_TONE[t.variant]}`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{t.message}</p>
                {t.description && (
                  <p className="mt-0.5 text-[11px] opacity-80 leading-snug">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                aria-label="Dismiss"
                className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
