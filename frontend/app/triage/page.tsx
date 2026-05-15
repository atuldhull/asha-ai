'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, PersonStanding } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ChatWindow } from '@/components/ChatWindow';
import { ChipButton } from '@/components/ChipButton';
import { VerdictCard } from '@/components/VerdictCard';
import { VoiceButton } from '@/components/VoiceButton';
import { MentalHealthScreen } from '@/components/MentalHealthScreen';
import { ImageUploadButton } from '@/components/ImageUploadButton';
import { postTriage } from '@/lib/api';
import type { VisionTriageResponse } from '@/lib/vision';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import { getActiveProfile, type PatientProfile } from '@/lib/family-graph';
import {
  appendMessage,
  createSession,
  getSession,
  setVerdict as persistVerdict,
} from '@/lib/sessions';
import { ensureRisk, escalateCareLevel } from '@/lib/risk';
import type { ChatMessage, TriageResponse } from '@/lib/types';

const QUICK_CHIPS = [
  'Chest pain',
  'High fever',
  'Bad headache',
  'Stomach ache',
];

const SUICIDAL_KEYWORDS = [
  'kill myself',
  'end my life',
  "don't want to live",
  'want to die',
  'suicide',
  'harm myself',
];

function localSuicidalCheck(text: string): boolean {
  const t = text.toLowerCase();
  return SUICIDAL_KEYWORDS.some((k) => t.includes(k));
}

export default function TriagePage() {
  // useSearchParams() requires a Suspense boundary in production builds.
  // Plan 6.1's body-map-3d page redirects here with ?fallback=... when WebGL2
  // is missing or reduced-motion is on; that callsite needs the wrapper too.
  return (
    <Suspense fallback={
      <>
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
      </>
    }>
      <TriagePageInner />
    </Suspense>
  );
}

