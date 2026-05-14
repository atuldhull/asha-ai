import { NextResponse } from 'next/server';
import type { TriageResponse, CareLevel } from '@/lib/types';
import { DISCLAIMER } from '@/lib/types';

export const runtime = 'edge';
const TIMEOUT_MS = 12_000;

/**
 * POST /api/triage
 * Server-side proxy that forwards { symptoms } to Role B's backend.
 * If NEXT_PUBLIC_API_BASE is empty, returns a deterministic mock so
 * Role A's frontend can develop without the backend.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', disclaimer: DISCLAIMER },
      { status: 400 }
    );
  }

  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

  if (!apiBase) {
    // Mock fallback — keyword-based local triage so the UI works standalone.
    const mock = mockTriage((body as { symptoms?: string })?.symptoms ?? '');
    return NextResponse.json(mock, { status: 200 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(`${apiBase}/api/v1/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'upstream failure',
        disclaimer: DISCLAIMER,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

function mockTriage(symptoms: string): TriageResponse {
  const text = symptoms.toLowerCase();

  // Emergency keywords
  const erKeywords = [
    'chest pain', 'severe chest', 'heart attack',
    'stroke', 'face droop', 'arm weak', 'slurred speech',
    'cannot breathe', "can't breathe", 'shortness of breath severe',
    'unconscious', 'fainting', 'seizure',
    'bleeding heavy', 'vomiting blood', 'blood in stool',
    'suicide', 'kill myself', 'end my life',
    'anaphylaxis', 'throat closing', 'severe allergic',
  ];
  if (erKeywords.some((kw) => text.includes(kw))) {
    return {
      level: 'Emergency Room',
      reasoning: 'Symptoms include possible emergency indicators. Please seek immediate medical attention. Call 108 (India ambulance) or your local emergency number now.',
      red_flags: ['mock: emergency keyword detected'],
      disclaimer: DISCLAIMER,
    };
  }

  // Clinic keywords
  const clinicKeywords = [
    'fever', 'persistent', 'days', 'week', 'cough', 'rash',
    'pain', 'infection', 'urinary', 'diabetes', 'hypertension',
    'pregnant', 'pregnancy',
  ];
  if (clinicKeywords.some((kw) => text.includes(kw))) {
    return {
      level: 'Clinic Visit' as CareLevel,
      reasoning: 'Your symptoms warrant a doctor consultation in the next 24–48 hours. This is decision support — please consult a registered medical practitioner.',
      red_flags: [],
      disclaimer: DISCLAIMER,
    };
  }

  // Default to Home Care
  return {
    level: 'Home Care',
    reasoning: 'Symptoms appear mild based on what you described. Monitor for changes — if they worsen, re-run triage or consult a doctor.',
    red_flags: [],
    disclaimer: DISCLAIMER,
  };
}
