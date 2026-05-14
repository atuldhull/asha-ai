'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Loader2 } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/cn';

interface ChatWindowProps {
  messages: ChatMessage[];
  loading?: boolean;
}

/**
 * Renders the chat transcript only — input is owned by the parent page.
 * Verdict-bearing messages are rendered as plain bubbles here; the
 * dedicated VerdictCard component is rendered separately by the page
 * (see app/triage/page.tsx) for prominence and accessibility.
 */
export function ChatWindow({ messages, loading = false }: ChatWindowProps) {
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  return (
    <div
      className="space-y-4"
      role="log"
      aria-live="polite"
      aria-atomic="false"
    >
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
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                aria-hidden
              >
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={cn(
                'max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'rounded-tr-md bg-emerald-500 text-white'
                  : 'rounded-tl-md bg-[#111728] border border-slate-800 text-slate-200'
              )}
            >
              {msg.content}
            </div>

            {msg.role === 'user' && (
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-400"
                aria-hidden
              >
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

      <div ref={scrollAnchorRef} aria-hidden />
    </div>
  );
}
