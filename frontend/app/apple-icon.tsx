import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/* Apple touch icon — 180×180 PNG, served at /apple-icon. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 110,
          fontWeight: 800,
        }}
      >
        ❤
      </div>
    ),
    { ...size },
  );
}
