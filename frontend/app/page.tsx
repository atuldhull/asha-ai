import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Activity,
  AlertTriangle,
  MessageSquare,
  Globe2,
  BookOpen,
  Heart,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-medium dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300">
            <Heart className="w-3 h-3" aria-hidden />
            Decision support · Not a diagnosis
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Triage support, where doctors aren&apos;t.
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto">
            AI-assisted preliminary triage in your language. Built for India&apos;s rural last
            mile.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/triage"
              className="inline-flex h-14 items-center justify-center gap-2 px-7 rounded-lg bg-emerald-600 text-white text-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <MessageSquare className="w-4 h-4" aria-hidden />
              Start triage
            </Link>
            <a
              href="#how"
              className="inline-flex h-14 items-center justify-center gap-2 px-7 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-400 transition-colors text-lg font-medium dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"
            >
              Read how it works
            </a>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="px-6 pb-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="India rural ratio" value="1 : 11,082" sub="doctor to patient" />
          <StatCard label="Triage protocol" value="ESI v5" sub="US ED standard, 2024" />
          <StatCard label="License" value="MIT" sub="Open source, free to deploy" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 py-16 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Step
              icon={<Globe2 className="w-6 h-6" />}
              n={1}
              title="Describe your symptoms"
              body="In Hindi, Kannada, or English — type or speak. We listen."
            />
            <Step
              icon={<Activity className="w-6 h-6" />}
              n={2}
              title="Get a triage suggestion"
              body="Home Care · Clinic Visit · Emergency Room — mapped to ESI v5 protocol."
            />
            <Step
              icon={<BookOpen className="w-6 h-6" />}
              n={3}
              title="See the reasoning"
              body="Every recommendation explains which symptoms drove the decision."
            />
          </div>
        </div>
      </section>

      {/* Big disclaimer */}
      <section className="px-6 py-12 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-4 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" aria-hidden />
            <span className="font-semibold">Important</span>
          </div>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            ASHA-AI is decision support, not a medical device. Per India Telemedicine Practice
            Guidelines 2020, AI assists registered medical practitioners — it does not diagnose
            or prescribe. In any real emergency, dial{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">108</span>{' '}
            (India) or your local emergency number.
          </p>
        </div>
      </section>
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5 text-center">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </div>
        <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
          {value}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Step({
  icon,
  n,
  title,
  body,
}: {
  icon: React.ReactNode;
  n: number;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300">
            {icon}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-500 font-mono">STEP {n}</span>
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{body}</p>
      </CardContent>
    </Card>
  );
}
