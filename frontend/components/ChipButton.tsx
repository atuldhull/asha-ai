'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Small pill-shaped quick-action button used for sample-symptom chips
 * on the triage page.
 */
export const ChipButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-[#111728] px-3 py-1.5 text-xs font-medium text-slate-300',
      'hover:border-emerald-500/50 hover:text-emerald-300 hover:bg-emerald-500/5',
      'disabled:opacity-40 disabled:pointer-events-none',
      'transition-colors',
      className
    )}
    {...props}
  >
    {children}
  </button>
));

ChipButton.displayName = 'ChipButton';
