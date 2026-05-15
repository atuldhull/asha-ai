import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/* Open Graph image — 1200×630 social-share card.
 * Auto-served by Next.js at /opengraph-image when imported by the root layout. */
export const alt = 'ASHA-AI · AI triage decision support for rural India';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'linear-gradient(135deg, #0a0e1a 0%, #111728 50%, #0d1f25 100%)',
          color: '#e8ecf5',
          padding: '64px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top row — wordmark + tag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 'auto',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
              color: 'white',
            }}
          >
            ❤
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
              ASHA-AI
            </div>
            <div style={{ fontSize: 18, color: '#94a3b8', marginTop: 2 }}>
              triage decision support · open source
            </div>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            marginTop: 'auto',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 72,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: -2,
              maxWidth: 980,
            }}
          >
            Triage support, where doctors aren&apos;t.
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#cbd5e1',
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            Voice-first, multilingual AI triage for India&apos;s rural last
            mile. Hindi · Kannada · English.
          </div>
        </div>

        {/* Bottom row — verdict swatches + disclaimer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            marginTop: 28,
            paddingTop: 28,
            borderTop: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Pill bg="#10b981" label="Home Care" />
            <Pill bg="#f59e0b" label="Clinic Visit" />
            <Pill bg="#ef4444" label="Emergency Room" />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 16,
              color: '#64748b',
              textAlign: 'right',
              lineHeight: 1.4,
            }}
          >
            <div>BMSIT AI Fusion Challenge · PS-2</div>
            <div>Not a replacement for professional medical diagnosis.</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Pill({ bg, label }: { bg: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: `${bg}26`,
        border: `2px solid ${bg}`,
        color: '#f1f5f9',
        padding: '10px 18px',
        borderRadius: 999,
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: bg,
        }}
      />
      {label}
    </div>
  );
}
