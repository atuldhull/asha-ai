'use client';

import { Globe } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/dict';

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  return (
    <label className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-transparent text-slate-300 text-xs h-8 pl-2 pr-1 hover:border-slate-500 transition-colors">
      <Globe className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent text-slate-100 text-xs h-full pr-1 pl-1 focus:outline-none cursor-pointer"
        aria-label="Choose language"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="bg-[#0a0e1a] text-slate-100">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
