'use client';

/**
 * Plan 6.5 step 10 (frontend) — Vision triage client.
 *
 * Image-input triage for rashes, wounds, pill bottles, and visible deformity.
 * Backend endpoint `/api/v1/triage/vision` ships in Tier 6.5 step 10
 * (Llama 3.2 11B Vision). Until then this client returns a deterministic
 * "preview-only" response so the UI is demo-able + the user understands
 * the capability is wired but the model is pending.
 *
 * **Privacy / DPDP:** image upload requires `triage_processing` consent
 * (already required to use ASHA-AI). Vision blobs are PHI — never stored
 * client-side after submit; the existing voice-transcribe pipeline pattern
 * is reused (POST multipart, no localStorage cache).
 */

import { getSupabase } from './supabase';
import type { TriageResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB ceiling
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface VisionTriageRequest {
  /** Image blob from `<input type="file">` or `<canvas>.toBlob()`. */
  image: Blob;
  /** Optional accompanying free-text describing the image. */
  context?: string;
  /** Patient age — picked up from active family profile when available. */
  age?: number;
}

export interface VisionTriageResponse extends TriageResponse {
  /** Server-generated description of what the model sees. */
  image_description?: string;
  /** Returned only when the backend isn't wired yet. */
  preview_only?: boolean;
}

export class VisionUploadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'VisionUploadError';
  }
}

/**
 * Validate image blob client-side before upload. Throws VisionUploadError
 * with a translation-friendly `code` so the UI can map to the right i18n key.
 */
export function validateImage(blob: Blob | File): void {
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new VisionUploadError(
      'too_large',
      `Image is ${(blob.size / 1024 / 1024).toFixed(1)} MB; max 8 MB.`,
    );
  }
  if (!ACCEPTED_TYPES.includes(blob.type)) {
    throw new VisionUploadError(
      'wrong_type',
      `Image type ${blob.type || 'unknown'} not supported. Use JPEG, PNG, or WebP.`,
    );
  }
}

/**
 * Submit an image for triage. When the backend isn't wired, returns a
 * preview-only synthetic response that:
 *   - Acknowledges the image was received locally
 *   - Recommends `Clinic Visit` by default (visual presentations usually
 *     warrant in-person assessment) — preserves the safety floor
 *   - Includes the standard disclaimer
 *   - Sets `preview_only: true` so the UI can show a "model coming soon" banner
 */
export async function submitVisionTriage(
  req: VisionTriageRequest,
): Promise<VisionTriageResponse> {
  validateImage(req.image);

  if (!API_BASE) {
    return mockPreview(req);
  }

  const fd = new FormData();
  const ext = blobExt(req.image.type);
  fd.append('image', req.image, `image.${ext}`);
  if (req.context) fd.append('context', req.context);
  if (req.age !== undefined) fd.append('age', String(req.age));

  const headers: Record<string, string> = {};
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch {
      /* noop */
    }
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/triage/vision`, {
      method: 'POST',
      headers,
      body: fd,
    });
    if (res.status === 404 || res.status === 501) {
      // Backend hasn't shipped the endpoint yet.
      return mockPreview(req);
    }
    if (!res.ok) {
      throw new VisionUploadError(
        'http',
        `Vision triage returned ${res.status}`,
      );
    }
    return (await res.json()) as VisionTriageResponse;
  } catch (err) {
    if (err instanceof VisionUploadError) throw err;
    // Network error — fall back to preview-only so demo flows work offline.
    // eslint-disable-next-line no-console
    console.warn('Vision triage failed; preview-only fallback:', err);
    return mockPreview(req);
  }
}

function blobExt(type: string): string {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  return 'jpg';
}

function mockPreview(req: VisionTriageRequest): VisionTriageResponse {
  const sizeKb = Math.round(req.image.size / 1024);
  return {
    level: 'Clinic Visit',
    reasoning:
      `I received your image (${sizeKb} KB). Visual triage is being trained — for now I recommend a clinic visit so a doctor can examine the area in person. ` +
      (req.context
        ? `You also mentioned: "${req.context}". `
        : '') +
      'In the meantime, monitor for spreading, bleeding, severe pain, or fever; if any of those start, seek emergency care.',
    disclaimer:
      'This is not a replacement for professional medical diagnosis. Please consult a qualified medical practitioner for any real medical concern.',
    preview_only: true,
    image_description: 'Image received — model pending.',
    red_flags: [],
  };
}
