'use client';

/**
 * 3-tier differential UI (Glass-Health style).
 * Shown on the doctor cockpit detail pane.
 *
 * Backend response shape (Plan 3.0 — Member B's enriched verdict):
 *   differential: {
 *     most_likely: [{ name, confidence, why }],
 *     expanded:    [{ name, confidence, why }],
 *     cant_miss:   [{ name, confidence, why }],
 *   }
 *
 * Until the backend ships this, the parent passes `null` and we render
 * a compact placeholder explaining the tier.
 */
import { useState } from 'react';
import { ChevronDown, Sparkles, Search, ShieldAlert } from 'lucide-react';

export interface DifferentialItem {
  name: string;
  confidence?: number; // 0..1
  why?: string;
}

export interface Differential {
  most_likely?: DifferentialItem[];
  expanded?: DifferentialItem[];
  cant_miss?: DifferentialItem[];
}

interface DifferentialPanelProps {
  differential: Differential | null;
}

const COLUMNS: Array<{
  key: keyof Differential;
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  color: string;
  border: string;
}> = [
  {
    key: 'most_likely',
    title: 'Most Likely',
    subtitle: 'Common presentations',
    icon: Sparkles,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  {
    key: 'expanded',
    title: 'Expanded',
    subtitle: 'Worth ruling out',
    icon: Search,
    color: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  {
    key: 'cant_miss',
    title: "Can't Miss",
    subtitle: 'Rare but catastrophic',
    icon: ShieldAlert,
    color: 'text-red-400',
    border: 'border-red-500/30',
  },
];

export function DifferentialPanel({ differential }: DifferentialPanelProps) {
  const empty =
    !differential ||
    (!differential.most_likely?.length &&
      !differential.expanded?.length &&
      !differential.cant_miss?.length);

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-[#0a0e1a]/40 p-4 text-xs text-slate-500">
        Differential not provided. Backend Plan 3.0 will populate this from the verdict
        explanation API.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="region" aria-label="Differential diagnosis">
      {COLUMNS.map((col) => (
        <DifferentialColumn
          key={col.key}
          title={col.title}
          subtitle={col.subtitle}
          Icon={col.icon}
          colorClass={col.color}
          borderClass={col.border}
          items={differential?.[col.key] ?? []}
        />
      ))}
    </div>
  );
}

function DifferentialColumn({
  title,
  subtitle,
  Icon,
  colorClass,
  borderClass,
  items,
}: {
  title: string;
  subtitle: string;
  Icon: typeof Sparkles;
  colorClass: string;
  borderClass: string;
  items: DifferentialItem[];
}) {
  return (
    <div className={`rounded-xl border ${borderClass} bg-[#0a0e1a] p-3`}>
      <header className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${colorClass}`} aria-hidden />
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${colorClass}`}>
          {title}
        </h3>
      </header>
      <p className="text-[11px] text-slate-500 mb-3">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-600 italic">none</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <DifferentialRow key={`${title}-${i}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DifferentialRow({ item }: { item: DifferentialItem }) {
  const [open, setOpen] = useState(false);
  const conf = item.confidence != null ? Math.round(item.confidence * 100) : null;

  return (
    <li className="rounded-md border border-slate-800 bg-[#111728]/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!item.why}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800/50 disabled:cursor-default rounded-md"
        aria-expanded={open}
      >
        <span className="truncate">{item.name}</span>
        <span className="flex items-center gap-1.5 text-slate-500">
          {conf != null && <span className="tabular-nums">{conf}%</span>}
          {item.why && (
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          )}
        </span>
      </button>
      {open && item.why && (
        <p className="px-2.5 pb-2 text-[11px] text-slate-400 leading-relaxed">{item.why}</p>
      )}
    </li>
  );
}
