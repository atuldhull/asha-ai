import { AlertTriangle } from 'lucide-react';
import { DISCLAIMER } from '@/lib/types';

/**
 * Mandatory disclaimer footer per the BMSIT brief — appears on every page.
 * Required: "not a replacement for professional medical diagnosis".
 */
export function DisclaimerFooter() {
  return (
    <footer className="border-t border-slate-200 bg-amber-50 dark:border-slate-800 dark:bg-amber-950/30">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 sm:text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Disclaimer:</strong> {DISCLAIMER}{' '}
          ASHA-AI is an AI assistant per India Telemedicine Practice Guidelines 2020 — it{' '}
          <em>assists</em> a registered medical practitioner; it does not diagnose or prescribe.
        </p>
      </div>
    </footer>
  );
}
