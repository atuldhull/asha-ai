import { NextResponse } from 'next/server';

/**
 * Edge-runtime proxy for the backend's `/api/v1/voice/transcribe` endpoint.
 *
 * Forwards the multipart audio body to the backend, preserving the
 * Authorization header (Supabase JWT) when the user is signed in.
 *
 * If `NEXT_PUBLIC_API_BASE` isn't set, returns a deterministic mock so the
 * voice button can be visually tested without a backend. The mock pretends
 * the user said "I have a mild headache" so the triage flow proceeds.
 */
export const runtime = 'edge';

const TIMEOUT_MS = 30_000;

export async function POST(req: Request) {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

  if (!apiBase) {
    // Mock — pretend ASR transcribed something benign
    return NextResponse.json(
      {
        transcript_source: 'मुझे हल्का सिरदर्द है।',
        transcript_english: 'I have a mild headache',
        audio_request_path: null,
        audio_response_url: null,
        verdict: {
          level: 'Home Care',
          reasoning:
            "Symptoms appear mild based on the voice transcript. Monitor for changes — if they worsen, re-run triage or consult a doctor.",
          red_flags: [],
          disclaimer:
            'This is not a replacement for professional medical diagnosis. Please consult a qualified medical practitioner for any real medical concern.',
          version: 'mock',
        },
      },
      { status: 200 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    const auth = req.headers.get('authorization');
    if (auth) headers.Authorization = auth;
    // Don't set Content-Type — fetch will set the multipart boundary

    const upstream = await fetch(`${apiBase}/api/v1/voice/transcribe`, {
      method: 'POST',
      headers,
      body: req.body,
      // @ts-expect-error — Edge runtime accepts duplex for streaming bodies
      duplex: 'half',
      signal: controller.signal,
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'voice upstream failure',
        disclaimer:
          'This is not a replacement for professional medical diagnosis. Please consult a qualified medical practitioner for any real medical concern.',
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
