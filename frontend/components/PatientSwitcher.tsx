'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Plus, UserCircle2, Users } from 'lucide-react';
import {
  ensureSelfProfile,
  getActiveProfile,
  listProfiles,
  setActiveProfile,
  type PatientProfile,
} from '@/lib/family-graph';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';

const RELATIONSHIP_EMOJI: Record<PatientProfile['relationship'], string> = {
  self: '🙂',
  spouse: '💑',
  parent: '👨‍👩‍👧',
  child: '🧒',
  sibling: '👫',
  grandparent: '👵',
  grandchild: '👶',
  in_law: '🏠',
  other: '👤',
};

/**
 * Plan 7.x — Patient profile switcher in the Navbar. Shows the active
 * family profile with a dropdown to switch or add new profiles. Auto-
 * creates a "self" profile on first render so signed-in users always have
 * at least one option.
 *
 * Hidden when not signed in (anonymous triage doesn't use the family graph).
 */
export function PatientSwitcher() {
  const { user } = useUser();
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [active, setActive] = useState<PatientProfile | null>(null);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (!user) {
      setProfiles([]);
      setActive(null);
      return;
    }
    ensureSelfProfile(user.id, { display_name: t('family.you') });
    setProfiles(listProfiles(user.id));
    setActive(getActiveProfile(user.id));
  }, [user, t]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('asha-ai:family-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('asha-ai:family-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const activeEmoji = active ? RELATIONSHIP_EMOJI[active.relationship] : '👤';
  const activeLabel = active?.display_name ?? t('family.you');

  function handlePick(profileId: string) {
    if (!user) return;
    setActiveProfile(user.id, profileId);
    setOpen(false);
  }

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('family.switcherAria')}
        className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 text-xs text-slate-200 hover:border-slate-600 hover:bg-slate-800/50 transition-colors"
      >
        <span aria-hidden className="text-sm leading-none">{activeEmoji}</span>
        <span className="max-w-[80px] truncate font-medium">{activeLabel}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('family.switcherAria')}
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-slate-700 bg-[#0f1421] shadow-2xl"
        >
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {t('family.title')}
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {profiles.map((p) => {
              const isActive = p.id === active?.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(p.id)}
                    role="option"
                    aria-selected={isActive}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-200'
                        : 'text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span aria-hidden className="text-base leading-none">
                        {RELATIONSHIP_EMOJI[p.relationship]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {p.display_name}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {t(`family.relationship.${p.relationship}`)} · {p.age}
                          {p.sex !== 'other' ? ` · ${p.sex}` : ''}
                        </span>
                      </span>
                    </span>
                    {isActive && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-800 p-2 flex gap-1.5">
            <Link
              href="/settings/family"
              onClick={() => setOpen(false)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              {t('family.manage')}
            </Link>
            <Link
              href="/settings/family?add=1"
              onClick={() => setOpen(false)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/40 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t('family.addPerson')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