function TriagePageInner() {
  const { user } = useUser();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const fallbackReason = searchParams.get('fallback');

  // Plan 7.x — Family Health Graph integration. When the user has switched
  // to a non-self profile (e.g. "Mom, 67, diabetic"), pass age + comorbidity
  // history into the triage payload so the backend severity / risk pipeline
  // applies the right age multiplier + comorbidity weights.
  const [activeProfile, setActiveProfileState] = useState<PatientProfile | null>(null);
  useEffect(() => {
    if (!user) {
      setActiveProfileState(null);
      return;
    }
    setActiveProfileState(getActiveProfile(user.id));
    function refresh() {
      if (!user) return;
      setActiveProfileState(getActiveProfile(user.id));
    }
    window.addEventListener('asha-ai:family-change', refresh);
    return () => window.removeEventListener('asha-ai:family-change', refresh);
  }, [user]);

  const initialMessage: ChatMessage = {
    id: 'init',
    role: 'assistant',
    content: t('triage.greeting'),
    timestamp: Date.now(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState<TriageResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showMentalHealth, setShowMentalHealth] = useState(false);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (verdict && verdictRef.current) {
      verdictRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [verdict]);

  // Lazily create a session for the signed-in user on first message.
  function ensureSession(): string | null {
    if (sessionId) return sessionId;
    if (!user) return null;
    const s = createSession(user.id);
    appendMessage(s.id, messages[0]);
    setSessionId(s.id);
    return s.id;
  }

  async function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    // Client-side safety pre-check — if obvious suicidal ideation, surface the
    // helpline IMMEDIATELY before waiting for the API. The server still does
    // its own check; this is a safety belt-and-suspenders.
    if (localSuicidalCheck(trimmed)) {
      setShowMentalHealth(true);
    }

    const sId = ensureSession();
    if (sId) appendMessage(sId, userMsg);

    try {
      const profileHistory = activeProfile?.comorbidities
        ? activeProfile.comorbidities
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : undefined;
      const response = await postTriage({
        symptoms: trimmed,
        ...(activeProfile?.age !== undefined ? { age: activeProfile.age } : {}),
        ...(activeProfile?.sex && activeProfile.sex !== 'other'
          ? { sex: activeProfile.sex }
          : {}),
        ...(profileHistory ? { history: profileHistory } : {}),
      });

      // Plan 5.1 — enrich the verdict with a risk score (and apply the
      // escalate-only safety rule) before showing or persisting it. If the
      // backend already returned a `risk` block we reuse it; otherwise the
      // deterministic mock fills it in so the sparkline always has data.
      const history = sId ? getSession(sId)?.riskHistory ?? [] : [];
      const risk = await ensureRisk(response, trimmed, { history });
      const escalatedLevel = escalateCareLevel(response.level, risk);
      // Trust the backend's escalation flag if it set one; otherwise infer
      // from whether the client mock had to escalate (mock-mode demos).
      const risk_escalated =
        response.risk_escalated ?? escalatedLevel !== response.level;
      const enriched: TriageResponse = {
        ...response,
        risk,
        risk_escalated,
        level: escalatedLevel,
      };

      const asstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: enriched.reasoning,
        timestamp: Date.now(),
        verdict: enriched,
      };
      setMessages((m) => [...m, asstMsg]);
      setVerdict(enriched);
      if (enriched.mental_health_flag) setShowMentalHealth(true);
      if (sId) {
        appendMessage(sId, asstMsg);
        persistVerdict(sId, enriched);
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'I had trouble reaching the triage service. Please try again in a moment.',
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, errMsg]);
      if (sId) appendMessage(sId, errMsg);
      // eslint-disable-next-line no-console
      console.error('Triage API error:', err);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleChipClick(chip: string) {
    setInput((prev) => (prev ? `${prev} ${chip.toLowerCase()}` : chip));
    inputRef.current?.focus();
  }

  function handleVoiceTranscript(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Auto-send the transcript so the voice flow feels conversational.
    void handleSubmit(trimmed);
  }

  function handleVisionVerdict(visionVerdict: VisionTriageResponse) {
    // Plan 6.5 step 10 — image triage flows back into the same chat thread
    // so the verdict stack stays unified across all input modes.
    const sId = ensureSession();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: visionVerdict.image_description ?? '[Image submitted for triage]',
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    if (sId) appendMessage(sId, userMsg);

    const asstMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: visionVerdict.reasoning,
      timestamp: Date.now(),
      verdict: visionVerdict,
    };
    setMessages((m) => [...m, asstMsg]);
    setVerdict(visionVerdict);
    if (sId) {
      appendMessage(sId, asstMsg);
      persistVerdict(sId, visionVerdict);
    }
  }

  return (
    <>
      <Navbar />
      {showMentalHealth && <MentalHealthScreen onClose={() => setShowMentalHealth(false)} />}
      <div className="flex-1 flex flex-col bg-[#0a0e1a]">
        {/* 3D body-map fallback banner (Plan 6.1) — shown when /triage/body-map-3d
            redirected the user here due to no WebGL2 or reduced-motion preference. */}
        {fallbackReason && (
          <div className="px-4 py-2 bg-sky-500/5 border-b border-sky-500/20 text-xs text-sky-200 text-center">
            {fallbackReason === 'no-webgl2'
              ? t('bodymap.fallbackNoWebgl')
              : t('bodymap.fallbackReducedMotion')}
          </div>
        )}
        {/* Plan 7.x — Active family profile chip. Shows when triaging on
            behalf of someone other than self so the user always knows whose
            symptoms are being submitted. */}
        {activeProfile && activeProfile.relationship !== 'self' && (
          <div className="px-4 py-1.5 bg-violet-500/5 border-b border-violet-500/20 text-[11px] text-violet-200 text-center">
            {t('triage.activeProfile').replace('{name}', activeProfile.display_name).replace('{age}', String(activeProfile.age))}
          </div>
        )}
        {/* Anonymous-user notice */}
        {!user && (
          <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 text-xs text-amber-300 text-center">
            {t('triage.signInBanner')}{' '}
            <a href="/sign-in?next=/triage" className="underline hover:text-amber-200">
              {t('triage.signInLink')}
            </a>{' '}
            {t('triage.signInBannerSuffix')}
          </div>
        )}

        {/* Chat scroll area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto">
            <ChatWindow messages={messages} loading={loading} />
            {verdict && (
              <div ref={verdictRef} className="mt-6">
                <VerdictCard verdict={verdict} autoSpeak />
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-slate-800 bg-[#0a0e1a] px-4 py-3 sticky bottom-0">
          <div className="max-w-2xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(input);
              }}
              className="flex gap-2 items-end"
            >
              <label htmlFor="symptom-input" className="sr-only">
                Describe your symptoms
              </label>
              <textarea
                ref={inputRef}
                id="symptom-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(input);
                  }
                }}
                placeholder={t('triage.placeholder')}
                rows={2}
                className="flex-1 resize-none rounded-lg bg-[#111728] border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
                disabled={loading}
                aria-label={t('triage.placeholder')}
              />
              <VoiceButton onTranscript={handleVoiceTranscript} disabled={loading} />
              <ImageUploadButton onVerdict={handleVisionVerdict} disabled={loading} />
              <Link
                href="/triage/body-map-3d"
                aria-label={t('bodymap.openButton')}
                title={t('bodymap.openButtonTitle')}
                className="relative h-10 w-10 rounded-lg border border-slate-800 bg-[#111728] text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors flex items-center justify-center"
              >
                <PersonStanding className="h-5 w-5" aria-hidden />
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 rounded-sm bg-emerald-500 px-1 text-[8px] font-bold leading-tight text-slate-950"
                >
                  3D
                </span>
              </Link>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-10 px-4 rounded-lg bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors flex items-center gap-2"
                aria-label={t('triage.send')}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="w-4 h-4" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {loading ? t('triage.sending') : t('triage.send')}
                </span>
              </button>
            </form>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_CHIPS.map((chip) => (
                <ChipButton
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  disabled={loading}
                >
                  {chip}
                </ChipButton>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
