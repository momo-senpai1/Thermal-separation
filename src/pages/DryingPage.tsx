import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Label, Line, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { ParamSlider } from '@/components/ParamSlider';
import { Kpi, Notice, Panel } from '@/components/workbench/controls';
import { airState, batchDrying, continuousDryer, humidity, psat } from '@/engine/drying';
import { linspace } from '@/engine/numerics';
import { fmt } from '@/lib/utils';

const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const mono = { ...lbl, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };
const line = { dot: false, isAnimationActive: false, type: 'linear' as const, activeDot: false };

export default function DryingPage() {
  // batch dryer
  const [T, setT] = useState(70);
  const [RH, setRH] = useState(0.05);
  const [h, setH] = useState(30);
  const [load, setLoad] = useState(20);
  const [X1, setX1] = useState(0.6);
  const [Xc, setXc] = useState(0.25);
  const [Xeq, setXeq] = useState(0.03);
  const [X2, setX2] = useState(0.06);
  // continuous dryer
  const [solids, setSolids] = useState(1000);
  const [T0, setT0] = useState(20);
  const [RH0, setRH0] = useState(0.6);
  const [Tin, setTin] = useState(150);
  const [Tout, setTout] = useState(60);

  const b = useMemo(() => batchDrying({ T, RH, h, load, X1, Xc, Xeq, X2: Math.max(X2, Xeq + 1e-3) }), [T, RH, h, load, X1, Xc, Xeq, X2]);
  const c = useMemo(() => continuousDryer({ solids, X1, X2, T0, RH0, Tin, Tout }), [solids, X1, X2, T0, RH0, Tin, Tout]);

  const Tmax = Math.max(Tin, T) + 10;
  const Ymax = Math.min(0.12, Math.max(c.out.Y, b.air.Y, humidity(psat(b.air.Tw))) * 1.6);
  const rhCurves = useMemo(
    () =>
      [0.1, 0.2, 0.4, 0.6, 0.8, 1].map((phi) => ({
        phi,
        pts: linspace(0, Math.min(Tmax, 99), 120).map((t) => ({ x: t, y: humidity(phi * psat(t)) })),
      })),
    [Tmax],
  );
  const curveX = useMemo(() => linspace(0, b.total * 1.15, 150).map((t) => ({ x: t / 3600, y: b.Xat(t) })), [b]);
  const rateX = useMemo(() => linspace(Xeq + 1e-4, X1, 120).map((X) => ({ x: X, y: b.rate(X) * 3600 })), [b, Xeq, X1]);
  const air = airState(T, RH);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <Panel title="Drying">
            <p className="text-[11px] leading-relaxed text-plant-400">
              Remove moisture from a solid with hot air. The air state (psychrometrics) sets the wet-bulb temperature and the
              constant drying rate; the solid&apos;s critical moisture X_c marks where internal diffusion takes over.
            </p>
          </Panel>
          <Panel title="Drying air & solid (batch)">
            <div className="space-y-3">
              <ParamSlider label="Air temperature" symbol="T" unit="°C" min={30} max={120} step={1} digits={0} value={T} onChange={setT} />
              <ParamSlider label="Relative humidity" symbol="φ" unit="%" min={1} max={90} step={1} digits={0} value={RH * 100} onChange={(v) => setRH(v / 100)} />
              <ParamSlider label="Heat-transfer coefficient" symbol="α" unit="W/m²K" min={5} max={100} step={1} digits={0} value={h} onChange={setH} />
              <ParamSlider label="Dry solid per area" symbol="m_s/A" unit="kg/m²" min={2} max={60} step={1} digits={0} value={load} onChange={setLoad} />
              <ParamSlider label="Initial moisture" symbol="X₁" unit="kg/kg" min={0.1} max={2} step={0.01} digits={2} value={X1} onChange={setX1} />
              <ParamSlider label="Critical moisture" symbol="X_c" unit="kg/kg" min={0.05} max={1} step={0.01} digits={2} value={Xc} onChange={setXc} />
              <ParamSlider label="Equilibrium moisture" symbol="X*" unit="kg/kg" min={0} max={0.1} step={0.005} digits={3} value={Xeq} onChange={setXeq} />
              <ParamSlider label="Final moisture" symbol="X₂" unit="kg/kg" min={0.01} max={0.5} step={0.005} digits={3} value={X2} onChange={setX2} />
            </div>
          </Panel>
          <Panel title="Continuous adiabatic dryer">
            <div className="space-y-3">
              <ParamSlider label="Dry solids" symbol="ṁ_s" unit="kg/h" min={100} max={10000} step={50} digits={0} value={solids} onChange={setSolids} />
              <ParamSlider label="Ambient air" symbol="T₀" unit="°C" min={0} max={40} step={1} digits={0} value={T0} onChange={setT0} />
              <ParamSlider label="Ambient humidity" symbol="φ₀" unit="%" min={5} max={95} step={1} digits={0} value={RH0 * 100} onChange={(v) => setRH0(v / 100)} />
              <ParamSlider label="Air into dryer" symbol="T_in" unit="°C" min={60} max={250} step={1} digits={0} value={Tin} onChange={setTin} />
              <ParamSlider label="Air out of dryer" symbol="T_out" unit="°C" min={30} max={120} step={1} digits={0} value={Tout} onChange={setTout} />
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
            <Kpi label="Wet bulb T_w" value={fmt(air.Tw, 1)} unit="°C" sub={`dew point ${fmt(air.Tdew, 1)} °C`} />
            <Kpi label="Humidity Y" value={fmt(air.Y * 1000, 2)} unit="g/kg" sub={`h = ${fmt(air.h, 1)} kJ/kg`} />
            <Kpi label="Constant rate R_c" value={fmt(b.Rc * 3600, 3)} unit="kg/m²h" sub="α(T − T_w)/λ" />
            <Kpi label="Constant-rate time" value={fmt(b.tI / 3600, 2)} unit="h" sub="X₁ → X_c" />
            <Kpi label="Falling-rate time" value={fmt(b.tII / 3600, 2)} unit="h" sub="X_c → X₂" />
            <Kpi label="Total drying time" value={fmt(b.total / 3600, 2)} unit="h" />
            <Kpi label="Air (continuous)" value={fmt(c.air, 0)} unit="kg/h" sub={`water ${fmt(c.water, 0)} kg/h`} />
            <Kpi label="Heater / efficiency" value={fmt(c.heat, 0)} unit="kW" sub={`η = ${fmt(c.efficiency * 100, 0)} %`} />
          </div>
          {!b.ok && <Notice tone="error">Check the moistures: X₁ &gt; X₂ &gt; X* and X_c &gt; X* are needed.</Notice>}
          {c.saturated && <Notice tone="warning">The outlet air would be saturated — raise T_out or the inlet temperature.</Notice>}

          <div className="grid gap-2 lg:grid-cols-2">
            <Panel title="Drying curve">
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="x" domain={[0, (b.total * 1.15) / 3600]} tick={axisTick} stroke={VIZ.axis} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)}>
                    <Label value="time [h]" position="bottom" offset={4} style={lbl} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[0, X1 * 1.05]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={54} tickFormatter={(v: number) => v.toFixed(2)}>
                    <Label value="X [kg/kg]" angle={-90} position="insideLeft" offset={8} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  <Line {...line} data={curveX} dataKey="y" stroke={VIZ.equilibrium} strokeWidth={2} />
                  <Line {...line} data={[{ x: 0, y: Xc }, { x: (b.total * 1.15) / 3600, y: Xc }]} dataKey="y" stroke={VIZ.textFaint} strokeDasharray="4 3" strokeWidth={1} />
                  <ReferenceDot x={b.tI / 3600} y={Xc} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="X_c" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <ReferenceDot x={b.total / 3600} y={Math.max(X2, Xeq)} r={4} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={2}>
                    <Label value="X₂" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mb-1 mt-2 text-[10px] text-plant-300">Drying rate vs moisture</p>
              <ResponsiveContainer width="100%" height={170}>
                <ComposedChart margin={{ top: 6, right: 16, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="x" domain={[0, X1]} tick={axisTick} stroke={VIZ.axis} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)}>
                    <Label value="X [kg/kg]" position="bottom" offset={4} style={lbl} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[0, b.Rc * 3600 * 1.2]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={54} tickFormatter={(v: number) => v.toFixed(2)}>
                    <Label value="R [kg/m²h]" angle={-90} position="insideLeft" offset={8} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  <Line {...line} data={rateX} dataKey="y" stroke={VIZ.operating} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Psychrometric chart (1.013 bar)">
              <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Saturation (φ = 100 %)</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.diagonal }} />φ = 10 … 80 %</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />Continuous dryer: heat, then dry</li>
                <li className="flex items-center gap-1.5">
                  <svg width="16" height="4" aria-hidden><line x1="1" y1="2" x2="15" y2="2" stroke={VIZ.qLine} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                  Batch air → wet bulb
                </li>
              </ul>
              <ResponsiveContainer width="100%" height={430}>
                <ComposedChart margin={{ top: 10, right: 16, bottom: 22, left: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="x" domain={[0, Tmax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} allowDataOverflow>
                    <Label value="dry-bulb temperature [°C]" position="bottom" offset={6} style={lbl} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[0, Ymax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={48} allowDataOverflow tickFormatter={(v: number) => (v * 1000).toFixed(0)}>
                    <Label value="humidity Y [g/kg dry air]" angle={-90} position="insideLeft" offset={4} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  {rhCurves.map((r) => (
                    <Line key={r.phi} {...line} data={r.pts} dataKey="y" stroke={r.phi === 1 ? VIZ.equilibrium : VIZ.diagonal} strokeWidth={r.phi === 1 ? 2 : 1} />
                  ))}
                  <Line {...line} data={[{ x: c.amb.T, y: c.amb.Y }, { x: c.hot.T, y: c.hot.Y }, { x: c.out.T, y: c.out.Y }]} dataKey="y" stroke={VIZ.operating} strokeWidth={2} />
                  <Line {...line} data={[{ x: air.T, y: air.Y }, { x: air.Tw, y: humidity(psat(air.Tw)) }]} dataKey="y" stroke={VIZ.qLine} strokeWidth={1.5} strokeDasharray="4 3" />
                  <ReferenceDot x={c.amb.T} y={c.amb.Y} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="ambient" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <ReferenceDot x={c.hot.T} y={c.hot.Y} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="heated" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <ReferenceDot x={c.out.T} y={c.out.Y} r={4} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={2}>
                    <Label value="outlet" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <ReferenceDot x={air.Tw} y={humidity(psat(air.Tw))} r={4} fill={VIZ.qLine} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="T_w" position="left" offset={8} style={mono} />
                  </ReferenceDot>
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] leading-relaxed text-plant-500">
                The heater raises T at constant Y; in an adiabatic dryer the air then cools along its adiabatic-saturation line
                while it picks up water. Outlet: {fmt(c.out.T, 0)} °C, φ = {fmt(c.out.RH * 100, 0)} %, Y = {fmt(c.out.Y * 1000, 1)} g/kg.
              </p>
            </Panel>
          </div>
        </div>
      </div>
      <EquipmentPanel topic="drying" />
    </div>
  );
}
