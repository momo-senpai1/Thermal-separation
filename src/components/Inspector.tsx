import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { cn, cToK, fmt, kToC } from '@/lib/utils';
import { DEFAULT_FEED, useFlowsheet, type StreamEdge, type UnitNode } from '@/store/flowsheetStore';
import type { CondenserType, Diagnostics, FeedSpec, StreamConditions } from '@/types/process';

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
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {node ? (
          <>
            <NodePanel node={node} />
            <DiagPanel diag={node.data.diag} />
          </>
        ) : edge ? (
          <StreamPanel edge={edge} />
        ) : (
          <Empty />
        )}
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

function KV({ rows }: { rows: [label: string, value: string, unit?: string][] }) {
  return (
    <table className="w-full font-mono text-[11px]">
      <tbody>
        {rows.map(([k, v, u]) => (
          <tr key={k} className="border-b border-white/[0.03] last:border-0">
            <td className="py-1 text-plant-400">{k}</td>
            <td className="readout py-1 text-right text-plant-100">{v}</td>
            <td className="w-12 py-1 pl-2 text-[9px] text-plant-500">{u ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const phaseOf = (q: number) => (q > 1 ? 'subcooled liq.' : q === 1 ? 'sat. liquid' : q > 0 ? 'two-phase' : q === 0 ? 'sat. vapour' : 'superheated');

function streamRows(s: StreamConditions): [string, string, string?][] {
  return [
    ['F', fmt(s.flowRate, 2), 'kmol/h'],
    ['T', fmt(kToC(s.temperature), 2), '°C'],
    ['P', fmt(s.pressure, 2), 'kPa'],
    ['q', `${fmt(s.vaporFraction, 3)}`, phaseOf(Number(s.vaporFraction.toFixed(4)))],
    ['xA', fmt(s.molarFractions.compA, 4), 'mol/mol'],
    ['xB', fmt(s.molarFractions.compB, 4), 'mol/mol'],
  ];
}

function NodePanel({ node }: { node: UnitNode }) {
  const updateParams = useFlowsheet((s) => s.updateNodeParams);
  const updateFeed = useFlowsheet((s) => s.updateFeed);
  const { params, state } = node.data;

  switch (node.type) {
    case 'feed': {
      const f = state.topProduct ?? DEFAULT_FEED;
      const spec = params.feedSpec ?? 'T';
      return (
        <Section title="Feed specification">
          <ParamSlider label="Molar flow" symbol="F" unit="kmol/h" min={1} max={500} step={1} digits={0}
            value={f.flowRate} onChange={(v) => updateFeed(node.id, { flowRate: v })} />
          <ParamSlider label="Pressure" symbol="P" unit="kPa" min={10} max={500} step={0.5}
            value={f.pressure} onChange={(v) => updateFeed(node.id, { pressure: v })} />
          <ParamSlider label="Light key (A)" symbol="xA" min={0.01} max={0.99} step={0.005} digits={3}
            value={f.molarFractions.compA}
            onChange={(v) => updateFeed(node.id, { molarFractions: { compA: v, compB: 1 - v } })} />
          <div className="space-y-1.5">
            <p className="text-[11px] text-plant-300">Thermal specification</p>
            <Segmented<FeedSpec>
              value={spec}
              onChange={(v) => updateParams(node.id, { feedSpec: v })}
              options={[
                { value: 'T', label: 'Spec T', hint: 'Specify temperature — q is computed' },
                { value: 'q', label: 'Spec q', hint: 'Specify thermal condition — T is computed' },
              ]}
            />
          </div>
          <ParamSlider label="Temperature" symbol="T" unit="°C" min={0} max={250} step={0.5}
            computed={spec === 'q'}
            value={kToC(f.temperature)} onChange={(v) => updateFeed(node.id, { temperature: cToK(v) })} />
          <ParamSlider label="Thermal condition" symbol="q" min={-0.5} max={1.5} step={0.01} digits={3}
            computed={spec === 'T'}
            value={f.vaporFraction} onChange={(v) => updateFeed(node.id, { vaporFraction: v })} />
          <p className="readout text-[10px] text-plant-500">
            {phaseOf(Number(f.vaporFraction.toFixed(4)))} · xB = {fmt(f.molarFractions.compB, 3)}
          </p>
        </Section>
      );
    }
    case 'heater':
      return (
        <>
          <Section title="Exchanger">
            <ParamSlider label="Heat duty" symbol="Q" unit="kW" min={-2000} max={2000} step={5} digits={0}
              value={params.heatDuty} onChange={(v) => updateParams(node.id, { heatDuty: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">
              Q &gt; 0 heats, Q &lt; 0 cools. Isobaric; outlet from a PH flash.
            </p>
          </Section>
          {state.topProduct && (
            <Section title="Outlet">
              <KV rows={streamRows(state.topProduct)} />
            </Section>
          )}
        </>
      );
    case 'mixer':
      return (
        <>
          <Section title="Mixer">
            <p className="text-[11px] leading-relaxed text-plant-400">
              Adiabatic mixing; outlet at the lowest inlet pressure, solved by component and enthalpy balances
              followed by a PH flash.
            </p>
          </Section>
          {state.topProduct && (
            <Section title="Outlet">
              <KV rows={streamRows(state.topProduct)} />
            </Section>
          )}
        </>
      );
    case 'distillation': {
      const c = node.data.column;
      return (
        <>
          <Section title="Column design">
            <ParamSlider label="Theoretical stages" symbol="N" unit="stg" min={2} max={60} step={1} digits={0}
              value={params.theoreticalStages} onChange={(v) => updateParams(node.id, { theoreticalStages: Math.round(v) })} />
            <ParamSlider label="Reflux ratio" symbol="R" unit="L/D" min={0.1} max={15} step={0.05} digits={2}
              value={params.refluxRatio} onChange={(v) => updateParams(node.id, { refluxRatio: v })} />
            <ParamSlider label="Distillate / feed" symbol="D/F" min={0.05} max={0.95} step={0.005} digits={3}
              value={params.distillateToFeed ?? 0.5} onChange={(v) => updateParams(node.id, { distillateToFeed: v })} />
            <div className="space-y-1.5">
              <p className="text-[11px] text-plant-300">Condenser</p>
              <Segmented<CondenserType>
                value={params.condenserType ?? 'total'}
                onChange={(v) => updateParams(node.id, { condenserType: v })}
                options={[
                  { value: 'total', label: 'Total', hint: 'Saturated-liquid distillate · 0 equilibrium stages' },
                  { value: 'partial', label: 'Partial', hint: 'Vapour distillate · +1 equilibrium stage' },
                ]}
              />
            </div>
            <p className="text-[10px] leading-relaxed text-plant-500">
              N includes the reboiler. Rating mode: McCabe–Thiele stepping (CMO, constant α) with optimal feed
              stage; x<sub>D</sub> is solved so the bottoms close the balance.
            </p>
          </Section>
          {c && (
            <Section title="Performance">
              <KV
                rows={[
                  ['α avg (A/B)', fmt(c.alpha, 3)],
                  ['D', fmt(c.D, 2), 'kmol/h'],
                  ['B', fmt(c.B, 2), 'kmol/h'],
                  ['xD', fmt(c.xD, 4)],
                  ['xB', fmt(c.xB, 4)],
                  ['Feed stage', String(c.feedStage), `of ${params.theoreticalStages}`],
                  ['Rmin', fmt(c.Rmin, 3)],
                  ['R / Rmin', fmt(params.refluxRatio / c.Rmin, 2)],
                  ['Nmin (Fenske)', fmt(c.Nmin, 2), 'stg'],
                  ['Qc', fmt(c.Qc, 1), 'kW'],
                  ['Qr', fmt(c.Qr, 1), 'kW'],
                ]}
              />
            </Section>
          )}
        </>
      );
    }
    default:
      return null;
  }
}

function DiagPanel({ diag }: { diag?: Diagnostics }) {
  if (!diag || diag.status === 'ok') return null;
  const tone = {
    error: 'border-signal-alarm/30 bg-signal-alarm/[0.06] text-signal-alarm',
    warning: 'border-signal-vapor/25 bg-signal-vapor/[0.05] text-signal-vapor/90',
    idle: 'border-white/[0.06] bg-white/[0.02] text-plant-400',
  }[diag.status];
  return (
    <div className={cn('space-y-1 rounded border px-2 py-1.5 text-[10px] leading-relaxed', tone)}>
      <p className="tag">{diag.status}</p>
      {diag.messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

function StreamPanel({ edge }: { edge: StreamEdge }) {
  const d = edge.data;
  if (!d) return null;
  return (
    <Section title={d.resolved ? 'Stream conditions' : 'Stream conditions · unresolved'}>
      {d.resolved ? (
        <KV rows={streamRows(d)} />
      ) : (
        <p className="text-[11px] text-plant-500">Upstream unit has no solved state yet.</p>
      )}
    </Section>
  );
}

function Empty() {
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-plant-500">
      <p>Click a unit to edit its parameters, or a stream to read its conditions.</p>
      <p className="font-mono text-[10px]">⌫ delete · drag handle → handle to connect · scroll to zoom</p>
    </div>
  );
}
