import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Label, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { Field, Kpi, Panel, Select } from '@/components/workbench/controls';
import { crystallizationYield, msmpr, SALTS, solubility } from '@/engine/crystallization';
import { linspace } from '@/engine/numerics';
import { fmt } from '@/lib/utils';

const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const mono = { ...lbl, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };

export default function CrystallizationPage() {
  const [saltId, setSaltId] = useState('kno3');
  const [F, setF] = useState(1000);
  const [T1, setT1] = useState(60);
  const [Tsat, setTsat] = useState(60);
  const [T2, setT2] = useState(20);
  const [e, setE] = useState(0);
  const [G, setG] = useState(1);
  const [tau, setTau] = useState(60);
  const [MT, setMT] = useState(150);
  const [shape, setShape] = useState<'cube' | 'sphere'>('cube');
  const salt = SALTS.find((s) => s.id === saltId)!;
  const c0 = solubility(salt, Math.min(Tsat, T1));
  const y = useMemo(() => crystallizationYield({ salt, F, c0, T1, T2, e }), [salt, F, c0, T1, T2, e]);
  const csd = useMemo(() => msmpr({ G, tau, MT, rho: salt.rho, kv: shape === 'cube' ? 1 : Math.PI / 6 }), [G, tau, MT, salt, shape]);

  const curve = useMemo(() => linspace(0, 100, 101).map((T) => ({ x: T, y: solubility(salt, T) })), [salt]);
  const cAfterEvap = c0 / (1 - e);
  const path = [
    { x: T1, y: c0 },
    { x: T2, y: cAfterEvap },
    { x: T2, y: Math.min(cAfterEvap, y.c2) },
  ];
  const Lmax = 8 * csd.Gt * 1e6; // µm
  const dist = linspace(0, Lmax, 120).map((L) => ({ L, mass: (csd.mass(L * 1e-6) * csd.Gt) / MT, under: csd.undersize(L * 1e-6) * 100 }));

  return (
    <div className="space-y-2">
      <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <Panel title="Crystallization">
            <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
              Solid–liquid separation from solution: cool or evaporate past the solubility curve and the excess solute
              crystallizes. A steep curve favours cooling, a flat one needs evaporation.
            </p>
            <Field label="Solute (in water)">
              <Select value={saltId} options={SALTS.map((s) => ({ id: s.id, label: s.name }))} onChange={setSaltId} ariaLabel="Solute" />
            </Field>
            <p className="mt-2 font-mono text-[9px] text-plant-500">Solubility: CRC Handbook, anhydrous solute, 0–100 °C.</p>
          </Panel>
          <Panel title="Yield">
            <div className="space-y-3">
              <ParamSlider label="Feed solution" symbol="F" unit="kg" min={100} max={10000} step={50} digits={0} value={F} onChange={setF} />
              <ParamSlider label="Feed temperature" symbol="T₁" unit="°C" min={10} max={100} step={1} digits={0} value={T1} onChange={setT1} />
              <ParamSlider label="Feed saturated at" symbol="T_sat" unit="°C" min={0} max={100} step={1} digits={0} value={Math.min(Tsat, T1)} onChange={setTsat} />
              <ParamSlider label="Final temperature" symbol="T₂" unit="°C" min={0} max={100} step={1} digits={0} value={T2} onChange={setT2} />
              <ParamSlider label="Water evaporated" symbol="e" unit="%" min={0} max={90} step={1} digits={0} value={e * 100} onChange={(v) => setE(v / 100)} />
            </div>
          </Panel>
          <Panel title="MSMPR crystallizer">
            <div className="space-y-3">
              <ParamSlider label="Growth rate" symbol="G" unit="µm/min" min={0.1} max={5} step={0.05} digits={2} value={G} onChange={setG} />
              <ParamSlider label="Residence time" symbol="τ" unit="min" min={10} max={240} step={5} digits={0} value={tau} onChange={setTau} />
              <ParamSlider label="Magma density" symbol="M_T" unit="kg/m³" min={20} max={400} step={5} digits={0} value={MT} onChange={setMT} />
              <Segmented value={shape} onChange={setShape} options={[{ value: 'cube', label: 'Cubes (k_v = 1)' }, { value: 'sphere', label: 'Spheres (π/6)' }]} />
            </div>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
            <Kpi label="Crystals" value={fmt(y.crystals, 1)} unit="kg" sub={`of ${fmt(y.solute, 1)} kg solute`} />
            <Kpi label="Yield" value={fmt(y.yield * 100, 1)} unit="%" sub="anhydrous" />
            <Kpi label="c* at T₂" value={fmt(y.c2 * 100, 1)} unit="g/100 g" sub="mother liquor saturated" />
            <Kpi label="Cooling duty" value={fmt(y.coolDuty, 1)} unit="MJ" sub="incl. heat of crystallization" />
            <Kpi label="Evaporation duty" value={fmt(y.evapDuty, 1)} unit="MJ" sub={`${fmt(y.W0 * e, 0)} kg water`} />
            <Kpi label="Dominant size" value={fmt(csd.LD * 1e6, 0)} unit="µm" sub="L_D = 3Gτ" />
            <Kpi label="Mass-mean size" value={fmt(csd.L43 * 1e6, 0)} unit="µm" sub="L₄,₃ = 4Gτ" />
            <Kpi label="Nucleation B⁰" value={csd.B0.toExponential(2)} sub="#/(m³·s)" />
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <Panel title={`Solubility of ${salt.name}`}>
              <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Solubility c*(T)</li>
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />Process path</li>
              </ul>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart margin={{ top: 12, right: 20, bottom: 24, left: 4 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
                    <Label value="T [°C]" position="bottom" offset={6} style={lbl} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" tick={axisTick} stroke={VIZ.axis} tickLine={false} width={44} tickFormatter={(v: number) => (v * 100).toFixed(0)}>
                    <Label value="g solute / 100 g water" angle={-90} position="insideLeft" offset={6} style={{ ...lbl, textAnchor: 'middle' }} />
                  </YAxis>
                  <Line data={curve} dataKey="y" stroke={VIZ.equilibrium} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line data={path} dataKey="y" stroke={VIZ.operating} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={path[0]!.x} y={path[0]!.y} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="feed" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <ReferenceDot x={path[2]!.x} y={path[2]!.y} r={4} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={2}>
                    <Label value="mother liquor" position="right" offset={8} style={mono} />
                  </ReferenceDot>
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] leading-relaxed text-plant-500">
                Cool (and/or evaporate) from the feed to T₂; the vertical drop to the curve is what crystallizes.
                Supersaturation at T₂ before crystallization: S = {fmt(y.S, 2)}.
              </p>
            </Panel>
            <Panel title="Crystal size distribution (MSMPR)">
              <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Mass density (normalised)</li>
              </ul>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dist} margin={{ top: 8, right: 16, bottom: 20, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="L" domain={[0, Lmax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)}>
                    <Label value="crystal size L [µm]" position="bottom" offset={4} style={lbl} />
                  </XAxis>
                  <YAxis tick={axisTick} stroke={VIZ.axis} tickLine={false} width={40} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Line dataKey="mass" stroke={VIZ.equilibrium} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceDot x={csd.LD * 1e6} y={(csd.mass(csd.LD) * csd.Gt) / MT} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                    <Label value="L_D" position="top" offset={8} style={mono} />
                  </ReferenceDot>
                  <Tooltip contentStyle={{ background: '#06090d', border: '1px solid rgba(255,255,255,0.1)', fontSize: 10 }} formatter={(v: number) => fmt(v, 3)} labelFormatter={(l: number) => `L = ${fmt(l, 0)} µm`} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mb-1 mt-2 text-[10px] text-plant-300">Cumulative mass undersize</p>
              <ResponsiveContainer width="100%" height={150}>
                <ComposedChart data={dist} margin={{ top: 4, right: 16, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke={VIZ.grid} />
                  <XAxis type="number" dataKey="L" domain={[0, Lmax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                  <Line dataKey="under" stroke={VIZ.qLine} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] leading-relaxed text-plant-500">
                n(L) = n₀·exp(−L/Gτ) with n₀ = {csd.n0.toExponential(2)} #/m⁴. Longer residence or slower nucleation gives larger crystals; the
                coefficient of variation of an MSMPR product is always ≈ 50 % — narrower distributions need fines destruction (DTB).
              </p>
            </Panel>
          </div>
        </div>
      </div>
      <EquipmentPanel topic="crystallization" />
    </div>
  );
}
