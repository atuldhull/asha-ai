'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ChatWindow } from '@/components/ChatWindow';
import { ChipButton } from '@/components/ChipButton';
import { VerdictCard } from '@/components/VerdictCard';
import { VoiceButton } from '@/components/VoiceButton';
import { MentalHealthScreen } from '@/components/MentalHealthScreen';
import { postTriage } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import {
  appendMessage,
  createSession,
  setVerdict as persistVerdict,
} from '@/lib/sessions';
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
  const { user } = useUser();
  const { t } = useTranslation();

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
      const response = await postTriage({ symptoms: trimmed });
      const asstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.reasoning,
        timestamp: Date.now(),
        verdict: response,
      };
      setMessages((m) => [...m, asstMsg]);
      setVerdict(response);
      if (response.mental_health_flag) setShowMentalHealth(true);
      if (sId) {
        appendMessage(sId, asstMsg);
        persistVerdict(sId, response);
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

  return (
    <>
      <Navbar />
      {showMentalHealth && <MentalHealthScreen onClose={() => setShowMentalHealth(false)} />}
      <div className="flex-1 flex flex-col bg-[#0a0e1a]">
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
                <VerdictCard verdict={verdict} />
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
