'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { toast } from '@/lib/toast';
import {
  addProfile,
  ensureSelfProfile,
  getActiveProfileId,
  listProfiles,
  removeProfile,
  setActiveProfile,
  updateProfile,
  type PatientProfile,
  type Relationship,
} from '@/lib/family-graph';
import type { Sex } from '@/lib/types';

const RELATIONSHIPS: Relationship[] = [
  'self',
  'spouse',
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'in_law',
  'other',
];

export default function FamilySettingsPage() {
  return (
    <Suspense fallback={
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
      </>
    }>
      <FamilySettingsInner />
    </Suspense>
  );
}

function FamilySettingsInner() {
  const { user } = useUser();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [editing, setEditing] = useState<PatientProfile | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = useCallback(() => {
    if (!user) return;
    ensureSelfProfile(user.id, { display_name: t('family.you') });
    setProfiles(listProfiles(user.id));
    setActiveIdState(getActiveProfileId());
  }, [user, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ?add=1 query param → open the add form on mount.
  useEffect(() => {
    if (searchParams.get('add') === '1') setShowAddForm(true);
  }, [searchParams]);

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="flex-1 bg-[#0a0e1a] px-4 py-12 text-center">
          <div className="mx-auto max-w-md">
            <p className="text-slate-300">{t('family.signInRequired')}</p>
            <Link
              href="/sign-in?next=/settings/family"
              className="mt-4 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
            >
              {t('nav.signIn')}
            </Link>
          </div>
        </main>
      </>
    );
  }

  function handleSetActive(id: string) {
    if (!user) return;
    const profile = profiles.find((p) => p.id === id);
    setActiveProfile(user.id, id);
    setActiveIdState(id);
    if (profile) {
      toast.info(t('family.toast.switched'), { description: profile.display_name });
    }
  }

  function handleRemove(id: string) {
    if (!user) return;
    if (!confirm(t('family.removeConfirm'))) return;
    const profile = profiles.find((p) => p.id === id);
    try {
      removeProfile(user.id, id);
      refresh();
      if (profile) {
        toast.success(t('family.toast.removed'), { description: profile.display_name });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

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
              {t('privacy.kicker')}
            </p>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="h-6 w-6 text-emerald-400" aria-hidden />
              {t('family.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {t('family.subtitle')}
            </p>
          </header>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 mb-4">
            <ul className="space-y-2">
              {profiles.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    p.id === activeId
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-slate-700 bg-slate-900/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSetActive(p.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">
                        {p.display_name}
                      </span>
                      {p.id === activeId && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t(`family.relationship.${p.relationship}`)} · {p.age}
                      {p.sex !== 'other' ? ` · ${p.sex}` : ''}
                      {p.comorbidities ? ` · ${p.comorbidities}` : ''}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      aria-label={`${t('family.edit')} ${p.display_name}`}
                    >
                      <span aria-hidden className="text-xs">✎</span>
                    </button>
                    {p.relationship !== 'self' && (
                      <button
                        type="button"
                        onClick={() => handleRemove(p.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`${t('family.remove')} ${p.display_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              disabled={profiles.length >= 8}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t('family.addPerson')}
              {profiles.length >= 8 && (
                <span className="text-[10px] text-slate-500">({t('family.cap')})</span>
              )}
            </button>
          </section>

          <p className="text-[10px] text-slate-600 leading-relaxed">
            {t('family.privacyFooter')}
          </p>
        </div>
      </main>

      {(showAddForm || editing) && (
        <ProfileForm
          userId={user.id}
          existing={editing}
          onClose={() => {
            setShowAddForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAddForm(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

interface ProfileFormProps {
  userId: string;
  existing: PatientProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProfileForm({ userId, existing, onClose, onSaved }: ProfileFormProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(existing?.display_name ?? '');
  const [age, setAge] = useState<number>(existing?.age ?? 30);
  const [sex, setSex] = useState<Sex | 'other'>(existing?.sex ?? 'other');
  const [relationship, setRelationship] = useState<Relationship>(
    existing?.relationship ?? 'parent',
  );
  const [comorbidities, setComorbidities] = useState(existing?.comorbidities ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!displayName.trim()) {
      setError(t('family.errorName'));
      return;
    }
    if (age < 0 || age > 120) {
      setError(t('family.errorAge'));
      return;
    }
    try {
      if (existing) {
        updateProfile(userId, existing.id, {
          display_name: displayName.trim(),
          age,
          sex,
          relationship,
          comorbidities: comorbidities.trim() || undefined,
        });
        toast.success(t('family.toast.updated'), { description: displayName.trim() });
      } else {
        addProfile(userId, {
          display_name: displayName.trim(),
          age,
          sex,
          relationship,
          comorbidities: comorbidities.trim() || undefined,
        });
        toast.success(t('family.toast.added'), { description: displayName.trim() });
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={existing ? t('family.editPerson') : t('family.addPerson')}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-700 bg-[#0f1421] shadow-2xl">
        <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            {existing ? t('family.editPerson') : t('family.addPerson')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('privacy.cancel')}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="space-y-3 p-5">
          <div>
            <label htmlFor="fp-name" className="block text-xs text-slate-300 mb-1">
              {t('family.field.name')}
            </label>
            <input
              id="fp-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Mom · Aarav · Self"
              className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fp-age" className="block text-xs text-slate-300 mb-1">
                {t('family.field.age')}
              </label>
              <input
                id="fp-age"
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label htmlFor="fp-sex" className="block text-xs text-slate-300 mb-1">
                {t('family.field.sex')}
              </label>
              <select
                id="fp-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as Sex | 'other')}
                className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="other">{t('family.sex.other')}</option>
                <option value="F">{t('family.sex.f')}</option>
                <option value="M">{t('family.sex.m')}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="fp-rel" className="block text-xs text-slate-300 mb-1">
              {t('family.field.relationship')}
            </label>
            <select
              id="fp-rel"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as Relationship)}
              className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500/50"
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {t(`family.relationship.${r}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fp-com" className="block text-xs text-slate-300 mb-1">
              {t('family.field.comorbidities')}
              <span className="ml-1 text-slate-500">({t('family.optional')})</span>
            </label>
            <input
              id="fp-com"
              type="text"
              value={comorbidities}
              onChange={(e) => setComorbidities(e.target.value)}
              maxLength={120}
              placeholder="e.g. diabetes, hypertension"
              className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
          >
            {t('privacy.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!displayName.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('family.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
