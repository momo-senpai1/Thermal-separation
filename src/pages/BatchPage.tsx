import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { ParamSlider } from '@/components/ParamSlider';
import { Slider } from '@/components/ui/slider';
import { Field, Kpi, Notice, Panel, Select } from '@/components/workbench/controls';
import { batchAt, batchStaircase, simulateBatch, type BatchMode, type BatchPoint } from '@/engine/batch';
import { linspace } from '@/engine/numerics';
import { getSystem, SYSTEM_OPTIONS, type SystemId } from '@/engine/vle/systems';
import { num } from '@/lib/route';
import { cn, fmt } from '@/lib/utils';

const MODES: { id: BatchMode; label: string; hint: string }[] = [
  { id: 'rayleigh', label: 'Open distillation (Rayleigh)', hint: 'The still is the only stage; vapour is condensed as it forms.' },
  { id: 'constant-reflux', label: 'Batch rectification · v = const.', hint: 'Column on the still at fixed reflux — the distillate gets leaner.' },
  { id: 'constant-purity', label: 'Batch rectification · x_D = const.', hint: 'Reflux rises to hold the product purity until it can no longer.' },
];

const DEFAULTS = { system: 'artificial' as SystemId, alpha: 5, mode: 'rayleigh' as BatchMode, x0: 0.5, N: 5, v: 3, xD: 0.95 };
const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const mono = { ...lbl, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };
const line = { dot: false, isAnimationActive: false, type: 'linear' as const, activeDot: false };

function TrajTip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as BatchPoint | undefined;
  if (!active || !p) return null;
  const row = (c: string, k: string, v: number, dash?: boolean) => (
    <p className="flex items-center gap-1.5 text-plant-200">
      <svg width="14" height="4" aria-hidden>
        <line x1="1" y1="2" x2="13" y2="2" stroke={c} strokeWidth="2" strokeDasharray={dash ? '3 2' : undefined} />
      </svg>
      {k} <span className="ml-auto pl-3 text-plant-100">{fmt(v, 4)}</span>
    </p>
  );
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2.5 py-1.5 font-mono text-[10px] leading-4 shadow-glass">
      <p className="text-plant-400">D/L₀ = {fmt(p.d, 3)}</p>
      {row(VIZ.dew, 'still x_W', p.xW)}
      {row(VIZ.equilibrium, 'distillate x_D', p.xD)}
      {row(VIZ.qLine, 'collected x̄_D', p.xDavg, true)}
    </div>
  );
}

