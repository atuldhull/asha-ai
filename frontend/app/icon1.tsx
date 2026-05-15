import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/* PWA standard + maskable icon — 512×512 PNG, served at /icon1.
 * Referenced by public/manifest.json. The mark sits inside the maskable
 * safe zone (centred 80%) so OS chrome can crop without clipping. */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon512() {
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
          fontSize: 320,
          fontWeight: 800,
        }}
      >
        ❤
      </div>
    ),
    { ...size },
  );
}
