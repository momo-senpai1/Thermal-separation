import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import type { Shortcut } from '@/engine/mtDesign';
import { fmt } from '@/lib/utils';

function Tip({ active, payload }: TooltipProps<number, string>) {
  const p = payload?.[0]?.payload as { v: number; N: number } | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2 py-1 font-mono text-[10px] text-plant-200 shadow-glass">
      v = <span className="text-plant-100">{fmt(p.v, 3)}</span> → N = <span className="text-plant-100">{fmt(p.N, 2)}</span>
    </div>
  );
}

/** Gilliland (Liddle) stages vs reflux with both asymptotes and the design band. */
export function GillilandChart({ sc, v, Nstair }: { sc: Shortcut; v: number; Nstair: number | null }) {
  const yMax = Math.ceil(Math.max(sc.Nmin * 3.2, (Nstair ?? 0) * 1.15, (sc.gilliland ?? 0) * 1.15) / 5) * 5;
  const xMax = sc.vmin * 5;
  const lbl = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sc.curve} margin={{ top: 10, right: 14, bottom: 18, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} />
        <XAxis type="number" dataKey="v" domain={[0, xMax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} allowDataOverflow tickFormatter={(t: number) => t.toFixed(1)}>
          <Label value="reflux ratio v" position="bottom" offset={4} style={lbl} />
        </XAxis>
        <YAxis type="number" domain={[0, yMax]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={40} allowDataOverflow>
          <Label value="stages N" angle={-90} position="insideLeft" offset={10} style={{ ...lbl, textAnchor: 'middle' }} />
        </YAxis>
        <ReferenceArea x1={1.05 * sc.vmin} x2={1.5 * sc.vmin} fill={VIZ.qLine} fillOpacity={0.1} stroke="none" ifOverflow="hidden">
          <Label value="design range" position="insideTop" offset={6} style={lbl} />
        </ReferenceArea>
        <ReferenceLine x={sc.vmin} stroke={VIZ.textFaint} strokeDasharray="4 3">
          <Label value="v_min" position="insideBottomLeft" offset={8} style={lbl} />
        </ReferenceLine>
        <ReferenceLine y={sc.Nmin} stroke={VIZ.textFaint} strokeDasharray="4 3">
          <Label value="N_min" position="insideTopRight" offset={6} style={lbl} />
        </ReferenceLine>
        <Line dataKey="N" stroke={VIZ.equilibrium} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }} />
        {sc.gilliland !== null && v <= xMax && (
          <ReferenceDot x={v} y={sc.gilliland} r={4.5} fill={VIZ.equilibrium} stroke={VIZ.surface} strokeWidth={2} />
        )}
        {Nstair !== null && v <= xMax && Nstair <= yMax && (
          <ReferenceDot x={v} y={Nstair} r={4.5} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={1.5} />
        )}
        <Tooltip content={<Tip />} cursor={{ stroke: VIZ.textFaint }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GillilandLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 text-[10px] text-plant-300">
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />
        Gilliland (Liddle fit)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full ring-2 ring-plant-950" style={{ background: VIZ.equilibrium }} />
        Gilliland at v
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border border-plant-100" />
        Staircase at v
      </li>
    </ul>
  );
}
