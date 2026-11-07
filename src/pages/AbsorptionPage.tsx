import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Label, Line, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { Field, Kpi, Notice, Panel, Select } from '@/components/workbench/controls';
import { equilibrium, GASES, henry, solveAbsorber, solveStripper } from '@/engine/absorption';
import { linspace } from '@/engine/numerics';
import { fmt } from '@/lib/utils';

type Mode = 'absorb' | 'strip';
const fs = (v: number) => (!Number.isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) >= 0.01 ? v.toFixed(3) : v.toExponential(2));
const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const mono = { ...lbl, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };
const line = { dot: false, isAnimationActive: false, dataKey: 'y', type: 'linear' as const, activeDot: false };

export default function AbsorptionPage({ params }: { params: URLSearchParams }) {
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'strip' ? 'strip' : 'absorb');
  const [gasId, setGasId] = useState(mode === 'strip' ? 'benzene' : 'nh3');
  const [T, setT] = useState(25);
  const [P, setP] = useState(mode === 'strip' ? 1 : 1);
  const [yIn, setYIn] = useState(0.05);
  const [xIn, setXIn] = useState(2e-5);
  const [xLean, setXLean] = useState(0);
  const [rec, setRec] = useState(0.98);
  const [factor, setFactor] = useState(1.5);
  const [HTU, setHTU] = useState(0.6);

  const gas = GASES.find((g) => g.id === gasId)!;
  const H = henry(gas, T);
  const m = H / P;
  const switchMode = (md: Mode) => {
    setMode(md);
    setGasId(md === 'strip' ? 'benzene' : 'nh3');
  };

  const r = useMemo(
    () => (mode === 'absorb' ? solveAbsorber({ m, yIn, recovery: rec, xIn: xLean, factor }) : solveStripper({ m, xIn, recovery: rec, yIn: 0, factor })),
    [mode, m, yIn, xIn, xLean, rec, factor],
  );
  const eq = equilibrium(m);

  const chart = useMemo(() => {
    if (!r.ok) return null;
    const Xhi = Math.max(r.Xout, r.Xin) * 1.15;
    const Yhi = Math.max(r.Yin, r.Yout) * 1.15;
    const curve = linspace(0, Math.min(Xhi, eq.Xcap), 160).map((x) => ({ x, y: eq.Ystar(x) }));
    const op =
      mode === 'absorb'
        ? [{ x: r.Xin, y: r.Yout }, { x: r.Xout, y: r.Yin }]
        : [{ x: r.Xout, y: r.Yin }, { x: r.Xin, y: r.Yout }];
    const opMin =
      mode === 'absorb'
        ? [{ x: r.Xin, y: r.Yout }, { x: r.Xin + (r.Yin - r.Yout) / r.LGmin, y: r.Yin }]
        : [{ x: r.Xout, y: r.Yin }, { x: r.Xin, y: r.Yin + r.LGmin * (r.Xin - r.Xout) }];
    const stair: { x: number; y: number }[] = [];
    if (mode === 'absorb') {
      stair.push({ x: r.Xin, y: r.Yout });
      r.stages.forEach((s, i) => {
        stair.push({ x: s.X, y: s.Y });
        if (i < r.stages.length - 1) stair.push({ x: s.X, y: r.Yout + r.LG * (s.X - r.Xin) });
      });
    } else {
      stair.push({ x: r.Xout, y: r.Yin });
      r.stages.forEach((s, i) => {
        stair.push({ x: s.X, y: s.Y });
        if (i < r.stages.length - 1) stair.push({ x: r.Xout + (s.Y - r.Yin) / r.LG, y: s.Y });
      });
    }
    return { Xhi, Yhi, curve, op, opMin, stair };
  }, [r, eq, mode]);

  const ratioLabel = mode === 'absorb' ? 'L/G' : 'G/L';
  const ratio: number = mode === 'absorb' ? r.LG : 'GL' in r ? (r.GL as number) : NaN;
  const ratioMin: number = mode === 'absorb' ? r.LGmin : 'GLmin' in r ? (r.GLmin as number) : NaN;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <Panel title="Absorption & stripping">
            <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
              Counter-current gas–liquid columns with Henry&apos;s-law equilibrium. Absorption washes a component out of a gas;
              stripping drives it out of a liquid with gas or steam.
            </p>
            <div className="space-y-3">
              <Segmented<Mode> value={mode} onChange={switchMode} options={[{ value: 'absorb', label: 'Absorber' }, { value: 'strip', label: 'Stripper' }]} />
              <Field label="Solute / system">
                <Select value={gasId} options={GASES.map((g) => ({ id: g.id, label: g.name }))} onChange={setGasId} ariaLabel="Solute" />
              </Field>
              <p className="font-mono text-[9px] text-plant-500">
                H(25 °C) = {fmt(gas.H298, gas.H298 < 10 ? 2 : 0)} bar · Sander compilation, dilute aqueous solution, physical solubility
              </p>
            </div>
          </Panel>
          <Panel title="Operating point">
            <div className="space-y-3">
              <ParamSlider label="Temperature" symbol="T" unit="°C" min={5} max={80} step={0.5} value={T} onChange={setT} />
              <ParamSlider label="Pressure" symbol="P" unit="bar" min={0.5} max={30} step={0.1} value={P} onChange={setP} />
              {mode === 'absorb' ? (
                <>
                  <ParamSlider label="Gas in" symbol="y_in" min={0.001} max={0.2} step={0.001} digits={3} value={yIn} onChange={setYIn} />
                  <ParamSlider label="Lean solvent" symbol="x_in" min={0} max={0.005} step={0.0001} digits={4} value={xLean} onChange={setXLean} />
                </>
              ) : (
                <ParamSlider label="Liquid in (mole fr.)" symbol="x_in" min={1e-6} max={2e-4} step={1e-6} digits={6} value={xIn} onChange={setXIn} />
              )}
              <ParamSlider label={mode === 'absorb' ? 'Absorbed fraction' : 'Stripped fraction'} symbol="φ" min={0.5} max={0.999} step={0.001} digits={3} value={rec} onChange={setRec} />
              <ParamSlider label={`${ratioLabel} ÷ minimum`} symbol="f" min={1.02} max={4} step={0.01} digits={2} value={factor} onChange={setFactor} />
              <ParamSlider label="Height of a transfer unit" symbol="HTU" unit="m" min={0.2} max={2} step={0.05} digits={2} value={HTU} onChange={setHTU} />
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
            <Kpi label="m = H/P" value={fmt(m, m < 10 ? 3 : 1)} sub={`H = ${fmt(H, H < 10 ? 2 : 0)} bar`} />
            <Kpi label="Stages N" value={r.ok ? fmt(r.N, 2) : '—'} tone={r.ok ? 'default' : 'muted'} sub="stepped off" />
            <Kpi label="Kremser N" value={r.ok ? fmt(r.Nkremser, 2) : '—'} sub="dilute, straight lines" />
            <Kpi label={ratioLabel} value={r.ok ? fs(ratio) : '—'} sub={`min ${fs(ratioMin)}`} />
            <Kpi label={mode === 'absorb' ? 'Absorption factor A' : 'Stripping factor S'} value={r.ok ? fmt(mode === 'absorb' ? r.A : 1 / r.A, 2) : '—'} sub={mode === 'absorb' ? 'A = L/(mG)' : 'S = mG/L'} />
            <Kpi label={mode === 'absorb' ? 'NTU_OG' : 'NTU_OL'} value={r.ok ? fmt(r.NTU, 2) : '—'} sub="packed column" />
            <Kpi label="Packed height" value={r.ok ? fmt(r.NTU * HTU, 2) : '—'} unit="m" sub="Z = HTU · NTU" />
            <Kpi label={mode === 'absorb' ? 'Loaded liquid X_out' : 'Gas out Y_out'} value={r.ok ? fs(mode === 'absorb' ? r.Xout : r.Yout) : '—'} sub="mole ratio" />
          </div>
          {r.error && <Notice tone="error">{r.error}</Notice>}
          {mode === 'absorb' && m > 50 && r.ok && (
            <Notice tone="info">This gas is poorly soluble (m = {fmt(m, 0)}): the solvent rate is huge. Raise the pressure, cool the solvent, or use a chemical solvent (amines for CO₂).</Notice>
          )}

          <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel title="Loading diagram (mole ratios)">
              <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Equilibrium Y*(X)</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />Operating line</li>
                <li className="flex items-center gap-1.5">
                  <svg width="16" height="4" aria-hidden><line x1="1" y1="2" x2="15" y2="2" stroke={VIZ.operating} strokeWidth="1.3" strokeDasharray="4 3" /></svg>
                  Minimum {ratioLabel}
                </li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.steps }} />Stages</li>
              </ul>
              {chart ? (
                <ResponsiveContainer width="100%" height={460}>
                  <ComposedChart margin={{ top: 12, right: 20, bottom: 26, left: 6 }}>
                    <CartesianGrid stroke={VIZ.grid} />
                    <XAxis type="number" dataKey="x" domain={[0, chart.Xhi]} ticks={linspace(0, chart.Xhi, 6)} tickFormatter={fs} tick={axisTick} stroke={VIZ.axis} tickLine={false} allowDataOverflow>
                      <Label value="liquid loading X (mol solute / mol solvent)" position="bottom" offset={8} style={lbl} />
                    </XAxis>
                    <YAxis type="number" dataKey="y" domain={[0, chart.Yhi]} ticks={linspace(0, chart.Yhi, 6)} tickFormatter={fs} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={62} allowDataOverflow>
                      <Label value="gas loading Y (mol solute / mol inert)" angle={-90} position="insideLeft" offset={0} style={{ ...lbl, textAnchor: 'middle' }} />
                    </YAxis>
                    <Line {...line} data={chart.curve} stroke={VIZ.equilibrium} strokeWidth={2} />
                    <Line {...line} data={chart.opMin} stroke={VIZ.operating} strokeWidth={1.3} strokeDasharray="5 4" />
                    <Line {...line} data={chart.op} stroke={VIZ.operating} strokeWidth={2} />
                    <Line {...line} data={chart.stair} stroke={VIZ.steps} strokeWidth={1.3} />
                    <ReferenceDot x={chart.op[0]!.x} y={chart.op[0]!.y} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                      <Label value={mode === 'absorb' ? 'top' : 'bottom'} position="insideTopLeft" offset={10} style={mono} />
                    </ReferenceDot>
                    <ReferenceDot x={chart.op[1]!.x} y={chart.op[1]!.y} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                      <Label value={mode === 'absorb' ? 'bottom' : 'top'} position="top" offset={8} style={mono} />
                    </ReferenceDot>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-[11px] text-plant-500">No column for these settings.</p>
              )}
            </Panel>
            <Panel title="How it works">
              <div className="space-y-2 text-[11px] leading-relaxed text-plant-300">
                <p>Henry&apos;s law y = m·x with m = H(T)/P: cold and high pressure favour absorption, hot and low pressure favour stripping.</p>
                <p className="rounded border border-white/[0.06] bg-plant-950/60 py-2 text-center font-mono text-plant-100">
                  {mode === 'absorb' ? 'Y = Y_out + (L/G)(X − X_in)' : 'Y = Y_in + (L/G)(X − X_out)'}
                </p>
                <p>
                  {mode === 'absorb'
                    ? 'The absorber’s operating line lies above the equilibrium curve. At the minimum L/G it touches the curve at the rich (bottom) end — infinitely many stages. A = L/(mG) between 1.2 and 2 is the usual design range.'
                    : 'The stripper’s operating line lies below the curve. The stripping factor S = mG/L must exceed 1; volatile solutes (large m) strip easily with little gas.'}
                </p>
                <p>Kremser gives the stage count for straight lines; the stepped count uses the exact loading equilibrium. A packed column needs NTU transfer units of height HTU each.</p>
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <EquipmentPanel topic="absorption" />
    </div>
  );
}
