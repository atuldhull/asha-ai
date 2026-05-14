# PWA Icons

Placeholder. For Plan 1.0 the manifest references `icon-192.png` and `icon-512.png` — these files should be generated and placed here before the PWA install prompt works.

**Quick generate options (₹0):**
- https://maskable.app/editor — drop in a 512×512 PNG, export both sizes
- https://realfavicongenerator.net — bulk generate everything
- Or use the Vercel OG image template: https://og-playground.vercel.app

**Required files:**
- `icon-192.png` — 192×192, PNG, with safe maskable area
- `icon-512.png` — 512×512, PNG, with safe maskable area
- (optional) `apple-touch-icon.png` — 180×180

**Suggested motif:** an emerald-green stylized stethoscope or heart silhouette on white. Keep simple — it appears as a tiny app icon on phones.

For Plan 2.0 we'll add an Apple touch icon + favicon.ico via `next/font` + `app/icon.tsx`.
