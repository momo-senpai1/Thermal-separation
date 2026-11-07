import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

/** Jacketed still pot with a short column, overhead condenser and receiver. */
function StillSymbol({ column }: { column: boolean }) {
  return (
    <svg viewBox="0 0 96 120" className="h-[120px] w-[96px] shrink-0" aria-hidden>
      {/* column */}
      {column && (
        <>
          <rect x="28" y="16" width="16" height="44" rx="4" fill="rgb(var(--sig-liquid)/0.06)" stroke="rgb(var(--sig-liquid))" strokeWidth="1.3" />
          {[26, 36, 46].map((y) => (
            <path key={y} d={`M28 ${y}h16`} stroke="rgb(var(--sig-liquid))" strokeOpacity="0.5" strokeWidth="0.9" />
          ))}
        </>
      )}
      {/* overhead vapour → condenser → receiver */}
      <path d={column ? 'M36 16V6h32v8' : 'M36 66V6h32v8'} stroke="rgb(var(--sig-vapor))" strokeWidth="1.2" fill="none" />
      <circle cx="68" cy="22" r="7" fill="rgb(var(--sig-vapor)/0.08)" stroke="rgb(var(--sig-vapor))" strokeWidth="1.2" />
      <path d="M68 29v14" stroke="rgb(var(--sig-liquid))" strokeWidth="1.1" />
      {column && <path d="M68 36H50v4h-6" stroke="rgb(var(--sig-liquid))" strokeWidth="1" strokeDasharray="3 2" fill="none" />}
      <rect x="60" y="43" width="16" height="18" rx="3" fill="rgb(var(--sig-liquid)/0.06)" stroke="rgb(var(--sig-liquid))" strokeWidth="1.2" />
      <path d="M61 54h14" stroke="rgb(var(--sig-liquid))" strokeOpacity="0.6" />
      <path d="M76 52h20" stroke="rgb(var(--sig-liquid))" strokeWidth="1.2" />
      {/* still pot with heating jacket */}
      <path d="M14 66h44v26a22 18 0 0 1-44 0z" fill="rgb(var(--sig-liquid)/0.06)" stroke="rgb(var(--sig-liquid))" strokeWidth="1.4" />
      <path d="M10 70v22a26 22 0 0 0 52 0V70" stroke="rgb(var(--sig-heat))" strokeWidth="1.1" strokeDasharray="3 2" fill="none" />
      <path d="M18 86h36" stroke="rgb(var(--sig-liquid))" strokeOpacity="0.5" />
      {column && <path d="M36 60v6" stroke="rgb(var(--sig-liquid))" strokeWidth="1.2" />}
      <path d="M58 104h38" stroke="rgb(var(--sig-liquid))" strokeWidth="1.2" />
      <path d="M0 76h14" stroke="rgb(var(--plant-400))" strokeWidth="1.2" />
    </svg>
  );
}

export function BatchNode({ data, selected }: NodeProps<UnitNode>) {
  const b = data.batch;
  const mode = data.params.batchMode ?? 'constant-reflux';
  return (
    <NodeShell tag={data.tag} label="Batch still" selected={selected} diag={data.diag} className="w-[236px]">
      <div className="flex gap-2">
        <StillSymbol column={mode === 'constant-reflux'} />
        <div className="flex flex-1 flex-col justify-between py-0.5">
          <div>
            <Readout label="Mode" value={mode === 'rayleigh' ? 'OPEN' : 'COLUMN'} tone={mode === 'rayleigh' ? 'vapor' : 'liquid'} />
            {mode === 'constant-reflux' && (
              <>
                <Readout label="N" value={String(data.params.theoreticalStages)} unit="stg" />
                <Readout label="v" value={fmt(data.params.refluxRatio, 2)} tone="liquid" />
              </>
            )}
            <Readout label="D/L₀" value={fmt(data.params.distilledFraction ?? 0.5, 2)} />
          </div>
          <div>
            <Readout label="x̄D" value={fmt(b?.xDavg, 4)} tone={b ? 'liquid' : 'muted'} />
            <Readout label="xW" value={fmt(b?.xW, 4)} tone={b ? 'liquid' : 'muted'} />
          </div>
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="charge" style={{ top: 113 }} />
      <Handle type="source" position={Position.Right} id="distillate" style={{ top: 89 }} />
      <Handle type="source" position={Position.Right} id="residue" style={{ top: 141 }} />
    </NodeShell>
  );
}
