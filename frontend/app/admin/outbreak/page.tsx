'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Globe2,
  Loader2,
  Map as MapIcon,
  ShieldCheck,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { useUser } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/I18nProvider';
import {
  DEMO_CLUSTERS,
  KIND_COLOR,
  type OutbreakCluster,
} from '@/lib/outbreak-mock';

// Lazy-load the R3F globe — it pulls Three.js + drei (~225 KB) and we don't
// want it in the main route bundle.
const OutbreakGlobe = dynamic(
  () => import('@/components/3d/OutbreakGlobe').then((m) => ({ default: m.OutbreakGlobe })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[460px] w-full max-w-[460px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/40 text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        Loading globe…
      </div>
    ),
  },
);

// Leaflet hits `window` at import-time — must be SSR-disabled.
const OutbreakMap2D = dynamic(
  () => import('@/components/maps/OutbreakMap2D').then((m) => ({ default: m.OutbreakMap2D })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[460px] w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/40 text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        Loading map…
      </div>
    ),
  },
);

type ViewMode = 'globe' | 'map';

/**
 * Plan 6.3 — admin outbreak surveillance page.
 *
 * 3D globe + cluster table side-by-side. Doctor-only (RBAC enforced
 * client-side via useUser; server-side enforcement is Tier 6.6 Phase A
 * Better Auth migration).
 *
 * Data source: when `NEXT_PUBLIC_API_BASE` is set + the
 * `/api/v1/outbreak/clusters/3d` endpoint is wired (Tier 6.5 backend),
 * fetches live clusters. Otherwise falls back to `DEMO_CLUSTERS` so the
 * page is demo-able today.
 */
export default function OutbreakPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const { t } = useTranslation();
  const [clusters, setClusters] = useState<OutbreakCluster[]>(DEMO_CLUSTERS);
  const [selected, setSelected] = useState<OutbreakCluster | null>(null);
  const [usingDemo, setUsingDemo] = useState(true);
  const [view, setView] = useState<ViewMode>('globe');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/sign-in?next=/admin/outbreak');
      return;
    }
    // Plan 6.3 — RBAC: doctor only. Tier 6.6 Phase A will tighten this
    // server-side once Better Auth + role claims land.
    if (user.role !== 'doctor') {
      router.replace('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    if (!apiBase) return;
    let cancelled = false;
    fetch(`${apiBase}/api/v1/outbreak/clusters/3d`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OutbreakCluster[] | null) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setClusters(data);
          setUsingDemo(false);
        }
      })
      .catch(() => {
        // Network error — keep demo seed
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !user || user.role !== 'doctor') {
    return (
      <>
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </main>
      </>
    );
  }

  const totalCases = clusters.reduce((sum, c) => sum + c.case_count, 0);

  return (
    <>
      <Navbar />
      <main className="flex-1 bg-[#0a0e1a] px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/doctor/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('outbreak.backToCockpit')}
          </Link>

          <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-400">
                {t('outbreak.kicker')}
              </p>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Globe2 className="h-6 w-6 text-emerald-400" aria-hidden />
                {t('outbreak.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-400 max-w-xl">
                {t('outbreak.subtitle')}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {t('outbreak.doctorOnly')}
              </div>
              {usingDemo && (
                <span className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-200">
                  {t('outbreak.demoSeed')}
                </span>
              )}
            </div>
          </header>

          {/* 3D globe / 2D map view toggle */}
          <div
            className="mb-3 inline-flex rounded-lg border border-slate-700 bg-slate-900/40 p-0.5 text-xs"
            role="tablist"
            aria-label={t('outbreak.viewToggleAria')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'globe'}
              onClick={() => setView('globe')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                view === 'globe'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden />
              {t('outbreak.viewGlobe')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'map'}
              onClick={() => setView('map')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                view === 'map'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden />
              {t('outbreak.viewMap')}
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <section
              aria-label={
                view === 'globe' ? t('outbreak.globeAria') : t('outbreak.mapAria')
              }
              className="flex justify-center md:justify-start"
            >
              {view === 'globe' ? (
                <OutbreakGlobe
                  clusters={clusters}
                  onSelect={setSelected}
                  size={460}
                />
              ) : (
                <OutbreakMap2D
                  clusters={clusters}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                  height={460}
                  className="w-full"
                />
              )}
            </section>

            <section aria-label={t('outbreak.listAria')}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-100">
                    {t('outbreak.activeClusters')} ({clusters.length})
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    {totalCases} {t('outbreak.totalCases')}
                  </span>
                </div>
                <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                  {clusters.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        aria-pressed={selected?.id === c.id}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          selected?.id === c.id
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: KIND_COLOR[c.kind] }}
                            />
                            <span className="text-sm font-medium text-slate-100 truncate">
                              {c.district}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {c.state} · {c.kind} · conf {Math.round(c.confidence * 100)}%
                          </p>
                        </div>
                        <span className="text-sm font-bold text-slate-200 tabular-nums">
                          {c.case_count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {selected && (
                <div
                  className="mt-3 rounded-2xl border-2 p-4"
                  style={{
                    borderColor: KIND_COLOR[selected.kind],
                    backgroundColor: `${KIND_COLOR[selected.kind]}14`,
                  }}
                >
                  <h3 className="text-sm font-semibold text-slate-100">
                    {selected.district}, {selected.state}
                  </h3>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <dt className="text-slate-500">{t('outbreak.field.kind')}</dt>
                      <dd className="text-slate-100 font-medium">{selected.kind}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('outbreak.field.cases')}</dt>
                      <dd className="text-slate-100 font-medium">{selected.case_count}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('outbreak.field.confidence')}</dt>
                      <dd className="text-slate-100 font-medium">
                        {Math.round(selected.confidence * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t('outbreak.field.firstSeen')}</dt>
                      <dd
                        className="text-slate-100 font-medium"
                        suppressHydrationWarning
                      >
                        {new Date(selected.first_seen_at).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                      {t('outbreak.dominantSymptoms')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selected.dominant_symptoms.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-slate-900/60 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200"
                        >
                          {s.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          <p className="mt-6 text-[10px] text-slate-600 leading-relaxed">
            {t('outbreak.privacyFooter')}
          </p>
        </div>
      </main>
    </>
  );
}
