import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { navigate, type Route } from '@/lib/route';
import { useFlowsheet } from '@/store/flowsheetStore';

const NAV: { route?: Route; label: string; group: string }[] = [
  { route: 'flowsheet', label: 'Flowsheet', group: 'Plant' },
  { route: 'mccabe-thiele', label: 'McCabe–Thiele', group: 'Distillation' },
  { route: 'batch', label: 'Batch distillation', group: 'Distillation' },
  { route: 'distillation-lines', label: 'Distillation lines', group: 'Distillation' },
  { label: 'Extraction', group: 'Extraction' },
  { label: 'Absorption', group: 'Absorption' },
  { label: 'Crystallization', group: 'Crystallization' },
];

export function AppHeader({ route }: { route: Route }) {
  return (
    <header className="glass flex h-11 shrink-0 items-center gap-5 px-4">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-signal-liquid stroke-[1.5]" aria-hidden>
          <rect x="8" y="2" width="8" height="20" rx="4" />
          <path d="M8 8h5M16 12h-5M8 16h5" />
        </svg>
        <span className="text-sm font-semibold tracking-tight text-plant-100">Thermal Separation</span>
      </div>

      <nav aria-label="Modules" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {NAV.map((n) =>
          n.route ? (
            <button
              key={n.label}
              type="button"
              onClick={() => navigate(n.route!)}
              aria-current={route === n.route ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded px-2.5 py-1 text-[11px] transition-colors',
                route === n.route
                  ? 'bg-signal-liquid/15 text-signal-liquid shadow-[inset_0_0_0_1px_rgba(45,212,191,0.35)]'
                  : 'text-plant-300 hover:bg-white/[0.04] hover:text-plant-100',
              )}
            >
              {n.label}
            </button>
          ) : (
            <span
              key={n.label}
              title="Planned module"
              className="flex cursor-default items-center gap-1 whitespace-nowrap px-2 py-1 text-[11px] text-plant-500"
            >
              {n.label}
              <span className="rounded-sm border border-white/10 px-1 font-mono text-[8px] uppercase tracking-wider">soon</span>
            </span>
          ),
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-4">{route === 'flowsheet' && <FlowsheetStatus />}</div>
    </header>
  );
}

function FlowsheetStatus() {
  const nodes = useFlowsheet((s) => s.nodes.length);
  const streams = useFlowsheet((s) => s.edges.length);
  const resolved = useFlowsheet((s) => s.edges.filter((e) => e.data?.resolved).length);
  const resetDemo = useFlowsheet((s) => s.resetDemo);
  const ms = useFlowsheet((s) => s.lastSolveMs);
  const errors = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'error').length);
  const warnings = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'warning').length);
  return (
    <>
      <span className="hidden font-mono text-[10px] text-plant-400 xl:inline">
        <Stat label="UNITS" value={nodes} /> · <Stat label="STREAMS" value={`${resolved}/${streams}`} /> ·{' '}
        <Stat label="SYSTEM" value="Benzene / Toluene" />
      </span>
      {(errors > 0 || warnings > 0) && (
        <span className="font-mono text-[10px]">
          {errors > 0 && <span className="text-signal-alarm">{errors} ERR </span>}
          {warnings > 0 && <span className="text-signal-vapor">{warnings} WARN</span>}
        </span>
      )}
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-signal-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-signal-ok shadow-[0_0_6px] shadow-signal-ok" />
        ENGINE ONLINE
        <span className="text-plant-500">· {ms.toFixed(1)} ms</span>
      </span>
      <button
        type="button"
        onClick={resetDemo}
        className="flex items-center gap-1.5 rounded border border-white/[0.07] px-2 py-1 font-mono text-[10px] text-plant-300 transition-colors hover:border-signal-liquid/40 hover:text-signal-liquid"
      >
        <RotateCcw className="h-3 w-3" /> RESET
      </button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span>
      <span className="text-plant-500">{label} </span>
      <span className="text-plant-200">{value}</span>
    </span>
  );
}
