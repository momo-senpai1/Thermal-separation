import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { cToK, fmt, kToC } from '@/lib/utils';
import { DEFAULT_FEED, useFlowsheet, type StreamEdge, type UnitNode } from '@/store/flowsheetStore';
import type { CondenserType } from '@/types/process';

export function Inspector() {
  const node = useFlowsheet((s) => s.nodes.find((n) => n.selected));
  const edge = useFlowsheet((s) => s.edges.find((e) => e.selected));

  return (
    <aside className="glass flex w-72 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">Inspector</p>
        <p className="mt-0.5 truncate text-[10px] text-plant-500">
          {node ? `${node.data.tag} · ${node.data.label}` : edge ? `Stream ${edge.data?.tag}` : 'Select a unit or stream'}
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {node ? <NodePanel node={node} /> : edge ? <StreamPanel edge={edge} /> : <Empty />}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="tag border-b border-white/[0.04] pb-1 text-plant-500">{title}</p>
      {children}
    </section>
  );
}

function NodePanel({ node }: { node: UnitNode }) {
  const updateParams = useFlowsheet((s) => s.updateNodeParams);
  const updateFeed = useFlowsheet((s) => s.updateFeed);
  const { params } = node.data;

  switch (node.type) {
    case 'feed': {
      const f = node.data.state.topProduct ?? DEFAULT_FEED;
      return (
        <Section title="Feed specification">
          <ParamSlider label="Molar flow" symbol="F" unit="kmol/h" min={1} max={500} step={1} digits={0}
            value={f.flowRate} onChange={(v) => updateFeed(node.id, { flowRate: v })} />
          <ParamSlider label="Temperature" symbol="T" unit="°C" min={0} max={250} step={0.5}
            value={kToC(f.temperature)} onChange={(v) => updateFeed(node.id, { temperature: cToK(v) })} />
          <ParamSlider label="Pressure" symbol="P" unit="kPa" min={10} max={1000} step={0.5}
            value={f.pressure} onChange={(v) => updateFeed(node.id, { pressure: v })} />
          <ParamSlider label="Thermal condition" symbol="q" min={-0.5} max={1.5} step={0.01} digits={2}
            value={f.vaporFraction} onChange={(v) => updateFeed(node.id, { vaporFraction: v })} />
          <ParamSlider label="Light key (A)" symbol="xA" min={0.01} max={0.99} step={0.005} digits={3}
            value={f.molarFractions.compA}
            onChange={(v) => updateFeed(node.id, { molarFractions: { compA: v, compB: 1 - v } })} />
          <p className="readout text-[10px] text-plant-500">
            xB = 1 − xA = {fmt(f.molarFractions.compB, 3)}
          </p>
        </Section>
      );
    }
    case 'heater':
      return (
        <Section title="Exchanger">
          <ParamSlider label="Heat duty" symbol="Q" unit="kW" min={-2000} max={2000} step={5} digits={0}
            value={params.heatDuty} onChange={(v) => updateParams(node.id, { heatDuty: v })} />
          <EngineNote />
        </Section>
      );
    case 'mixer':
      return (
        <Section title="Mixer">
          <p className="text-[11px] leading-relaxed text-plant-400">
            Adiabatic, isobaric mixing of two inlets. Outlet is computed from component and enthalpy balances.
          </p>
          <EngineNote />
        </Section>
      );
    case 'distillation':
      return (
        <Section title="Column design">
          <ParamSlider label="Theoretical stages" symbol="N" unit="stg" min={2} max={60} step={1} digits={0}
            value={params.theoreticalStages} onChange={(v) => updateParams(node.id, { theoreticalStages: Math.round(v) })} />
          <ParamSlider label="Reflux ratio" symbol="R" unit="L/D" min={0.1} max={15} step={0.05} digits={2}
            value={params.refluxRatio} onChange={(v) => updateParams(node.id, { refluxRatio: v })} />
          <div className="space-y-1.5">
            <p className="text-[11px] text-plant-300">Condenser</p>
            <Segmented<CondenserType>
              value={params.condenserType ?? 'total'}
              onChange={(v) => updateParams(node.id, { condenserType: v })}
              options={[
                { value: 'total', label: 'Total', hint: 'Saturated-liquid distillate · 0 equilibrium stages' },
                { value: 'partial', label: 'Partial', hint: 'Vapour distillate · 1 equilibrium stage' },
              ]}
            />
          </div>
          <EngineNote />
        </Section>
      );
    default:
      return null;
  }
}

function StreamPanel({ edge }: { edge: StreamEdge }) {
  const d = edge.data;
  if (!d) return null;
  const rows: [string, string, string][] = [
    ['F', fmt(d.flowRate, 2), 'kmol/h'],
    ['T', fmt(kToC(d.temperature), 2), '°C'],
    ['P', fmt(d.pressure, 2), 'kPa'],
    ['q', fmt(d.vaporFraction, 3), '—'],
    ['xA', fmt(d.molarFractions.compA, 4), 'mol/mol'],
    ['xB', fmt(d.molarFractions.compB, 4), 'mol/mol'],
  ];
  return (
    <Section title={d.resolved ? 'Stream conditions' : 'Stream conditions · unresolved'}>
      <table className="w-full font-mono text-[11px]">
        <tbody>
          {rows.map(([k, v, u]) => (
            <tr key={k} className="border-b border-white/[0.03]">
              <td className="py-1 text-plant-400">{k}</td>
              <td className={`readout py-1 text-right ${d.resolved ? 'text-plant-100' : 'text-plant-500'}`}>
                {d.resolved ? v : '—'}
              </td>
              <td className="py-1 pl-2 text-[9px] text-plant-500">{u}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function EngineNote() {
  return (
    <p className="rounded border border-signal-vapor/20 bg-signal-vapor/[0.05] px-2 py-1.5 text-[10px] leading-relaxed text-signal-vapor/80">
      Outlet state is solved by the thermodynamics engine (Phase 2/3). Parameters are stored now and
      propagate once the engine is connected.
    </p>
  );
}

function Empty() {
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-plant-500">
      <p>Click a unit to edit its parameters, or a stream to read its conditions.</p>
      <p className="font-mono text-[10px]">
        ⌫ delete · drag handle → handle to connect · scroll to zoom
      </p>
    </div>
  );
}
