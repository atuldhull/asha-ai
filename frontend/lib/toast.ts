'use client';

/**
 * Lightweight toast notification system. Sonner-style API without the
 * library — keeps the bundle small and avoids another dep that fights
 * Next.js 14 RSC boundaries.
 *
 * Usage anywhere in client code:
 *   import { toast } from '@/lib/toast';
 *   toast.success('Pin saved');
 *   toast.error('Could not record consent');
 *   toast.info('Backend not connected — using local mode');
 *
 * Reduced-motion: <Toaster> handles animation collapse. Toasts always
 * dismiss on click; auto-dismiss timers fire regardless.
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
  /** ms before auto-dismiss. 0 = sticky. */
  duration: number;
  /** Optional secondary description / action label. */
  description?: string;
  createdAt: number;
}

const EVENT_NAME = 'asha-ai:toast';
const DEFAULT_DURATION = 4000;

interface ToastEventDetail {
  message: string;
  variant: ToastVariant;
  duration?: number;
  description?: string;
}

function fire(detail: ToastEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(EVENT_NAME, { detail }));
}

export const toast = {
  success(message: string, opts: { description?: string; duration?: number } = {}) {
    fire({ message, variant: 'success', ...opts });
  },
  error(message: string, opts: { description?: string; duration?: number } = {}) {
    fire({ message, variant: 'error', duration: opts.duration ?? 6000, description: opts.description });
  },
  info(message: string, opts: { description?: string; duration?: number } = {}) {
    fire({ message, variant: 'info', ...opts });
  },
  warning(message: string, opts: { description?: string; duration?: number } = {}) {
    fire({ message, variant: 'warning', duration: opts.duration ?? 5000, description: opts.description });
  },
};

export function subscribeToasts(handler: (detail: ToastEntry) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  function listener(e: Event) {
    const ce = e as CustomEvent<ToastEventDetail>;
    const detail = ce.detail;
    handler({
      id: crypto.randomUUID(),
      message: detail.message,
      variant: detail.variant,
      duration: detail.duration ?? DEFAULT_DURATION,
      description: detail.description,
      createdAt: Date.now(),
    });
  }
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
