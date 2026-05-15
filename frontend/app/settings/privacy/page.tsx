'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import {
  CONSENT_SCOPES,
  type ConsentScope,
  type ConsentStatus,
  type DeletionStatus,
  deleteAllUserData,
  fetchConsentStatus,
  fetchDeletionStatus,
  recordConsent,
} from '@/lib/consent';

const CONFIRM_PHRASE = 'DELETE MY DATA';

export default function PrivacySettingsPage() {
  const { t, locale } = useTranslation();
  const { user } = useUser();

  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [deletion, setDeletion] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingScope, setSavingScope] = useState<ConsentScope | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [s, d] = await Promise.all([fetchConsentStatus(), fetchDeletionStatus()]);
    setStatus(s);
    setDeletion(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleScope(scope: ConsentScope) {
    if (!status) return;
    if (scope === 'triage_processing') return; // required, cannot toggle off
    const next = new Set<ConsentScope>(status.granted_scopes);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    setSavingScope(scope);
    try {
      await recordConsent(Array.from(next), locale);
      await reload();
    } finally {
      setSavingScope(null);
    }
  }

  async function handleDelete() {
    if (confirmInput.trim() !== CONFIRM_PHRASE) {
      setDeleteError(t('privacy.deleteWrongPhrase'));
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAllUserData();
    setDeleting(false);
    if ('error' in result) {
      setDeleteError(result.error);
      return;
    }
    setDeleteSuccess(
      `${t('privacy.deleteSuccess')} · ${new Date(result.hard_delete_after).toLocaleString()}`,
    );
    setShowDeleteConfirm(false);
    setConfirmInput('');
    await reload();
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
            <h1 className="text-2xl font-bold text-slate-100">
              {t('privacy.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {t('privacy.subtitle')}
            </p>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t('common.loading')}
            </div>
          ) : (
            <>
              {/* Consent posture */}
              <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <ShieldCheck className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      {t('privacy.scopesTitle')}
                    </h2>
                    {status && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {t('privacy.policyVersion')} {status.current_version}
                        {status.last_granted_at &&
                          ` · ${t('privacy.lastGranted')} ${new Date(status.last_granted_at).toLocaleString()}`}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="space-y-2">
                  {CONSENT_SCOPES.map((scope) => {
                    const granted = status?.granted_scopes.includes(scope) ?? false;
                    const required = scope === 'triage_processing';
                    const isSaving = savingScope === scope;
                    return (
                      <li
                        key={scope}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                          granted
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-slate-700 bg-slate-900/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-100">
                              {t(`consent.scope.${scope}.title`)}
                            </span>
                            {required && (
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">
                                {t('consent.required')}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {t(`consent.scope.${scope}.body`)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleScope(scope)}
                          disabled={required || isSaving}
                          aria-pressed={granted}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                            granted ? 'bg-emerald-500' : 'bg-slate-700'
                          } ${required ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label={`${t(`consent.scope.${scope}.title`)} — ${granted ? t('privacy.toggleOn') : t('privacy.toggleOff')}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                              granted ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                          {isSaving && (
                            <Loader2
                              className="absolute -right-6 h-3.5 w-3.5 animate-spin text-slate-500"
                              aria-hidden
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Right-to-deletion */}
              <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <Trash2 className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      {t('privacy.deleteTitle')}
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {t('privacy.deleteBody')}
                    </p>
                  </div>
                </div>

                {deletion?.has_pending_deletion ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12px] text-amber-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      <span className="font-semibold">
                        {t('privacy.deletePending')}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {t('privacy.deletePendingBody')}{' '}
                      {deletion.hard_delete_after &&
                        new Date(deletion.hard_delete_after).toLocaleString()}
                    </p>
                  </div>
                ) : deleteSuccess ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-[12px] text-emerald-200">
                    <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5" aria-hidden />
                    {deleteSuccess}
                  </div>
                ) : showDeleteConfirm ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" aria-hidden />
                        <p className="text-[12px] text-red-200 leading-relaxed">
                          {t('privacy.deleteConfirmIntro')}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="confirm-phrase"
                        className="block text-xs text-slate-300 mb-1"
                      >
                        {t('privacy.deleteConfirmLabel').replace(
                          '{phrase}',
                          CONFIRM_PHRASE,
                        )}
                      </label>
                      <input
                        id="confirm-phrase"
                        type="text"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder={CONFIRM_PHRASE}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="w-full rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500/50"
                      />
                    </div>
                    {deleteError && (
                      <p className="text-[11px] text-red-300">{deleteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setConfirmInput('');
                          setDeleteError(null);
                        }}
                        disabled={deleting}
                        className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
                      >
                        {t('privacy.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={
                          deleting || confirmInput.trim() !== CONFIRM_PHRASE
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deleting && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        )}
                        {t('privacy.deleteConfirmButton')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!user}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t('privacy.deleteCta')}
                  </button>
                )}
                {!user && !deletion?.has_pending_deletion && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    {t('privacy.deleteSignInRequired')}
                  </p>
                )}
              </section>

              <p className="mt-6 text-[10px] text-slate-600 leading-relaxed">
                {t('privacy.dpdpFooter')}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
