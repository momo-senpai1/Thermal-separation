import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt, kToC } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

export function MixerNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  return (
    <NodeShell tag={data.tag} label="Mixer" selected={selected} diag={data.diag}>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
          <path d="M0 14h14M0 34h14" stroke="#5c7089" strokeWidth="1.5" />
          <path d="M14 6 40 24 14 42z" fill="rgba(45,212,191,0.06)" stroke="#2dd4bf" strokeWidth="1.5" />
          <path d="M40 24h8" stroke="#5c7089" strokeWidth="1.5" />
        </svg>
        <div className="min-w-[96px] flex-1">
          <Readout label="F" value={fmt(s?.flowRate)} unit="kmol/h" tone={s ? 'default' : 'muted'} />
          <Readout label="T" value={fmt(s ? kToC(s.temperature) : null)} unit="°C" tone={s ? 'heat' : 'muted'} />
          <Readout label="xA" value={fmt(s?.molarFractions.compA, 3)} tone={s ? 'liquid' : 'muted'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in-1" style={{ top: '38%' }} />
      <Handle type="target" position={Position.Left} id="in-2" style={{ top: '78%' }} />
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}
