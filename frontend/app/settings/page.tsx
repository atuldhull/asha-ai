'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight, ShieldCheck, Users } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useTranslation } from '@/lib/i18n/I18nProvider';

interface SettingsCardProps {
  href: string;
  title: string;
  body: string;
  Icon: typeof ShieldCheck;
  tone: 'emerald' | 'sky';
}

const TONES = {
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  sky: 'border-sky-500/30 bg-sky-500/5 text-sky-300',
};

function SettingsCard({ href, title, body, Icon, tone }: SettingsCardProps) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/60"
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${TONES[tone]}`}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{body}</p>
      </div>
      <ChevronRight
        className="h-5 w-5 flex-shrink-0 text-slate-600 group-hover:text-slate-400"
        aria-hidden
      />
    </Link>
  );
}

export default function SettingsLandingPage() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main className="flex-1 bg-[#0a0e1a] px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('common.back')}
          </Link>

          <header className="mb-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
              {t('settings.kicker')}
            </p>
            <h1 className="text-2xl font-bold text-slate-100">{t('settings.title')}</h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {t('settings.subtitle')}
            </p>
          </header>

          <div className="space-y-3">
            <SettingsCard
              href="/settings/family"
              title={t('settings.family.title')}
              body={t('settings.family.body')}
              Icon={Users}
              tone="sky"
            />
            <SettingsCard
              href="/settings/privacy"
              title={t('settings.privacy.title')}
              body={t('settings.privacy.body')}
              Icon={ShieldCheck}
              tone="emerald"
            />
          </div>

          <p className="mt-6 text-[10px] text-slate-600 leading-relaxed">
            {t('settings.footer')}
          </p>
        </div>
      </main>
    </>
  );
}
