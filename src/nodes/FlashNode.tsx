import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt, kToC } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

/** Vertical flash drum with mesh demister, inlet nozzle, vapour and liquid outlets. */
function DrumSymbol() {
  return (
    <svg viewBox="0 0 64 112" className="h-[112px] w-[64px] shrink-0" aria-hidden>
      <rect x="14" y="10" width="36" height="92" rx="18" fill="rgb(var(--sig-liquid)/0.06)" stroke="rgb(var(--sig-liquid))" strokeWidth="1.4" />
      {/* demister pad */}
      <path d="M17 30h30" stroke="rgb(var(--plant-400))" strokeWidth="1" />
      <path d="M17 34h30" stroke="rgb(var(--plant-400))" strokeWidth="1" />
      <path d="M19 30l4 4 4-4 4 4 4-4 4 4 4-4" stroke="rgb(var(--plant-400))" strokeWidth="0.8" fill="none" />
      {/* liquid level */}
      <path d="M15 74h34" stroke="rgb(var(--sig-liquid))" strokeOpacity="0.7" strokeDasharray="3 2" />
      <path d="M0 56h14" stroke="rgb(var(--plant-400))" strokeWidth="1.3" />
      <path d="M32 10V2h32" stroke="rgb(var(--sig-vapor))" strokeWidth="1.3" fill="none" />
      <path d="M32 102v8h32" stroke="rgb(var(--sig-liquid))" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

export function FlashNode({ data, selected }: NodeProps<UnitNode>) {
  const V = data.state.topProduct;
  const L = data.state.bottomProduct;
  const F = V && L ? V.flowRate + L.flowRate : 0;
  return (
    <NodeShell tag={data.tag} label="Flash drum" selected={selected} diag={data.diag} accent="vapor" className="w-[210px]">
      <div className="flex gap-2">
        <DrumSymbol />
        <div className="flex-1 py-0.5">
          <Readout label="Q" value={fmt(data.params.heatDuty, 0)} unit="kW" tone="heat" />
          <Readout label="P" value={fmt(data.params.flashPressure ?? V?.pressure, 1)} unit="kPa" />
          <Readout label="T" value={fmt(V ? kToC(V.temperature) : null)} unit="°C" tone={V ? 'default' : 'muted'} />
          <Readout label="V/F" value={fmt(F > 0 ? V!.flowRate / F : null, 3)} tone={V ? 'vapor' : 'muted'} />
          <Readout label="yA" value={fmt(V?.molarFractions.compA, 3)} tone={V ? 'vapor' : 'muted'} />
          <Readout label="xA" value={fmt(L?.molarFractions.compA, 3)} tone={L ? 'liquid' : 'muted'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 101 }} />
      <Handle type="source" position={Position.Right} id="vapor" style={{ top: 47 }} />
      <Handle type="source" position={Position.Right} id="liquid" style={{ top: 155 }} />
    </NodeShell>
  );
}
