import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Label, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { ParamSlider } from '@/components/ParamSlider';
import { Field, Kpi, Notice, Panel, Select } from '@/components/workbench/controls';
import { bpe, mvr, solveEvaporator, SOLUTES, tsatWater } from '@/engine/evaporation';
import { fmt } from '@/lib/utils';

const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };

function TempTip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as { name: string; T: number; Tsat?: number } | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2 py-1 font-mono text-[10px] text-plant-200">
      <p className="text-plant-100">{p.name}</p>
      <p>T = {fmt(p.T, 1)} °C{p.Tsat !== undefined ? ` · vapour T_sat ${fmt(p.Tsat, 1)} °C` : ''}</p>
    </div>
  );
}

export default function EvaporationPage() {
  const [soluteId, setSoluteId] = useState('sucrose');
  const [F, setF] = useState(10000);
  const [wF, setWF] = useState(0.1);
  const [wP, setWP] = useState(0.5);
  const [TF, setTF] = useState(60);
  const [Ps, setPs] = useState(3);
  const [Plast, setPlast] = useState(0.15);
  const [N, setN] = useState(3);
  const [U1, setU1] = useState(3000);
  const [drop, setDrop] = useState(0.15);
  const [lift, setLift] = useState(8);
  const [eta, setEta] = useState(0.75);
  const solute = SOLUTES.find((s) => s.id === soluteId)!;
  const Ulist = (n: number) => Array.from({ length: n }, (_, i) => U1 * (1 - drop) ** i);
  const spec = (n: number) => ({ solute, F, wF, wP, TF, Ps, Plast, U: Ulist(n) });

  const r = useMemo(() => solveEvaporator(spec(N)), [solute, F, wF, wP, TF, Ps, Plast, N, U1, drop]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6].map((n) => {
        const s = solveEvaporator(spec(n));
        return { n: `${n}`, economy: s.ok ? s.economy : 0, area: s.ok ? s.A * n : 0, ok: s.ok };
      }),
    [solute, F, wF, wP, TF, Ps, Plast, U1, drop], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // MVR alternative: one effect at the last-effect pressure; the compressor must also overcome the product BPE
  const Tlast = tsatWater(Plast);
  const bpeP = bpe(solute, wP);
  const comp = mvr({ V: r.V, T1: Tlast, lift: lift + bpeP, eta });
  const steamKW = r.ok ? (r.S * 2163) / 3600 : NaN;
  const temps = r.ok ? [{ name: 'Steam', T: r.Ts }, ...r.effects.map((e, i) => ({ name: `Effect ${i + 1}`, T: e.T, Tsat: e.Tsat }))] : [];

  return (
    <div className="space-y-2">
      <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <Panel title="Evaporation">
            <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
              Concentrate a solution by boiling off water. Each extra effect reuses the vapour of the one before as its heating
              steam — fewer kilograms of steam per kilogram evaporated, more heating surface.
            </p>
            <Field label="Solution">
              <Select value={soluteId} options={SOLUTES.map((s) => ({ id: s.id, label: s.name }))} onChange={setSoluteId} ariaLabel="Solute" />
            </Field>
          </Panel>
          <Panel title="Feed & product">
            <div className="space-y-3">
              <ParamSlider label="Feed" symbol="F" unit="kg/h" min={1000} max={50000} step={100} digits={0} value={F} onChange={setF} />
              <ParamSlider label="Feed solids" symbol="w_F" min={0.01} max={0.4} step={0.005} digits={3} value={wF} onChange={setWF} />
              <ParamSlider label="Product solids" symbol="w_P" min={0.05} max={0.7} step={0.005} digits={3} value={wP} onChange={setWP} />
              <ParamSlider label="Feed temperature" symbol="T_F" unit="°C" min={10} max={100} step={1} digits={0} value={TF} onChange={setTF} />
            </div>
          </Panel>
          <Panel title="Plant">
            <div className="space-y-3">
              <ParamSlider label="Effects" symbol="N" min={1} max={6} step={1} digits={0} value={N} onChange={(v) => setN(Math.round(v))} />
              <ParamSlider label="Heating steam" symbol="p_s" unit="bar" min={1.1} max={8} step={0.1} value={Ps} onChange={setPs} />
              <ParamSlider label="Last effect" symbol="p_N" unit="bar" min={0.07} max={1} step={0.01} digits={2} value={Plast} onChange={setPlast} />
              <ParamSlider label="U, first effect" symbol="U₁" unit="W/m²K" min={500} max={4000} step={50} digits={0} value={U1} onChange={setU1} />
              <ParamSlider label="U falls per effect" symbol="ΔU" unit="%" min={0} max={30} step={1} digits={0} value={drop * 100} onChange={(v) => setDrop(v / 100)} />
            </div>
          </Panel>
          <Panel title="MVR alternative">
            <div className="space-y-3">
              <ParamSlider label="Temperature lift" symbol="ΔT" unit="K" min={3} max={20} step={0.5} value={lift} onChange={setLift} />
              <ParamSlider label="Compressor efficiency" symbol="η" min={0.5} max={0.9} step={0.01} digits={2} value={eta} onChange={setEta} />
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
            <Kpi label="Evaporation" value={fmt(r.V, 0)} unit="kg/h" sub={`product ${fmt(r.P, 0)} kg/h`} />
            <Kpi label="Steam" value={r.ok ? fmt(r.S, 0) : '—'} unit="kg/h" sub={`at ${fmt(r.Ts, 1)} °C`} />
            <Kpi label="Steam economy" value={r.ok ? fmt(r.economy, 2) : '—'} sub="kg water / kg steam" />
            <Kpi label="Area per effect" value={r.ok ? fmt(r.A, 1) : '—'} unit="m²" sub={`total ${r.ok ? fmt(r.A * N, 0) : '—'} m²`} />
            <Kpi label="BPE, product" value={fmt(bpeP, 2)} unit="K" sub="dilute estimate" />
            <Kpi label="Last effect" value={fmt(tsatWater(Plast), 1)} unit="°C" sub={`${fmt(Plast, 2)} bar`} />
            <Kpi label="MVR power" value={fmt(comp.power, 0)} unit="kW" sub={`${fmt(comp.specific, 1)} kWh/t · COP ${fmt(comp.COP, 0)}`} />
            <Kpi label="Steam heat" value={r.ok ? fmt(steamKW, 0) : '—'} unit="kW" sub="thermal, this design" />
          </div>
          {r.error && <Notice tone="error">{r.error}</Notice>}
          {bpeP > 3 && <Notice tone="info">High boiling-point elevation ({fmt(bpeP, 1)} K) — each effect loses that much driving force; the dilute estimate becomes rough above ~2 mol/kg.</Notice>}

          <div className="grid gap-2 lg:grid-cols-2">
            <Panel title="Temperature cascade">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={temps} margin={{ top: 10, right: 40, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis dataKey="name" tick={axisTick} stroke={VIZ.axis} tickLine={false} />
                  <YAxis tick={axisTick} stroke={VIZ.axis} tickLine={false} width={54} domain={[(d: number) => Math.floor((d - 5) / 10) * 10, (d: number) => Math.ceil((d + 5) / 10) * 10]} tickFormatter={(v: number) => v.toFixed(0)}>
                    <Label value="T [°C]" angle={-90} position="insideLeft" offset={0} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  <Line dataKey="T" stroke={VIZ.dew} strokeWidth={2} isAnimationActive={false} dot={{ r: 4, fill: VIZ.dew, stroke: VIZ.surface, strokeWidth: 2 }} />
                  <Tooltip content={<TempTip />} cursor={{ stroke: VIZ.textFaint }} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-plant-500">Boiling temperature in each effect; the vapour leaves at its saturation temperature (lower by the BPE) and heats the next effect.</p>
            </Panel>
            <Panel title="Steam economy vs number of effects">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={series} margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} vertical={false} />
                  <XAxis dataKey="n" tick={axisTick} stroke={VIZ.axis} tickLine={false}>
                    <Label value="effects" position="bottom" offset={2} style={lbl} />
                  </XAxis>
                  <YAxis tick={axisTick} stroke={VIZ.axis} tickLine={false} width={54} tickFormatter={(v: number) => v.toFixed(1)}>
                    <Label value="kg water / kg steam" angle={-90} position="insideLeft" offset={0} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  <Bar dataKey="economy" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {series.map((s) => (
                      <Cell key={s.n} fill={Number(s.n) === N ? VIZ.equilibrium : VIZ.diagonal} />
                    ))}
                  </Bar>
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.06)' }} contentStyle={{ background: 'rgb(var(--plant-950))', border: '1px solid rgb(var(--white)/0.1)', fontSize: 10 }} formatter={(v: number) => fmt(v, 2)} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-plant-500">Each effect adds a little less economy (≈ N·0.8) while the total area grows — the economic optimum balances steam against surface. MVR: {fmt(comp.specific, 1)} kWh of electricity per tonne evaporated.</p>
            </Panel>
          </div>

          {r.ok && (
            <Panel title="Effects">
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-plant-500">
                    {['Effect', 'p [bar]', 'T [°C]', 'BPE [K]', 'ΔT [K]', 'V [kg/h]', 'w out', 'Q [kW]', 'A [m²]'].map((h) => (
                      <th key={h} className="py-1 text-right font-medium first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.effects.map((e, i) => (
                    <tr key={i} className="border-t border-white/[0.03] text-right text-plant-100">
                      <td className="py-0.5 text-left text-plant-200">{i + 1}</td>
                      <td>{fmt(e.P, 3)}</td>
                      <td>{fmt(e.T, 1)}</td>
                      <td>{fmt(e.bpe, 2)}</td>
                      <td>{fmt(e.dT, 1)}</td>
                      <td>{fmt(e.V, 0)}</td>
                      <td>{fmt(e.w, 3)}</td>
                      <td>{fmt(e.Q, 0)}</td>
                      <td>{fmt(e.A, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </div>
      <EquipmentPanel topic="evaporation" />
    </div>
  );
}
