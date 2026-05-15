import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/* PWA standard icon — 192×192 PNG, served at /icon0 (Next.js naming convention).
 * Referenced by public/manifest.json. */
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#10b981',
          color: 'white',
          fontSize: 130,
          fontWeight: 800,
          borderRadius: 32,
        }}
      >
        ❤
      </div>
    ),
    { ...size },
  );
}
