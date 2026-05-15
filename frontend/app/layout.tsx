import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Devanagari, Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import { ConsentGate } from '@/components/ConsentGate';
import { Toaster } from '@/components/Toaster';
import { RouteTransition } from '@/components/providers/RouteTransition';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-devanagari',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

// AyurAI-inspired display + body pairing — used on the marketing landing.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  display: 'swap',
  weight: ['300', '400', '500'],
});

export const metadata: Metadata = {
  title: 'ASHA-AI · Triage decision support for rural India',
  description:
    'AI-assisted preliminary triage in your language. Decision support — not a substitute for professional medical advice.',
  manifest: '/manifest.json',
  applicationName: 'ASHA-AI',
};

export const viewport: Viewport = {
  themeColor: '#fbf3ec',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoDevanagari.variable} ${cormorant.variable} ${dmSans.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-[#fbf3ec] text-[#2e2218] antialiased">
        <Providers>
          <main className="flex-1 flex flex-col">
            <RouteTransition>{children}</RouteTransition>
          </main>
          <DisclaimerFooter />
          {/* Plan 6.6 Phase B (frontend) — DPDP consent gate. Auto-renders
              the ConsentSheet when localStorage + server agree the user
              hasn't acknowledged the current policy version. Self-mounts
              once per browser session if declined. */}
          <ConsentGate />
          {/* Global toast stack — listens for `asha-ai:toast` CustomEvents
              fired by `lib/toast.ts` from anywhere in client code. */}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
