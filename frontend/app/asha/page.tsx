'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Phone,
  PlusCircle,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { VerdictCard } from '@/components/VerdictCard';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { postTriage } from '@/lib/api';
import { ensureRisk, escalateCareLevel } from '@/lib/risk';
import {
  appendMessage,
  createSession,
  getSession,
  setVerdict as persistVerdict,
} from '@/lib/sessions';
import {
  ASHA_PRESENTATIONS,
  ASHA_RESOURCES,
  type AshaPresentation,
} from '@/lib/asha-presentations';
import {
  ensureSelfProfile,
  getActiveProfile,
  listProfiles,
  setActiveProfile,
  type PatientProfile,
} from '@/lib/family-graph';
import { toast } from '@/lib/toast';
import type { ChatMessage, Sex, TriageResponse } from '@/lib/types';

type Step = 'patient' | 'presentation' | 'verdict';

export default function AshaCockpitPage() {
  return (
    <Suspense
      fallback={
        <>
          <Navbar />
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        </>
      }
    >
      <AshaCockpitInner />
    </Suspense>
  );
}

function AshaCockpitInner() {
  const router = useRouter();
  const { user, loading } = useUser();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('patient');
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [presentation, setPresentation] = useState<AshaPresentation | null>(null);
  const [extra, setExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdictState] = useState<TriageResponse | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/sign-in?next=/asha');
      return;
    }
    ensureSelfProfile(user.id, { display_name: t('family.you') });
    setProfiles(listProfiles(user.id));
    setProfile(getActiveProfile(user.id));
  }, [user, loading, router, t]);

  const refreshProfiles = useCallback(() => {
    if (!user) return;
    setProfiles(listProfiles(user.id));
    setProfile(getActiveProfile(user.id));
  }, [user]);

  function pickProfile(p: PatientProfile) {
    if (!user) return;
    setActiveProfile(user.id, p.id);
    setProfile(p);
    setStep('presentation');
  }

  async function submit() {
    if (!presentation || !profile || !user) return;
    setSubmitting(true);
    try {
      const symptoms = extra.trim()
        ? `${presentation.prompt}. Additional notes from ASHA: ${extra.trim()}`
        : presentation.prompt;

      const sId = createSession(user.id).id;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: symptoms,
        timestamp: Date.now(),
      };
      appendMessage(sId, userMsg);

      const sex: Sex | undefined =
        profile.sex === 'M' || profile.sex === 'F' ? profile.sex : undefined;
      const history = profile.comorbidities
        ? profile.comorbidities.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined;
      const response = await postTriage({
        symptoms,
        age: profile.age,
        ...(sex ? { sex } : {}),
        ...(history ? { history } : {}),
      });

      const riskHistory = getSession(sId)?.riskHistory ?? [];
      const risk = await ensureRisk(response, symptoms, { history: riskHistory });
      const escalated = escalateCareLevel(response.level, risk);
      const enriched: TriageResponse = {
        ...response,
        risk,
        risk_escalated: response.risk_escalated ?? escalated !== response.level,
        level: escalated,
      };

      const asstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: enriched.reasoning,
        timestamp: Date.now(),
        verdict: enriched,
      };
      appendMessage(sId, asstMsg);
      persistVerdict(sId, enriched);

      setVerdictState(enriched);
      setStep('verdict');
      toast.success(t('asha.toast.verdictReady'));
    } catch (err) {
      toast.error(t('asha.toast.submitFailed'));
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPresentation(null);
    setExtra('');
    setVerdictState(null);
    setStep(profile ? 'presentation' : 'patient');
  }

  if (loading || !user) {
    return (
      <>
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 bg-[#0a0e1a] px-4 py-6">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
                {t('asha.kicker')}
              </p>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Stethoscope className="h-6 w-6 text-emerald-400" aria-hidden />
                {t('asha.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-400 max-w-xl">
                {t('asha.subtitle')}
              </p>
            </div>
            <ResourceBar />
          </header>

          {/* Stepper */}
          <ol className="mb-5 flex items-center gap-2 text-[11px] text-slate-400">
            <StepDot label={t('asha.step.patient')} active={step === 'patient'} done={step !== 'patient'} />
            <Connector />
            <StepDot label={t('asha.step.presentation')} active={step === 'presentation'} done={step === 'verdict'} />
            <Connector />
            <StepDot label={t('asha.step.verdict')} active={step === 'verdict'} done={false} />
          </ol>

          {/* Step 1 — patient picker */}
          {step === 'patient' && (
            <section
              aria-labelledby="asha-patient-h"
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <header className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-400" aria-hidden />
                <h2 id="asha-patient-h" className="text-base font-semibold text-slate-100">
                  {t('asha.patientHeader')}
                </h2>
              </header>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProfile(p)}
                    className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
                  >
                    <p className="text-base font-semibold text-slate-100">
                      {p.display_name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t(`family.relationship.${p.relationship}`)} · {p.age}
                      {p.sex !== 'other' ? ` · ${p.sex}` : ''}
                      {p.comorbidities ? ` · ${p.comorbidities}` : ''}
                    </p>
                  </button>
                ))}
                <Link
                  href="/settings/family?add=1"
                  onClick={() => {
                    // refresh profiles after add via family-change event.
                    setTimeout(refreshProfiles, 600);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300 hover:bg-emerald-500/10"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden />
                  {t('family.addPerson')}
                </Link>
              </div>
            </section>
          )}

          {/* Step 2 — presentation picker */}
          {step === 'presentation' && profile && (
            <section
              aria-labelledby="asha-pres-h"
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 id="asha-pres-h" className="text-base font-semibold text-slate-100">
                    {t('asha.presentationHeader')}
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {profile.display_name} · {t(`family.relationship.${profile.relationship}`)} · {profile.age}
                    {profile.sex !== 'other' ? ` · ${profile.sex}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('patient')}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  {t('asha.changePatient')}
                </button>
              </header>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ASHA_PRESENTATIONS.map((p) => {
                  const active = presentation?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPresentation(p)}
                      aria-pressed={active}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors ${
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                      }`}
                    >
                      <span aria-hidden className="text-3xl leading-none">
                        {p.emoji}
                      </span>
                      <span className="text-[12px] font-medium text-slate-200">
                        {t(`asha.presentation.${p.id}`)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {presentation && (
                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-300 mb-1">
                      {t('asha.reminderHeader')}
                    </p>
                    {t(presentation.reminder_key)}
                  </div>

                  <div>
                    <label
                      htmlFor="asha-extra"
                      className="block text-xs text-slate-300 mb-1"
                    >
                      {t('asha.extraLabel')}
                      <span className="ml-1 text-slate-500">({t('family.optional')})</span>
                    </label>
                    <textarea
                      id="asha-extra"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder={t('asha.extraPlaceholder')}
                      className="w-full resize-none rounded-lg border border-slate-700 bg-[#111728] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    )}
                    {submitting ? t('asha.submitting') : t('asha.submit')}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Step 3 — verdict */}
          {step === 'verdict' && verdict && (
            <section aria-labelledby="asha-verdict-h" className="space-y-4">
              <header className="flex items-center justify-between gap-3 flex-wrap">
                <h2 id="asha-verdict-h" className="text-base font-semibold text-slate-100">
                  {t('asha.verdictHeader')}
                </h2>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  {t('asha.nextPatient')}
                </button>
              </header>
              <VerdictCard verdict={verdict} />
            </section>
          )}

          <p className="mt-6 text-[10px] text-slate-600 leading-relaxed">
            {t('asha.disclaimer')}
          </p>
        </div>
      </main>
    </>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        active
          ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-200'
          : done
            ? 'text-emerald-400/80'
            : 'text-slate-500'
      }`}
    >
      {done ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`}
        />
      )}
      <span className="text-[11px] font-medium">{label}</span>
    </li>
  );
}

function Connector() {
  return <span aria-hidden className="h-px w-6 bg-slate-700" />;
}

function ResourceBar() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('asha.resources.aria')}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <a
        href={`tel:${ASHA_RESOURCES.ambulance}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-red-200 hover:bg-red-500/20"
      >
        <Phone className="h-3 w-3" aria-hidden />
        108
      </a>
      <a
        href={`tel:${ASHA_RESOURCES.womens_helpline}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-pink-500/40 bg-pink-500/10 px-2.5 py-1.5 text-pink-200 hover:bg-pink-500/20"
      >
        <Phone className="h-3 w-3" aria-hidden />
        181
      </a>
      <a
        href={ASHA_RESOURCES.esanjeevani}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-sky-200 hover:bg-sky-500/20"
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        eSanjeevani
      </a>
    </nav>
  );
}
