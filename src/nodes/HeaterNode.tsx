import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt, kToC } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

export function HeaterNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  const q = data.params.heatDuty;
  return (
    <NodeShell tag={data.tag} label="Heater" selected={selected} diag={data.diag} accent="heat">
      <div className="flex items-center gap-3">
        {/* ISA heat-exchanger symbol: circle with process coil */}
        <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
          <circle cx="24" cy="24" r="17" fill="rgba(249,115,22,0.06)" stroke="#f97316" strokeWidth="1.5" />
          <path d="M4 24h8l4-8 5 16 5-16 5 16 4-8h9" stroke="#fdba74" strokeWidth="1.3" fill="none" />
        </svg>
        <div className="min-w-[96px] flex-1">
          <Readout label="Q" value={fmt(q, 0)} unit="kW" tone="heat" />
          <Readout label="T out" value={fmt(s ? kToC(s.temperature) : null)} unit="°C" tone={s ? 'default' : 'muted'} />
          <Readout label="q out" value={fmt(s?.vaporFraction, 3)} tone={!s ? 'muted' : s.vaporFraction < 1 ? 'vapor' : 'liquid'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}
