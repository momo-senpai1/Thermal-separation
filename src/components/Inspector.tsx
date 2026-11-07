import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/workbench/controls';
import { BLOCKS } from '@/engine/blocks';
import { COMPONENTS } from '@/engine/components';
import { isBlock } from '@/types/process';
import { navigate } from '@/lib/route';
import { cn, cToK, fmt, kToC } from '@/lib/utils';
import { DEFAULT_FEED, useFlowsheet, type StreamEdge, type UnitNode } from '@/store/flowsheetStore';
import type { CondenserType, Diagnostics, FeedSpec, StreamConditions } from '@/types/process';
import { t } from '@/i18n';

export function Inspector() {
  const node = useFlowsheet((s) => s.nodes.find((n) => n.selected));
  const edge = useFlowsheet((s) => s.edges.find((e) => e.selected));

  return (
    <aside className="glass flex w-72 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Inspector')}</p>
        <p className="mt-0.5 truncate text-[10px] text-plant-500">
          {node ? `${node.data.tag} · ${t(node.data.label)}` : edge ? `${t('Stream')} ${edge.data?.tag}` : t('Select a unit or stream')}
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
      <p className="tag border-b border-white/[0.04] pb-1 text-plant-500">{t(title)}</p>
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
  const system = useFlowsheet((s) => s.system);
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
          <ParamSlider label={`Light key · ${COMPONENTS[system.A].name}`} symbol="xA" min={0.01} max={0.99} step={0.005} digits={3}
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
            <div className="space-y-1.5">
              <p className="text-[11px] text-plant-300">Internals</p>
              <Segmented<'trays' | 'packing'>
                value={params.internals ?? 'trays'}
                onChange={(v) => updateParams(node.id, { internals: v })}
                options={[
                  { value: 'trays', label: 'Trays', hint: 'Sieve / valve / bubble-cap trays' },
                  { value: 'packing', label: 'Packing', hint: 'Random or structured packing' },
                ]}
              />
            </div>
            {(params.internals ?? 'trays') === 'trays' ? (
              <ParamSlider label="Overall tray efficiency" symbol="E_o" min={0.3} max={1} step={0.01} digits={2}
                value={params.trayEfficiency ?? 0.7} onChange={(v) => updateParams(node.id, { trayEfficiency: v })} />
            ) : (
              <ParamSlider label="HETP" symbol="HETP" unit="m" min={0.15} max={1.2} step={0.01} digits={2}
                value={params.hetp ?? 0.5} onChange={(v) => updateParams(node.id, { hetp: v })} />
            )}
            <p className="font-mono text-[10px] text-plant-400">
              {(params.internals ?? 'trays') === 'trays'
                ? `${Math.ceil((params.theoreticalStages - 1) / (params.trayEfficiency ?? 0.7))} real trays + reboiler (${params.theoreticalStages - 1} theoretical above it)`
                : `packed height ${((params.theoreticalStages - 1) * (params.hetp ?? 0.5)).toFixed(1)} m for ${params.theoreticalStages - 1} theoretical stages`}
            </p>
            <p className="text-[10px] leading-relaxed text-plant-500">
              N includes the reboiler. Rating mode: McCabe–Thiele stepping (CMO, constant α) with optimal feed
              stage; x<sub>D</sub> is solved so the bottoms close the balance.
            </p>
          </Section>
          {c && (
            <OpenButton
              label="Open in McCabe–Thiele workbench"
              onClick={() => navigate('mccabe-thiele', { alpha: c.alpha.toFixed(3), v: params.refluxRatio, xF: c.zF.toFixed(4), q: c.q.toFixed(3) })}
            />
          )}
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
                  [c.curve ? 'Nmin (total reflux)' : 'Nmin (Fenske)', fmt(c.Nmin, 2), 'stg'],
                  ['Qc', fmt(c.Qc, 1), 'kW'],
                  ['Qr', fmt(c.Qr, 1), 'kW'],
                ]}
              />
            </Section>
          )}
        </>
      );
    }
    case 'flash':
      return (
        <>
          <Section title="Flash drum">
            <ParamSlider label="Heat duty" symbol="Q" unit="kW" min={-2000} max={4000} step={5} digits={0}
              value={params.heatDuty} onChange={(v) => updateParams(node.id, { heatDuty: v })} />
            <ParamSlider label="Drum pressure" symbol="P" unit="kPa" min={10} max={500} step={0.5} digits={1}
              value={params.flashPressure ?? 101.325} onChange={(v) => updateParams(node.id, { flashPressure: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">
              Heat by Q, let down to P (PH flash), separate. A mesh demister keeps entrained droplets out of the vapour.
            </p>
          </Section>
          {state.topProduct && state.bottomProduct && (
            <>
              <Section title="Vapour (top)">
                <KV rows={streamRows(state.topProduct)} />
              </Section>
              <Section title="Liquid (bottom)">
                <KV rows={streamRows(state.bottomProduct)} />
              </Section>
            </>
          )}
        </>
      );
    case 'cooler':
      return (
        <>
          <Section title="Cooler / condenser">
            <ParamSlider label="Heat duty (negative = cooling)" symbol="Q" unit="kW" min={-4000} max={0} step={5} digits={0}
              value={params.heatDuty} onChange={(v) => updateParams(node.id, { heatDuty: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">Removing the latent heat condenses a vapour; beyond that the liquid is sub-cooled (q &gt; 1).</p>
          </Section>
          {state.topProduct && <Section title="Outlet"><KV rows={streamRows(state.topProduct)} /></Section>}
        </>
      );
    case 'pump':
      return (
        <>
          <Section title="Pump">
            <ParamSlider label="Discharge pressure" symbol="p" unit="kPa" min={50} max={2000} step={5} digits={0}
              value={params.outletPressure ?? 400} onChange={(v) => updateParams(node.id, { outletPressure: v })} />
            <ParamSlider label="Efficiency" symbol="η" min={0.3} max={0.9} step={0.01} digits={2}
              value={params.efficiency ?? 0.7} onChange={(v) => updateParams(node.id, { efficiency: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">Shaft power W = V̇·Δp/η; the work ends up as a little heat in the liquid.</p>
          </Section>
          <ExtraRows node={node} />
          {state.topProduct && <Section title="Outlet"><KV rows={streamRows(state.topProduct)} /></Section>}
        </>
      );
    case 'valve':
      return (
        <>
          <Section title="Valve">
            <ParamSlider label="Downstream pressure" symbol="p" unit="kPa" min={5} max={1000} step={1} digits={0}
              value={params.outletPressure ?? 50} onChange={(v) => updateParams(node.id, { outletPressure: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">Isenthalpic let-down: a liquid at its bubble point partly flashes and cools.</p>
          </Section>
          <ExtraRows node={node} />
          {state.topProduct && <Section title="Outlet"><KV rows={streamRows(state.topProduct)} /></Section>}
        </>
      );
    case 'splitter':
      return (
        <Section title="Splitter">
          <ParamSlider label="Fraction to outlet 1" symbol="s" min={0} max={1} step={0.01} digits={2}
            value={params.splitFraction ?? 0.5} onChange={(v) => updateParams(node.id, { splitFraction: v })} />
          <p className="text-[10px] leading-relaxed text-plant-500">Both outlets keep the inlet temperature, pressure and composition (a reflux or recycle split).</p>
        </Section>
      );
    case 'evaporator':
      return (
        <>
          <Section title="Evaporator">
            <ParamSlider label="Fraction vaporized" symbol="V/F" min={0.01} max={0.99} step={0.01} digits={2}
              value={params.targetVF ?? 0.4} onChange={(v) => updateParams(node.id, { targetVF: v })} />
            <ParamSlider label="Pressure" symbol="P" unit="kPa" min={10} max={500} step={0.5} digits={1}
              value={params.flashPressure ?? 101.325} onChange={(v) => updateParams(node.id, { flashPressure: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">Specify how much to boil off; the heating duty follows from the energy balance.</p>
          </Section>
          <ExtraRows node={node} />
          {state.bottomProduct && <Section title="Concentrate (liquid)"><KV rows={streamRows(state.bottomProduct)} /></Section>}
        </>
      );
    case 'absorber':
    case 'extractor':
    case 'evaptrain':
    case 'crystallizer':
    case 'dryer':
      return <BlockPanel node={node} />;
    case 'batch': {
      const b = node.data.batch;
      const mode = params.batchMode ?? 'constant-reflux';
      const charge = useFlowsheet.getState().edges.find((e) => e.target === node.id)?.data;
      return (
        <>
          <Section title="Batch still">
            <div className="space-y-1.5">
              <p className="text-[11px] text-plant-300">Operation</p>
              <Segmented<'rayleigh' | 'constant-reflux'>
                value={mode}
                onChange={(v) => updateParams(node.id, { batchMode: v })}
                options={[
                  { value: 'rayleigh', label: 'Open', hint: 'Open distillation (Rayleigh) — the pot is the only stage' },
                  { value: 'constant-reflux', label: 'Column', hint: 'Batch rectification at constant reflux' },
                ]}
              />
            </div>
            <ParamSlider label="Stages incl. still" symbol="N" unit="stg" min={1} max={30} step={1} digits={0}
              disabled={mode === 'rayleigh'} value={params.theoreticalStages}
              onChange={(v) => updateParams(node.id, { theoreticalStages: Math.round(v) })} />
            <ParamSlider label="Reflux ratio" symbol="v" min={0} max={20} step={0.05} digits={2}
              disabled={mode === 'rayleigh'} value={params.refluxRatio} onChange={(v) => updateParams(node.id, { refluxRatio: v })} />
            <ParamSlider label="Cut (distilled fraction)" symbol="D/L₀" min={0.02} max={0.98} step={0.005} digits={3}
              value={params.distilledFraction ?? 0.5} onChange={(v) => updateParams(node.id, { distilledFraction: v })} />
            <p className="text-[10px] leading-relaxed text-plant-500">
              The inlet flow is read as kmol per batch cycle; outlets are the receiver contents and the pot residue at
              the cut. Constant α of the column-average volatility.
            </p>
          </Section>
          {b && charge?.resolved && (
            <OpenButton
              label="Open in Batch workbench"
              onClick={() =>
                navigate('batch', {
                  alpha: b.alpha.toFixed(3),
                  x0: charge.molarFractions.compA.toFixed(4),
                  mode,
                  N: params.theoreticalStages,
                  v: params.refluxRatio,
                  d: (params.distilledFraction ?? 0.5).toFixed(3),
                })
              }
            />
          )}
          {b && (
            <Section title="Per batch">
              <KV
                rows={[
                  ['α avg', fmt(b.alpha, 3)],
                  ['x̄D (receiver)', fmt(b.xDavg, 4)],
                  ['xW (residue)', fmt(b.xW, 4)],
                  ['Recovery A', fmt(b.recovery * 100, 1), '%'],
                  ['Boil-up', fmt(b.boilup, 1), 'kmol'],
                  ['Max. cut', fmt(b.dEnd, 3), 'D/L₀'],
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

function ExtraRows({ node }: { node: UnitNode }) {
  if (!node.data.extra?.length) return null;
  return (
    <Section title="Results">
      <KV rows={node.data.extra.map(([a, b, c]) => [a, b, c] as [string, string, string])} />
    </Section>
  );
}

/** Generic form for a process block, built from its field definitions. */
function BlockPanel({ node }: { node: UnitNode }) {
  const updateBlock = useFlowsheet((s) => s.updateBlock);
  if (!isBlock(node.type)) return null;
  const def = BLOCKS[node.type];
  const spec = { ...def.defaults, ...(node.data.params.block ?? {}) };
  return (
    <>
      <Section title={def.title}>
        <p className="text-[10px] leading-relaxed text-plant-500">Standalone process block: its feed is specified here, not by a stream.</p>
        {def.fields.map((f) =>
          f.options ? (
            <div key={f.key} className="space-y-1">
              <p className="text-[11px] text-plant-300">{f.label}</p>
              <Select value={String(spec[f.key])} options={f.options} onChange={(v) => updateBlock(node.id, f.key, v)} ariaLabel={f.label} />
            </div>
          ) : (
            <ParamSlider key={f.key} label={f.label} symbol={f.symbol} unit={f.unit} min={f.min!} max={f.max!} step={f.step!} digits={f.digits}
              value={Number(spec[f.key])} onChange={(v) => updateBlock(node.id, f.key, f.digits === 0 ? Math.round(v) : v)} />
          ),
        )}
      </Section>
      {node.data.block && node.data.block.rows.length > 0 && (
        <Section title="Results">
          <KV rows={node.data.block.rows} />
        </Section>
      )}
      <OpenButton label="Open the full module" onClick={() => navigate(def.route, def.routeQuery)} />
    </>
  );
}

function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-signal-liquid/40 bg-signal-liquid/[0.07] py-1.5 text-[11px] text-signal-liquid transition-colors hover:bg-signal-liquid/15"
    >
      {t(label)} →
    </button>
  );
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
      <p>{t('Click a unit to edit its parameters, or a stream to read its conditions.')}</p>
      <p className="font-mono text-[10px]">⌫ delete · drag handle → handle to connect · scroll to zoom</p>
    </div>
  );
}
