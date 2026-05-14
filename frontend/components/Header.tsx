'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isUsingMock } from '@/lib/api';

/**
 * Sticky top navigation with brand + "mock mode" badge when no backend is wired.
 * Used by both the landing page and the triage page.
 */
export function Header() {
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    setUsingMock(isUsingMock());
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0a0e1a]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          aria-label="ASHA-AI home"
        >
          <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-500" aria-hidden />
          <span>ASHA-AI</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-500 hidden sm:inline">
            triage
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {usingMock && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
              title="No backend connected — using built-in mock triage logic"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
              mock mode
            </span>
          )}
          <Link
            href="/triage"
            className="rounded-md px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            Triage
          </Link>
        </nav>
      </div>
    </header>
  );
}
