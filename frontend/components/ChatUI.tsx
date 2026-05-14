'use client';

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, User, Bot } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { postTriage } from '@/lib/api';
import { Button } from './ui/Button';
import { VerdictCard } from './VerdictCard';
import { ChipButton } from './ChipButton';
import { cn } from '@/lib/cn';

const SAMPLE_PROMPTS = [
  'I have a runny nose and mild sore throat for 2 days',
  'I have severe chest pain radiating to my left arm and I am sweating',
  'My 3-year-old has high fever 39.5 and is lethargic',
  'Persistent dry cough for 3 weeks, lost 4kg',
];

const QUICK_CHIPS = ['Chest pain', 'High fever', 'Bad headache', 'Stomach ache'];

const INITIAL_MESSAGE: ChatMessage = {
  id: 'init',
  role: 'assistant',
  content:
    "Hi. I'm ASHA-AI. Tell me what's bothering you — symptoms, when they started, anything you've noticed. I'll help you decide where to go next.",
  timestamp: Date.now(),
};

/**
 * Self-contained chat interface: message list + input + verdict rendering.
 * Used as the entire body of /triage.
 */
export function ChatUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
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

    try {
      const verdict = await postTriage({ symptoms: trimmed });
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: verdict.reasoning,
        timestamp: Date.now(),
        verdict,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'I had trouble reaching the triage service. Please try again in a moment.',
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, errorMsg]);
      // eslint-disable-next-line no-console
      console.error('Triage error:', err);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleChipClick(chip: string) {
    setInput((prev) => (prev ? `${prev} ${chip}` : chip));
    inputRef.current?.focus();
  }

  function handleSampleClick(sample: string) {
    setInput(sample);
    inputRef.current?.focus();
  }

  const hasUserMessage = messages.some((m) => m.role === 'user');

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="mx-auto max-w-3xl space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className="max-w-[88%] sm:max-w-[80%] flex flex-col gap-2">
                  {msg.role === 'user' ? (
                    <div className="rounded-2xl rounded-tr-md bg-emerald-500 px-4 py-2.5 text-sm text-white leading-relaxed">
                      {msg.content}
                    </div>
                  ) : msg.verdict ? (
                    <VerdictCard verdict={msg.verdict} />
                  ) : (
                    <div className="rounded-2xl rounded-tl-md bg-[#111728] border border-slate-800 px-4 py-2.5 text-sm text-slate-200 leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-[#111728] border border-slate-800 px-4 py-3 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing symptoms…
              </div>
            </motion.div>
          )}

          {!hasUserMessage && !loading && (
            <div className="pt-2">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-3 text-center">
                Try one of these
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SAMPLE_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleSampleClick(p)}
                    className="text-left p-3 rounded-lg border border-slate-800 bg-[#111728] text-sm text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 bg-[#0a0e1a] sticky bottom-0">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <label htmlFor="symptom-input" className="sr-only">
              Describe your symptoms
            </label>
            <textarea
              id="symptom-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your symptoms…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-800 bg-[#111728] px-4 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              disabled={loading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send"
              size="md"
              className="h-12 w-12 p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

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
        </form>
      </div>
    </div>
  );
}
