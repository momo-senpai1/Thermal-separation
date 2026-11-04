import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import type { CounterResult, Curve, CrossResult } from '@/engine/extraction/cascade';
import { linspace } from '@/engine/numerics';

export const fmtL = (v: number) => (Math.abs(v) >= 0.1 || v === 0 ? v.toFixed(3) : v.toPrecision(3));
const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const mono = { ...lbl, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };
const line = { dot: false, isAnimationActive: false, dataKey: 'y', type: 'linear' as const, activeDot: false };

export interface LoadingLayers {
  operating: boolean;
  drops: boolean;
  numbers: boolean;
  solvent: boolean;
  limits: boolean;
}

function frame(xMax: number, yMax: number) {
  return { x: [0, xMax] as [number, number], y: [0, yMax] as [number, number] };
}

export function LoadingChart({
  mode,
  curve,
  X0,
  Y0,
  XN,
  cross,
  counter,
  layers,
}: {
  mode: 'cross' | 'counter';
  curve: Curve;
  X0: number;
  Y0: number;
  XN: number;
  cross?: CrossResult;
  counter?: CounterResult;
  layers: LoadingLayers;
}) {
  const xMax = X0 * 1.12;
  const yTop = mode === 'counter' && counter?.ok ? Math.max(counter.Y1, curve.Ystar(X0)) : curve.Ystar(X0);
  const f = frame(xMax, yTop * 1.1 || 1);
  const eq = useMemo(() => linspace(0, Math.min(xMax, curve.Xmax * 1.02), 200).map((x) => ({ x, y: curve.Ystar(x) })), [curve, xMax]);
  const ticks = (a: number, b: number) => linspace(a, b, 6);
  const Xlim = curve.Xstar(Y0);

  return (
    <ResponsiveContainer width="100%" aspect={1.35}>
      <ComposedChart margin={{ top: 14, right: 20, bottom: 26, left: 6 }}>
        <CartesianGrid stroke={VIZ.grid} />
        <XAxis type="number" dataKey="x" domain={f.x} ticks={ticks(...f.x)} tickFormatter={fmtL} tick={axisTick} stroke={VIZ.axis} tickLine={false} allowDataOverflow>
          <Label value="feed / raffinate loading X" position="bottom" offset={8} style={lbl} />
        </XAxis>
        <YAxis type="number" dataKey="y" domain={f.y} ticks={ticks(...f.y)} tickFormatter={fmtL} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={58} allowDataOverflow>
          <Label value="solvent / extract loading Y" angle={-90} position="insideLeft" offset={2} style={{ ...lbl, textAnchor: 'middle' }} />
        </YAxis>

        <Line {...line} data={eq} stroke={VIZ.equilibrium} strokeWidth={2} />
        {layers.solvent && <Line {...line} data={[{ x: 0, y: Y0 }, { x: xMax, y: Y0 }]} stroke={VIZ.qLine} strokeWidth={1.6} />}

        {/* Recharts only renders chart elements that are direct children (or arrays/fragments) */}
        {mode === 'cross' && cross?.ok && layers.operating &&
          cross.stages.map((s) => (
            <Line key={`op${s.stage}`} {...line} data={[{ x: s.Xin, y: Y0 }, { x: s.X, y: s.Y }]} stroke={VIZ.operating} strokeWidth={2} />
          ))}
        {mode === 'cross' && cross?.ok && layers.drops &&
          cross.stages.map((s) => (
            <Line key={`dr${s.stage}`} {...line} data={[{ x: s.X, y: s.Y }, { x: s.X, y: Y0 }]} stroke={VIZ.steps} strokeWidth={1.2} strokeDasharray="4 3" />
          ))}
        {mode === 'cross' && cross?.ok && layers.numbers &&
          cross.stages.map((s) => (
            <ReferenceDot key={`n${s.stage}`} x={(s.Xin + s.X) / 2} y={(Y0 + s.Y) / 2} r={0}>
              <Label value={String(s.stage)} position="top" offset={6} style={mono} />
            </ReferenceDot>
          ))}

        {mode === 'counter' && counter && Number.isFinite(counter.rMin) && layers.limits && (
          <>
            <Line {...line} data={[{ x: XN, y: Y0 }, { x: X0, y: Y0 + (X0 - XN) / counter.rMin }]} stroke={VIZ.operating} strokeWidth={1.2} strokeDasharray="5 4" />
            <Line {...line} data={[{ x: XN, y: Y0 }, { x: X0, y: Y0 + (X0 - XN) / counter.rOne }]} stroke={VIZ.textFaint} strokeWidth={1.2} strokeDasharray="2 3" />
          </>
        )}
        {mode === 'counter' && counter?.ok && (
          <>
            {layers.operating && <Line {...line} data={[{ x: XN, y: Y0 }, { x: X0, y: counter.Y1 }]} stroke={VIZ.operating} strokeWidth={2} />}
            {layers.drops && (
              <Line
                {...line}
                data={[{ x: X0, y: counter.Y1 }, ...counter.stages.flatMap((s) => (s.partial ? [{ x: s.X, y: s.Y }] : [{ x: s.X, y: s.Y }, { x: s.X, y: s.Ybelow }]))]}
                stroke={VIZ.steps}
                strokeWidth={1.3}
              />
            )}
            {layers.numbers &&
              counter.stages.map((s, i) => {
                const xr = i === 0 ? X0 : counter.stages[i - 1]!.X;
                return (
                  <ReferenceDot key={`c${s.stage}`} x={(xr + s.X) / 2} y={s.Y} r={0}>
                    <Label value={String(s.stage)} position="top" offset={6} style={mono} />
                  </ReferenceDot>
                );
              })}
          </>
        )}

        <ReferenceDot x={X0} y={mode === 'counter' && counter?.ok ? counter.Y1 : Y0} r={5} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
          <Label value={mode === 'counter' ? 'X₀, Y₁' : 'X₀'} position="top" offset={9} style={mono} />
        </ReferenceDot>
        <ReferenceDot x={mode === 'cross' && cross?.ok ? cross.Xout : XN} y={Y0} r={5} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={2}>
          <Label value="X_N" position="insideBottomRight" offset={10} style={mono} />
        </ReferenceDot>
        {Xlim > 0 && (
          <ReferenceDot x={Xlim} y={Y0} r={4} fill={VIZ.textMuted} stroke={VIZ.surface} shape={(p: { cx?: number; cy?: number }) => (
            <path d={`M${(p.cx ?? 0) - 5},${(p.cy ?? 0) + 5}L${p.cx ?? 0},${(p.cy ?? 0) - 4}L${(p.cx ?? 0) + 5},${(p.cy ?? 0) + 5}Z`} fill={VIZ.textMuted} />
          )} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function LoadingLegend({ mode, limits }: { mode: 'cross' | 'counter'; limits: boolean }) {
  const items: { l: string; c: string; dash?: string; w?: number }[] = [
    { l: 'Equilibrium Y*(X)', c: VIZ.equilibrium },
    { l: mode === 'cross' ? 'Operating line of each stage' : 'Operating line', c: VIZ.operating },
    { l: mode === 'cross' ? 'Drop to Y₀: next stage’s feed' : 'Stages', c: VIZ.steps, dash: mode === 'cross' ? '4 3' : undefined, w: 1.3 },
    { l: 'Fresh solvent Y₀', c: VIZ.qLine, w: 1.6 },
    ...(mode === 'counter' && limits
      ? [
          { l: 'Minimum ratio (pinch)', c: VIZ.operating, dash: '5 4', w: 1.2 },
          { l: 'One-stage ratio', c: VIZ.textFaint, dash: '2 3', w: 1.2 },
        ]
      : []),
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-plant-300">
      {items.map((i) => (
        <li key={i.l} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="1" y1="3" x2="17" y2="3" stroke={i.c} strokeWidth={i.w ?? 2} strokeDasharray={i.dash} />
          </svg>
          {i.l}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <svg width="12" height="10" aria-hidden><path d="M1,9L6,1L11,9Z" fill={VIZ.textMuted} /></svg>X*(Y₀) — lowest reachable raffinate
      </li>
    </ul>
  );
}
