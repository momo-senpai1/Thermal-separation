import { RotateCcw } from 'lucide-react';
import { useFlowsheet } from '@/store/flowsheetStore';

export function StatusBar() {
  const nodes = useFlowsheet((s) => s.nodes.length);
  const streams = useFlowsheet((s) => s.edges.length);
  const resolved = useFlowsheet((s) => s.edges.filter((e) => e.data?.resolved).length);
  const resetDemo = useFlowsheet((s) => s.resetDemo);
  const ms = useFlowsheet((s) => s.lastSolveMs);
  const errors = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'error').length);
  const warnings = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'warning').length);

  return (
    <header className="glass flex h-11 shrink-0 items-center gap-6 px-4">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-signal-liquid stroke-[1.5]" aria-hidden>
          <rect x="8" y="2" width="8" height="20" rx="4" />
          <path d="M8 8h5M16 12h-5M8 16h5" />
        </svg>
        <span className="text-sm font-semibold tracking-tight text-plant-100">Thermal Separation</span>
        <span className="tag text-plant-500">P&amp;ID · v0.1</span>
      </div>

      <div className="flex items-center gap-5 font-mono text-[10px] text-plant-400">
        <Stat label="UNITS" value={nodes} />
        <Stat label="STREAMS" value={`${resolved}/${streams}`} />
        <Stat label="SYSTEM" value="Benzene / Toluene" />
        <Stat label="MODEL" value="Raoult · CMO" />
      </div>

      <div className="ml-auto flex items-center gap-4">
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
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="text-plant-500">{label} </span>
      <span className="text-plant-200">{value}</span>
    </span>
  );
}
