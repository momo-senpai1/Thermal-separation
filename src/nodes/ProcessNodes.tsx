import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import { Schematic } from '@/components/equipment/Schematic';
import { BLOCKS } from '@/engine/blocks';
import { fmt, kToC } from '@/lib/utils';
import type { UnitNode } from '@/store/flowsheetStore';
import { isBlock } from '@/types/process';
import { NodeShell, Readout } from './NodeShell';

const C = {
  liquid: 'rgb(var(--sig-liquid))',
  vapor: 'rgb(var(--sig-vapor))',
  heat: 'rgb(var(--sig-heat))',
  neutral: 'rgb(var(--plant-400))',
  cold: 'var(--viz-eq)',
};

function Symbol({ children, w = 48, h = 48 }: { children: ReactNode; w?: number; h?: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} className="shrink-0" aria-hidden>
      {children}
    </svg>
  );
}

/** Cooler / condenser: exchanger circle with a cold coil. */
export function CoolerNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  return (
    <NodeShell tag={data.tag} label="Cooler" selected={selected} diag={data.diag}>
      <div className="flex items-center gap-3">
        <Symbol>
          <circle cx="24" cy="24" r="17" fill="rgb(var(--viz-eq-rgb)/0.07)" stroke={C.cold} strokeWidth={1.5} />
          <path d="M4 24h8l4-8 5 16 5-16 5 16 4-8h9" stroke={C.cold} strokeWidth={1.3} fill="none" />
        </Symbol>
        <div className="min-w-[96px] flex-1">
          <Readout label="Q" value={fmt(data.params.heatDuty, 0)} unit="kW" tone="heat" />
          <Readout label="T out" value={fmt(s ? kToC(s.temperature) : null)} unit="°C" tone={s ? 'default' : 'muted'} />
          <Readout label="q out" value={fmt(s?.vaporFraction, 3)} tone={s ? 'liquid' : 'muted'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}

/** Centrifugal pump. */
export function PumpNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  const W = data.extra?.find((r) => r[0] === 'Shaft power')?.[1];
  return (
    <NodeShell tag={data.tag} label="Pump" selected={selected} diag={data.diag}>
      <div className="flex items-center gap-3">
        <Symbol>
          <circle cx="22" cy="26" r="15" fill="rgb(var(--sig-liquid)/0.06)" stroke={C.liquid} strokeWidth={1.5} />
          <path d="M22 11h20v6" stroke={C.liquid} strokeWidth={1.4} fill="none" />
          <path d="M14 38l-6 8h28l-6-8" stroke={C.neutral} strokeWidth={1.2} fill="none" />
          <path d="M16 26l12-7v14z" fill={C.liquid} fillOpacity={0.5} />
        </Symbol>
        <div className="min-w-[96px] flex-1">
          <Readout label="p out" value={fmt(data.params.outletPressure, 0)} unit="kPa" />
          <Readout label="W" value={W ?? '—'} unit="kW" tone={s ? 'heat' : 'muted'} />
          <Readout label="η" value={fmt(data.params.efficiency, 2)} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}

/** Control / let-down valve (bow-tie). */
export function ValveNode({ data, selected }: NodeProps<UnitNode>) {
  const s = data.state.topProduct;
  return (
    <NodeShell tag={data.tag} label="Valve" selected={selected} diag={data.diag} accent="vapor">
      <div className="flex items-center gap-3">
        <Symbol>
          <path d="M6 14l36 20V14L6 34z" fill="rgb(var(--sig-vapor)/0.07)" stroke={C.vapor} strokeWidth={1.5} />
          <path d="M24 24V8M16 8h16" stroke={C.neutral} strokeWidth={1.3} />
        </Symbol>
        <div className="min-w-[96px] flex-1">
          <Readout label="p out" value={fmt(data.params.outletPressure, 1)} unit="kPa" />
          <Readout label="T out" value={fmt(s ? kToC(s.temperature) : null)} unit="°C" tone={s ? 'default' : 'muted'} />
          <Readout label="q out" value={fmt(s?.vaporFraction, 3)} tone={!s ? 'muted' : s.vaporFraction < 1 ? 'vapor' : 'liquid'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </NodeShell>
  );
}

/** Splitter / tee. */
export function SplitterNode({ data, selected }: NodeProps<UnitNode>) {
  const a = data.state.topProduct;
  const b = data.state.bottomProduct;
  return (
    <NodeShell tag={data.tag} label="Splitter" selected={selected} diag={data.diag}>
      <div className="flex items-center gap-3">
        <Symbol>
          <path d="M0 24h20M20 24l20-12M20 24l20 12" stroke={C.liquid} strokeWidth={1.6} fill="none" />
          <circle cx="20" cy="24" r="4" fill={C.liquid} />
        </Symbol>
        <div className="min-w-[96px] flex-1">
          <Readout label="split" value={fmt(data.params.splitFraction, 2)} />
          <Readout label="F₁" value={fmt(a?.flowRate, 1)} unit="kmol/h" tone={a ? 'default' : 'muted'} />
          <Readout label="F₂" value={fmt(b?.flowRate, 1)} unit="kmol/h" tone={b ? 'default' : 'muted'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out-1" style={{ top: '45%' }} />
      <Handle type="source" position={Position.Right} id="out-2" style={{ top: '80%' }} />
    </NodeShell>
  );
}

/** Evaporator with calandria: vaporize a set fraction, duty is the result. */
export function EvaporatorNode({ data, selected }: NodeProps<UnitNode>) {
  const V = data.state.topProduct;
  const Q = data.extra?.find((r) => r[0] === 'Heat duty')?.[1];
  return (
    <NodeShell tag={data.tag} label="Evaporator" selected={selected} diag={data.diag} accent="heat" className="w-[210px]">
      <div className="flex gap-2">
        <Symbol w={60} h={108}>
          <rect x="14" y="6" width="32" height="36" rx="14" fill="rgb(var(--sig-liquid)/0.05)" stroke={C.liquid} strokeWidth={1.4} />
          <rect x="16" y="42" width="28" height="44" rx="3" fill="rgb(var(--sig-heat)/0.06)" stroke={C.heat} strokeWidth={1.3} />
          {[22, 28, 34, 40].map((x) => (
            <path key={x} d={`M${x} 44v40`} stroke={C.liquid} strokeWidth={0.9} />
          ))}
          <path d="M30 86v8" stroke={C.liquid} strokeWidth={1.3} />
          <path d="M30 6V0h30" stroke={C.vapor} strokeWidth={1.3} fill="none" />
          <path d="M46 64h14" stroke={C.heat} strokeWidth={1.3} />
        </Symbol>
        <div className="flex-1 py-0.5">
          <Readout label="V/F" value={fmt(data.params.targetVF, 2)} tone="vapor" />
          <Readout label="P" value={fmt(data.params.flashPressure, 1)} unit="kPa" />
          <Readout label="Q" value={Q ?? '—'} unit="kW" tone={V ? 'heat' : 'muted'} />
          <Readout label="T" value={fmt(V ? kToC(V.temperature) : null)} unit="°C" tone={V ? 'default' : 'muted'} />
          <Readout label="yA" value={fmt(V?.molarFractions.compA, 3)} tone={V ? 'vapor' : 'muted'} />
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 112 }} />
      <Handle type="source" position={Position.Right} id="vapor" style={{ top: 40 }} />
      <Handle type="source" position={Position.Right} id="liquid" style={{ top: 132 }} />
    </NodeShell>
  );
}

/** Standalone process block (absorber, extractor, evaporator train, crystallizer, dryer). */
export function BlockNode({ data, selected, type }: NodeProps<UnitNode>) {
  if (!isBlock(type)) return null;
  const def = BLOCKS[type];
  const rows = data.block?.rows ?? [];
  return (
    <NodeShell tag={data.tag} label={def.title} selected={selected} diag={data.diag} className="w-[250px]">
      <div className="flex gap-2">
        <div className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded border border-white/[0.05] bg-plant-950/50">
          <Schematic id={def.schematic} className="h-[84px] w-[88px]" />
        </div>
        <div className="min-w-0 flex-1">
          {rows.slice(0, 5).map(([l, v, u]) => (
            <Readout key={l} label={l} value={v} unit={u || undefined} />
          ))}
        </div>
      </div>
      <p className="mt-1 font-mono text-[9px] text-plant-500">standalone block · own feed spec</p>
    </NodeShell>
  );
}
