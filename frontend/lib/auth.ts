/**
 * Auth abstraction.
 *
 * Two modes:
 *   1. Supabase phone-OTP (when NEXT_PUBLIC_SUPABASE_URL is set)
 *   2. localStorage demo mode (when not configured) — accepts any phone +
 *      any 6-digit OTP. Lets the entire app be demoed without backend creds.
 *
 * Same API in both modes. Components shouldn't know which is active.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSupabase, supabaseConfigured } from './supabase';

export interface User {
  id: string;
  phone: string;
  role: 'patient' | 'doctor' | 'asha';
  createdAt: number;
}

const STORAGE_KEY = 'asha-ai:user';
const DOCTOR_PHONE_ALLOWLIST = ['+919999999999', '+15555550100']; // demo doctors
// ASHA worker phone allow-list. Real-world this lives in Supabase
// `profiles.role`; for the demo we hardcode a few. The +91 numbers below
// won't collide with real Indian numbers — they're outside the active
// numbering plan.
const ASHA_PHONE_ALLOWLIST = ['+918888888888', '+917777777777'];

function roleForPhone(phone: string): User['role'] {
  if (DOCTOR_PHONE_ALLOWLIST.includes(phone)) return 'doctor';
  if (ASHA_PHONE_ALLOWLIST.includes(phone)) return 'asha';
  return 'patient';
}

/* ─────────────────── localStorage demo mode ─────────────────── */

function readLocalUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeLocalUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('asha-ai:auth-change'));
}

/* ─────────────────── public API ─────────────────── */

/**
 * Send an OTP to the given phone. In demo mode, the OTP is always `123456`.
 * In Supabase mode, a real SMS is sent.
 */
export async function sendOtp(phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: 'Invalid phone number. Use international format e.g. +91XXXXXXXXXX' };

  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.auth.signInWithOtp({ phone: normalized });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // Demo mode — pretend OTP was sent
  return { ok: true };
}

/**
 * Verify an OTP and complete sign-in. Returns the User on success.
 * In demo mode, accepts `123456` only (so the UI shows error states correctly).
 */
export async function verifyOtp(
  phone: string,
  token: string,
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, error: 'Invalid phone number.' };
  if (!/^\d{6}$/.test(token)) return { ok: false, error: 'OTP must be 6 digits.' };

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.verifyOtp({
      phone: normalized,
      token,
      type: 'sms',
    });
    if (error || !data?.user) return { ok: false, error: error?.message ?? 'Verification failed' };
    const user: User = {
      id: data.user.id,
      phone: normalized,
      role: roleForPhone(normalized),
      createdAt: Date.now(),
    };
    writeLocalUser(user);
    return { ok: true, user };
  }

  // Demo mode — accept 123456 only
  if (token !== '123456') return { ok: false, error: 'Wrong OTP. (Demo mode: use 123456)' };
  const user: User = {
    id: `demo-${normalized}`,
    phone: normalized,
    role: roleForPhone(normalized),
    createdAt: Date.now(),
  };
  writeLocalUser(user);
  return { ok: true, user };
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  writeLocalUser(null);
}

/**
 * React hook — returns the current user (null when signed out).
 * Re-renders on auth changes.
 */
export function useUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.auth.getUser();
      if (data.user) {
        const stored = readLocalUser();
        if (stored && stored.id === data.user.id) {
          setUser(stored);
        } else {
          const fresh: User = {
            id: data.user.id,
            phone: data.user.phone ?? '',
            role: roleForPhone(data.user.phone ?? ''),
            createdAt: Date.now(),
          };
          writeLocalUser(fresh);
          setUser(fresh);
        }
      } else {
        setUser(null);
      }
    } else {
      setUser(readLocalUser());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener('asha-ai:auth-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('asha-ai:auth-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  return { user, loading };
}

/* ─────────────────── helpers ─────────────────── */

function normalizePhone(input: string): string | null {
  const trimmed = input.replace(/[\s-()]/g, '');
  // Require E.164: + followed by 7-15 digits
  if (!/^\+\d{7,15}$/.test(trimmed)) return null;
  return trimmed;
}

export { supabaseConfigured };
