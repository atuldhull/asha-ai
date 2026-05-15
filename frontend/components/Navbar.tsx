'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Globe2, LogOut, Stethoscope, History, ShieldCheck, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isUsingMock } from '@/lib/api';
import { useUser, signOut } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MuteToggle } from './MuteToggle';
import { PatientSwitcher } from './PatientSwitcher';

export function Navbar() {
  const router = useRouter();
  const { user, loading } = useUser();
  const { t } = useTranslation();
  const [usingMock, setUsingMock] = useState(false);

  useEffect(() => {
    setUsingMock(isUsingMock());
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0a0e1a]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold tracking-tight text-slate-100 transition-opacity hover:opacity-80"
          aria-label="ASHA-AI home"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4a5a2a] text-white"
            aria-hidden
          >
            <Activity className="h-4 w-4" />
          </span>
          <span className="font-[var(--font-display)] text-lg text-[#2e2218]">ASHA-AI</span>
          <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-slate-500 hidden sm:inline">
            triage
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          {usingMock && (
            <span
              className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-300"
              title="No backend connected — using built-in mock triage logic"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              mock mode
            </span>
          )}

          <LanguageSwitcher />
          <MuteToggle />
          <ThemeToggle />

          {!loading && user ? (
            <>
              <PatientSwitcher />
              {user.role === 'doctor' && (
                <>
                  <Link
                    href="/doctor/dashboard"
                    className="hidden sm:inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                  >
                    <Stethoscope className="h-4 w-4" aria-hidden />
                    {t('nav.cockpit')}
                  </Link>
                  <Link
                    href="/admin/outbreak"
                    className="hidden md:inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                    title={t('nav.outbreak')}
                    aria-label={t('nav.outbreak')}
                  >
                    <Globe2 className="h-4 w-4" aria-hidden />
                  </Link>
                </>
              )}
              {user.role === 'asha' && (
                <Link
                  href="/asha"
                  className="hidden sm:inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                  title={t('nav.asha')}
                >
                  <Stethoscope className="h-4 w-4" aria-hidden />
                  {t('nav.asha')}
                </Link>
              )}
              <Link
                href="/history"
                className="hidden sm:inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <History className="h-4 w-4" aria-hidden />
                {t('nav.history')}
              </Link>
              <Link
                href="/triage"
                className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                {t('nav.triage')}
              </Link>
              <Link
                href="/settings"
                className="hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                title={t('nav.settings')}
                aria-label={t('nav.settings')}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </Link>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                title={`${t('nav.signOut')} · ${user.phone}`}
                aria-label={t('nav.signOut')}
              >
                <UserCircle2 className="h-5 w-5" aria-hidden />
                <LogOut className="h-3.5 w-3.5 hidden sm:inline" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/triage"
                className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                {t('nav.triage')}
              </Link>
              <Link
                href="/sign-in"
                className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                {t('nav.signIn')}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
