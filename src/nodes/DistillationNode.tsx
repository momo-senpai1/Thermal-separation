import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

const MAX_DRAWN_TRAYS = 14;

/** Tray column with overhead condenser + reflux, and kettle reboiler. */
function ColumnSymbol({ stages, partial }: { stages: number; partial: boolean }) {
  const drawn = Math.max(1, Math.min(stages, MAX_DRAWN_TRAYS));
  const top = 44;
  const bottom = 206;
  const pitch = (bottom - top) / (drawn + 1);
  const trays = Array.from({ length: drawn }, (_, i) => top + pitch * (i + 1));

  return (
    <svg viewBox="0 0 96 250" className="h-[250px] w-[96px] shrink-0" aria-hidden>
      <defs>
        <linearGradient id="shell" x1="0" x2="1">
          <stop offset="0" stopColor="rgb(var(--sig-liquid))" stopOpacity="0.02" />
          <stop offset="0.5" stopColor="rgb(var(--sig-liquid))" stopOpacity="0.09" />
          <stop offset="1" stopColor="rgb(var(--sig-liquid))" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* vessel */}
      <rect x="18" y="26" width="34" height="198" rx="17" fill="url(#shell)" stroke="rgb(var(--sig-liquid))" strokeWidth="1.5" />
      {trays.map((y, i) => (
        <path
          key={y}
          d={i % 2 === 0 ? `M18 ${y}h26v-4` : `M52 ${y}h-26v-4`}
          stroke="rgb(var(--sig-liquid))"
          strokeOpacity="0.55"
          strokeWidth="1"
          fill="none"
        />
      ))}
      {stages > MAX_DRAWN_TRAYS && (
        <text x="35" y="128" textAnchor="middle" className="fill-plant-300 font-mono text-[8px]">
          ⋮
        </text>
      )}

      {/* overhead vapour → condenser */}
      <path d="M35 26V10h37v8" stroke="rgb(var(--sig-vapor))" strokeWidth="1.3" fill="none" />
      <circle cx="72" cy="26" r="8" fill="rgb(var(--sig-vapor)/0.08)" stroke="rgb(var(--sig-vapor))" strokeWidth="1.3" />
      <path d="M66 22l4 4-4 4m6-8 4 4-4 4" stroke="rgb(var(--sig-vapor))" strokeWidth="1" fill="none" />
      {/* reflux return */}
      <path d="M72 34v12H52" stroke="rgb(var(--sig-liquid))" strokeWidth="1.1" strokeDasharray="3 2" fill="none" />
      {/* distillate draw (liquid for total, vapour for partial) */}
      <path d="M80 26h16" stroke={partial ? 'rgb(var(--sig-vapor))' : 'rgb(var(--sig-liquid))'} strokeWidth="1.3" />

      {/* reboiler */}
      <path d="M35 224v10h28" stroke="rgb(var(--sig-liquid))" strokeWidth="1.3" fill="none" />
      <rect x="58" y="226" width="22" height="14" rx="7" fill="rgb(var(--sig-heat)/0.08)" stroke="rgb(var(--sig-heat))" strokeWidth="1.3" />
      <path d="M69 226v-24H52" stroke="rgb(var(--sig-vapor))" strokeWidth="1.1" strokeDasharray="3 2" fill="none" />
      <path d="M80 233h16" stroke="rgb(var(--sig-liquid))" strokeWidth="1.3" />

      {/* feed nozzle */}
      <path d="M0 125h18" stroke="rgb(var(--plant-400))" strokeWidth="1.3" />
    </svg>
  );
}

export function DistillationNode({ data, selected }: NodeProps<UnitNode>) {
  const { theoreticalStages, refluxRatio, condenserType = 'total' } = data.params;
  const { topProduct: D, bottomProduct: B } = data.state;
  const partial = condenserType === 'partial';
  const col = data.column;

  return (
    <NodeShell tag={data.tag} label="Rectification" selected={selected} diag={data.diag} className="w-[236px]">
      <div className="flex gap-2">
        <ColumnSymbol stages={theoreticalStages} partial={partial} />
        <div className="flex flex-1 flex-col justify-between py-1">
          <div>
            <p className="tag mb-1 text-plant-500">Design</p>
            <Readout label="N" value={String(theoreticalStages)} unit="stg" />
            <Readout label="R" value={fmt(refluxRatio, 2)} tone="liquid" />
            <Readout label="D/F" value={fmt(data.params.distillateToFeed ?? 0.5, 2)} />
            <Readout label="Cond" value={partial ? 'PART' : 'TOTAL'} tone={partial ? 'vapor' : 'liquid'} />
            {data.params.internals === 'packing' ? (
              <Readout label="Z" value={fmt((theoreticalStages - 1) * (data.params.hetp ?? 0.5), 1)} unit="m pack" />
            ) : (
              <Readout label="Trays" value={String(Math.ceil((theoreticalStages - 1) / (data.params.trayEfficiency ?? 0.7)))} unit="real" />
            )}

          </div>
          <div>
            <p className="tag mb-1 text-plant-500">Products</p>
            <Readout label="xD" value={fmt(D?.molarFractions.compA, 4)} tone={D ? 'liquid' : 'muted'} />
            <Readout label="xB" value={fmt(B?.molarFractions.compA, 4)} tone={B ? 'liquid' : 'muted'} />
            <Readout label="NF" value={col ? String(col.feedStage) : '—'} tone={col ? 'default' : 'muted'} />
            <Readout label="QR" value={fmt(col?.Qr, 0)} unit="kW" tone={col ? 'heat' : 'muted'} />
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="feed" style={{ top: 162 }} />
      <Handle type="source" position={Position.Right} id="distillate" style={{ top: 63 }} />
      <Handle type="source" position={Position.Right} id="bottoms" style={{ top: 270 }} />
    </NodeShell>
  );
}
