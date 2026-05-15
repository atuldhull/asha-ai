'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  submitVisionTriage,
  validateImage,
  VisionUploadError,
  type VisionTriageResponse,
} from '@/lib/vision';
import { useReduced } from '@/lib/reduced-motion';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { useUser } from '@/lib/auth';
import { getActiveProfile } from '@/lib/family-graph';

interface ImageUploadButtonProps {
  /** Called with the verdict once vision triage returns successfully. */
  onVerdict: (verdict: VisionTriageResponse) => void;
  disabled?: boolean;
}

/**
 * Plan 6.5 step 10 — image upload entry point on /triage.
 *
 * Small button next to the mic + 3D body buttons. Tap → opens a modal with
 * drag-and-drop + "Use camera" + "Pick from gallery" options. Preview the
 * selected image, optional caption field, "Get triage" submit. Backend
 * endpoint may not exist yet — `lib/vision.ts` falls back to a preview-only
 * synthetic verdict so the UX still works.
 */
export function ImageUploadButton({ onVerdict, disabled }: ImageUploadButtonProps) {
  const { t } = useTranslation();
  const reduced = useReduced();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Generate + revoke object URLs cleanly so we don't leak memory.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = useCallback(() => {
    setFile(null);
    setContext('');
    setError(null);
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, []);

  function close() {
    setOpen(false);
    reset();
  }

  function handlePick(picked: File | null) {
    if (!picked) return;
    try {
      validateImage(picked);
      setFile(picked);
      setError(null);
    } catch (err) {
      if (err instanceof VisionUploadError) {
        setError(t(`vision.error.${err.code}`) || err.message);
      } else {
        setError(t('vision.error.unknown'));
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handlePick(f);
  }

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const profileAge =
        user && getActiveProfile(user.id)?.age
          ? Number(getActiveProfile(user.id)!.age)
          : undefined;
      const verdict = await submitVisionTriage({
        image: file,
        context: context.trim() || undefined,
        age: profileAge,
      });
      onVerdict(verdict);
      close();
    } catch (err) {
      if (err instanceof VisionUploadError) {
        setError(t(`vision.error.${err.code}`) || err.message);
      } else {
        setError(t('vision.error.unknown'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={t('vision.openButton')}
        title={t('vision.openButtonTitle')}
        className="relative h-10 w-10 rounded-lg border border-slate-800 bg-[#111728] text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ImageIcon className="h-5 w-5" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="vision-backdrop"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm"
              aria-hidden
              onClick={close}
            />
            <motion.div
              key="vision-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t('vision.dialogAria')}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-700 bg-[#0f1421] shadow-2xl"
            >
              <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-5 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
                    {t('vision.kicker')}
                  </p>
                  <h2 className="text-base font-semibold text-slate-100">
                    {t('vision.title')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t('privacy.cancel')}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </header>

              <div className="px-5 py-4 space-y-3">
                {!file ? (
                  <>
                    <label
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
                        dragOver
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-700 hover:border-slate-600 bg-slate-900/40'
                      }`}
                    >
                      <Upload className="h-6 w-6 text-slate-400" aria-hidden />
                      <span className="text-sm text-slate-300 font-medium">
                        {t('vision.dropHint')}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {t('vision.fileTypes')}
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden />
                        {t('vision.useCamera')}
                      </button>
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {previewUrl && (
                        <img
                          src={previewUrl}
                          alt={t('vision.previewAlt')}
                          className="block w-full max-h-[40vh] object-contain"
                        />
                      )}
                      <button
                        type="button"
                        onClick={reset}
                        aria-label={t('vision.changeImage')}
                        className="absolute top-2 right-2 rounded-full bg-slate-950/80 p-1.5 text-slate-300 hover:bg-slate-950 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>

                    <div>
                      <label
                        htmlFor="vision-context"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        {t('vision.contextLabel')}
                        <span className="ml-1 text-slate-500">
                          ({t('vision.optional')})
                        </span>
                      </label>
                      <textarea
                        id="vision-context"
                        value={context}
                        onChange={(e) => setContext(e.target.value)}
                        rows={2}
                        maxLength={300}
                        placeholder={t('vision.contextPlaceholder')}
                        className="w-full resize-none rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </>
                )}

                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                  {t('vision.previewBanner')}
                </p>

                {error && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
                    {error}
                  </p>
                )}
              </div>

              <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
                >
                  {t('privacy.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!file || submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  )}
                  {submitting ? t('vision.analyzing') : t('vision.submit')}
                </button>
              </footer>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
