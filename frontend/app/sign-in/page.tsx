'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Loader2, Phone, ShieldCheck } from 'lucide-react';
import { sendOtp, verifyOtp, supabaseConfigured } from '@/lib/auth';

type Step = 'phone' | 'otp';

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-slate-500">Loading…</div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await sendOtp(phone);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep('otp');
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await verifyOtp(phone, otp);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const next = params.get('next') ?? '/triage';
    router.push(next);
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-[#111728] p-6 sm:p-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-4">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Sign in</h1>
          <p className="text-sm text-slate-400 mb-6">
            Phone-based one-time password. No email, no social login.
          </p>

          {!supabaseConfigured && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <strong>Demo mode:</strong> any phone works. The OTP is{' '}
              <code className="rounded bg-slate-900/70 px-1.5 py-0.5">123456</code>.
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {step === 'phone' ? (
              <motion.form
                key="phone-step"
                onSubmit={handleSendOtp}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    Phone number
                  </span>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+91XXXXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-11 rounded-lg bg-[#0a0e1a] border border-slate-700 pl-9 pr-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </label>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-lg bg-emerald-500 text-white font-medium disabled:opacity-50 hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? 'Sending OTP…' : 'Send OTP'}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="otp-step"
                onSubmit={handleVerify}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? undefined : { opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <p className="text-sm text-slate-400">
                  We sent a 6-digit code to <strong className="text-slate-200">{phone}</strong>.
                </p>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    One-time password
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="mt-1 w-full h-11 rounded-lg bg-[#0a0e1a] border border-slate-700 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 tracking-[0.4em] text-center text-lg"
                    required
                  />
                </label>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full h-11 rounded-lg bg-emerald-500 text-white font-medium disabled:opacity-50 hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? 'Verifying…' : 'Verify and sign in'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError(null);
                  }}
                  className="w-full text-sm text-slate-400 hover:text-slate-200"
                >
                  Change phone number
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="text-[11px] text-slate-500 mt-6 leading-relaxed">
            Triage support only — not a diagnosis. Phone number used for session continuity. Per
            India DPDP Act 2023.
          </p>
        </div>
      </div>
    </div>
  );
}