export default function BatchPage({ params }: { params: URLSearchParams }) {
  const [s, setS] = useState(() => ({
    ...DEFAULTS,
    alpha: num(params, 'alpha', DEFAULTS.alpha),
    x0: num(params, 'x0', DEFAULTS.x0),
    N: num(params, 'N', DEFAULTS.N),
    v: num(params, 'v', DEFAULTS.v),
    mode: (MODES.map((m) => m.id) as string[]).includes(params.get('mode') ?? '') ? (params.get('mode') as BatchMode) : DEFAULTS.mode,
  }));
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));
  const [d, setD] = useState(() => num(params, 'd', 0));
  const [playing, setPlaying] = useState(false);

  const sys = useMemo(() => getSystem(s.system, s.alpha), [s.system, s.alpha]);
  const sim = useMemo(
    () => simulateBatch({ y: sys.y, x0: s.x0, mode: s.mode, N: s.N, v: s.v, xD: s.xD, xMax: sys.azeotrope ?? 1 }),
    [sys, s],
  );
  const dEnd = sim.ok ? sim.points.at(-1)!.d : 0;
  const dNow = Math.min(d, dEnd);
  const p = sim.ok ? batchAt(sim.points, dNow, s.mode) : null;

  // play: sweep the distilled fraction over ~6 s
  const dRef = useRef(dNow);
  dRef.current = dNow;
  useEffect(() => {
    if (!playing || !sim.ok) return;
    const startD = dRef.current >= dEnd - 1e-9 ? 0 : dRef.current;
    let t0: number | null = null;
    let raf = 0;
    const tick = (t: number) => {
      t0 ??= t;
      const next = startD + ((t - t0) / 6000) * dEnd;
      if (next >= dEnd) {
        setD(dEnd);
        setPlaying(false);
        return;
      }
      setD(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sim, dEnd]);

  const eq = useMemo(() => linspace(0, 1, 201).map((x) => ({ x, y: sys.y(x) })), [sys]);
  const construction = useMemo(() => {
    if (!p) return null;
    if (s.mode === 'rayleigh') {
      const yW = sys.y(p.xW);
      return { path: [{ x: p.xW, y: p.xW }, { x: p.xW, y: yW }, { x: yW, y: yW }], op: null, corners: [{ x: p.xW, y: yW, stage: 1 }] };
    }
    const st = batchStaircase(sys.y, p.xD, p.v, s.N);
    const a = p.v / (p.v + 1);
    const xLow = Math.min(p.xW, st.xW);
    return { path: st.path, op: [{ x: p.xD, y: p.xD }, { x: xLow, y: a * xLow + (1 - a) * p.xD }], corners: st.corners };
  }, [p, s.mode, s.N, sys]);

  const showReflux = s.mode === 'constant-purity' && sim.ok;
  const vCap = showReflux ? Math.min(Math.max(...sim.points.map((q) => q.v)), 40) : 1;

  return (
    <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
        <Panel title="Batch distillation">
          <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
            Charge the still once, boil it off and watch the separation get harder as it goes. Press play or drag the
            batch progress — the whole construction moves with it.
          </p>
          <Field label="Mode">
            <div className="space-y-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.hint}
                  onClick={() => set('mode', m.id)}
                  aria-pressed={s.mode === m.id}
                  className={cn(
                    'w-full rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors',
                    s.mode === m.id
                      ? 'border-signal-liquid/50 bg-signal-liquid/10 text-signal-liquid'
                      : 'border-white/[0.07] text-plant-300 hover:border-white/15 hover:text-plant-100',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
        </Panel>
        <Panel title="Parameters">
          <div className="space-y-3">
            <Field label="VLE system">
              <Select value={s.system} options={SYSTEM_OPTIONS} onChange={(v) => set('system', v)} ariaLabel="VLE system" />
            </Field>
            <ParamSlider label="Relative volatility" symbol="α" min={1.1} max={10} step={0.01} digits={2} value={s.alpha}
              disabled={sys.kind !== 'alpha'} onChange={(v) => set('alpha', v)} />
            <ParamSlider label="Charge" symbol="x₀" min={0.02} max={0.98} step={0.005} digits={3} value={s.x0} onChange={(v) => set('x0', v)} />
            <ParamSlider label="Stages incl. still" symbol="N" min={1} max={30} step={1} digits={0} value={s.N}
              disabled={s.mode === 'rayleigh'} onChange={(v) => set('N', Math.round(v))} />
            <ParamSlider label="Reflux ratio" symbol="v" min={0} max={20} step={0.05} digits={2} value={s.v}
              disabled={s.mode !== 'constant-reflux'} onChange={(v) => set('v', v)} />
            <ParamSlider label="Distillate purity" symbol="x_D" min={0.05} max={0.999} step={0.001} digits={3} value={s.xD}
              disabled={s.mode !== 'constant-purity'} onChange={(v) => set('xD', v)} />
            <button
              type="button"
              onClick={() => {
                setS(DEFAULTS);
                setD(0);
              }}
              className="w-full rounded-md border border-signal-alarm/30 py-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-alarm/90 transition-colors hover:bg-signal-alarm/10"
            >
              Reset all
            </button>
          </div>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-2">
        <div className="glass flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            disabled={!sim.ok}
            aria-label={playing ? 'Pause' : 'Play'}
            className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-plant-100 transition-colors hover:border-signal-liquid/50 hover:text-signal-liquid disabled:opacity-40"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="tag text-plant-400">Batch progress</span>
          <Slider
            className="flex-1"
            min={0}
            max={Math.max(dEnd, 1e-6)}
            step={Math.max(dEnd, 1e-6) / 500}
            value={[dNow]}
            disabled={!sim.ok}
            aria-label="Distilled fraction D/L₀"
            onValueChange={([v]) => {
              setPlaying(false);
              if (v !== undefined) setD(v);
            }}
          />
          <span className="readout w-56 shrink-0 text-right text-xs text-plant-100">
            D/L₀ = {fmt(dNow, 3)} · L/L₀ = {fmt(1 - dNow, 3)}
          </span>
        </div>

        {sim.error && <Notice tone="error">{sim.error}</Notice>}

        {p && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-7">
            <Kpi label="Still x_W" value={fmt(p.xW, 4)} />
            <Kpi label="Distillate x_D" value={fmt(p.xD, 4)} sub="instantaneous" />
            <Kpi label="Collected x̄_D" value={fmt(p.xDavg, 4)} sub="receiver average" />
            <Kpi label="Recovery" value={fmt(p.recovery * 100, 1)} unit="%" sub="light comp. in receiver" />
            <Kpi label="Reflux v" value={s.mode === 'rayleigh' ? '0' : fmt(p.v, 2)} sub={s.mode === 'constant-purity' ? 'rising' : 'fixed'} />
            <Kpi label="Boil-up V/L₀" value={fmt(p.boilup, 2)} sub="energy ∝ vapour" />
            <Kpi label="Batch end" value={fmt(dEnd, 3)} unit="D/L₀" sub={sim.endReason || '—'} />
          </div>
        )}

        {sim.ok && p && construction && (
          <div className="grid gap-2 2xl:grid-cols-2">
            <Panel title="y–x construction at this instant">
              <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Equilibrium</li>
                {construction.op && <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />Operating line</li>}
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.steps }} />Stages</li>
              </ul>
              <div className="mx-auto max-w-[620px]">
                <ResponsiveContainer width="100%" aspect={1}>
                  <ComposedChart margin={{ top: 12, right: 18, bottom: 22, left: 0 }}>
                    <CartesianGrid stroke={VIZ.grid} />
                    <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
                      <Label value="x — liquid mole fraction" position="bottom" offset={6} style={lbl} />
                    </XAxis>
                    <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={52}>
                      <Label value="y — vapour mole fraction" angle={-90} position="insideLeft" offset={4} style={{ ...lbl, textAnchor: 'middle' }} />
                    </YAxis>
                    <Line {...line} data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" stroke={VIZ.diagonal} strokeWidth={1} />
                    <Line {...line} data={eq} dataKey="y" stroke={VIZ.equilibrium} strokeWidth={2} />
                    {construction.op && <Line {...line} data={construction.op} dataKey="y" stroke={VIZ.operating} strokeWidth={2} />}
                    <Line {...line} data={construction.path} dataKey="y" stroke={VIZ.steps} strokeWidth={1.4} />
                    {/* the still liquid x_W is in equilibrium with the vapour of the last stage */}
                    <ReferenceLine
                      segment={[{ x: p.xW, y: 0 }, { x: p.xW, y: Math.max(p.xW, construction.corners.at(-1)?.y ?? p.xW) }]}
                      stroke={VIZ.textFaint}
                      strokeDasharray="2 3"
                    />
                    <ReferenceLine segment={[{ x: p.xD, y: 0 }, { x: p.xD, y: p.xD }]} stroke={VIZ.textFaint} strokeDasharray="2 3" />
                    <ReferenceDot x={p.xW} y={p.xW} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                      <Label value="x_W" position="right" offset={8} style={mono} />
                    </ReferenceDot>
                    <ReferenceDot x={p.xD} y={p.xD} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
                      <Label value="x_D" position="right" offset={8} style={mono} />
                    </ReferenceDot>
                    <ReferenceDot x={s.x0} y={s.x0} r={3} fill="none" stroke={VIZ.textMuted} strokeWidth={1.5}>
                      <Label value="x₀" position="left" offset={8} style={lbl} />
                    </ReferenceDot>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <div className="space-y-2">
              <Panel title="Compositions over the batch">
                <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                  <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.dew }} />Still x_W</li>
                  <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Distillate x_D (instantaneous)</li>
                  <li className="flex items-center gap-1.5">
                    <svg width="16" height="4" aria-hidden><line x1="1" y1="2" x2="15" y2="2" stroke={VIZ.qLine} strokeWidth="2" strokeDasharray="4 3" /></svg>
                    Collected x̄_D
                  </li>
                </ul>
                <ResponsiveContainer width="100%" height={showReflux ? 300 : 420}>
                  <LineChart data={sim.points} margin={{ top: 12, right: 18, bottom: 22, left: 0 }}>
                    <CartesianGrid stroke={VIZ.grid} />
                    <XAxis type="number" dataKey="d" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
                      <Label value="distilled fraction D/L₀" position="bottom" offset={6} style={lbl} />
                    </XAxis>
                    <YAxis type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={44}>
                      <Label value="light-component mole fraction" angle={-90} position="insideLeft" offset={4} style={{ ...lbl, textAnchor: 'middle' }} />
                    </YAxis>
                    <ReferenceLine y={s.x0} stroke={VIZ.textFaint} strokeDasharray="2 3">
                      <Label value="x₀" position="insideTopLeft" style={lbl} />
                    </ReferenceLine>
                    <Line {...line} dataKey="xW" stroke={VIZ.dew} strokeWidth={2} />
                    <Line {...line} dataKey="xD" stroke={VIZ.equilibrium} strokeWidth={2} />
                    <Line {...line} dataKey="xDavg" stroke={VIZ.qLine} strokeWidth={2} strokeDasharray="6 4" />
                    <ReferenceLine x={dNow} stroke={VIZ.text} strokeWidth={1} />
                    <Tooltip content={<TrajTip />} cursor={{ stroke: VIZ.textFaint }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
              {showReflux && (
                <Panel title="Reflux needed to hold x_D">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={sim.points} margin={{ top: 8, right: 18, bottom: 18, left: 0 }}>
                      <CartesianGrid stroke={VIZ.grid} />
                      <XAxis type="number" dataKey="d" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
                        <Label value="distilled fraction D/L₀" position="bottom" offset={2} style={lbl} />
                      </XAxis>
                      <YAxis type="number" domain={[0, Math.ceil(vCap)]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={44} allowDataOverflow>
                        <Label value="reflux v" angle={-90} position="insideLeft" offset={8} style={{ ...lbl, textAnchor: 'middle' }} />
                      </YAxis>
                      <Line {...line} dataKey="v" stroke={VIZ.operating} strokeWidth={2} />
                      <ReferenceLine x={dNow} stroke={VIZ.text} strokeWidth={1} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-plant-500">The reflux runs away as the still empties — the batch ends when x_D can no longer be held.</p>
                </Panel>
              )}
            </div>
          </div>
        )}

        <Panel title="Model">
          <ul className="grid gap-x-6 gap-y-1 text-[11px] leading-relaxed text-plant-400 md:grid-cols-2">
            <li>Rayleigh: ln(L/L₀) = −∫ dx / (y* − x) from x_W to x₀; the vapour is the distillate.</li>
            <li>Constant reflux: the same balance with x_D(x_W) from N stages on the operating line.</li>
            <li>Constant purity: L/L₀ = (x_D − x₀)/(x_D − x_W); the reflux is solved at every instant.</li>
            <li>Quasi-steady, negligible column hold-up, constant molar overflow, total condenser.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
