import { Handle, Position, type NodeProps } from '@xyflow/react';
import { fmt, kToC } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { NodeShell, Readout } from './NodeShell';

export function FeedNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  const qSpec = data.params.feedSpec === 'q';
  return (
    <NodeShell tag={data.tag} label="Feed" selected={selected} diag={data.diag}>
      <div className="flex gap-3">
        {/* off-page connector / source symbol */}
        <svg viewBox="0 0 40 56" className="h-14 w-10 shrink-0" aria-hidden>
          <path d="M4 8h20l12 20-12 20H4z" fill="rgba(45,212,191,0.06)" stroke="#2dd4bf" strokeWidth="1.5" />
          <path d="M10 28h14m-4-4 4 4-4 4" stroke="#2dd4bf" strokeWidth="1.5" fill="none" />
        </svg>
        <div className="min-w-[104px] flex-1">
          <Readout label="F" value={fmt(s?.flowRate)} unit="kmol/h" />
          <Readout label="T" value={fmt(s ? kToC(s.temperature) : null)} unit="°C" tone="heat" computed={qSpec} />
          <Readout label="P" value={fmt(s?.pressure)} unit="kPa" />
          <Readout label="q" value={fmt(s?.vaporFraction, 2)} tone={s && s.vaporFraction < 1 ? 'vapor' : 'liquid'} computed={!qSpec} />
          <Readout label="xA" value={fmt(s?.molarFractions.compA, 3)} tone="liquid" />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}
