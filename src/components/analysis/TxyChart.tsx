import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { fmt } from '@/lib/utils';
import type { TxyRow } from './chartData';
import { axisTick, VIZ } from './vizTokens';

export interface TxyMarker {
  label: string;
  x: number;
  /** °C */
  T: number;
}

function CrosshairTooltip({ active, payload }: TooltipProps<number, string>) {
  const r = payload?.[0]?.payload as TxyRow | undefined;
  if (!active || !r) return null;
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2.5 py-1.5 font-mono text-[10px] leading-4 shadow-glass backdrop-blur">
      <p className="text-plant-400">
        x<sub>A</sub> = <span className="text-plant-100">{fmt(r.x, 3)}</span>
      </p>
      <p className="flex items-center gap-1.5 text-plant-200">
        <span className="h-0.5 w-3 rounded-full" style={{ background: VIZ.bubble }} />
        Bubble <span className="ml-auto text-plant-100">{fmt(r.bubble, 2)} °C</span>
      </p>
      <p className="flex items-center gap-1.5 text-plant-200">
        <span className="h-0.5 w-3 rounded-full" style={{ background: VIZ.dew }} />
        Dew <span className="ml-auto pl-3 text-plant-100">{fmt(r.dew, 2)} °C</span>
      </p>
    </div>
  );
}

export function TxyChart({ rows, markers }: { rows: TxyRow[]; markers: TxyMarker[] }) {
  const labelStyle = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
  const lo = Math.floor(Math.min(...rows.map((r) => r.bubble)) / 5) * 5;
  const hi = Math.ceil(Math.max(...rows.map((r) => r.dew)) / 5) * 5;
  const ticks = Array.from({ length: Math.round((hi - lo) / 5) + 1 }, (_, i) => lo + 5 * i);
  // label each curve where the envelope is wide; text sits outside the two-phase region
  const at = (f: number) => rows[Math.round((rows.length - 1) * f)];
  const bubbleLbl = at(0.36);
  const dewLbl = at(0.55);

  return (
    <ResponsiveContainer width="100%" aspect={1.15}>
      <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 22, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} />
        <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
          <Label value="x, y — light-key mole fraction" position="bottom" offset={6} style={labelStyle} />
        </XAxis>
        <YAxis type="number" domain={[lo, hi]} ticks={ticks} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={52} allowDecimals={false}>
          <Label value="T [°C]" angle={-90} position="insideLeft" offset={4} style={{ ...labelStyle, textAnchor: 'middle' }} />
        </YAxis>
        <Line dataKey="bubble" stroke={VIZ.bubble} strokeWidth={2} dot={false} isAnimationActive={false}
          activeDot={{ r: 4, fill: VIZ.bubble, stroke: VIZ.surface, strokeWidth: 2 }} />
        <Line dataKey="dew" stroke={VIZ.dew} strokeWidth={2} dot={false} isAnimationActive={false}
          activeDot={{ r: 4, fill: VIZ.dew, stroke: VIZ.surface, strokeWidth: 2 }} />
        {bubbleLbl && (
          <ReferenceDot x={bubbleLbl.x} y={bubbleLbl.bubble} r={0}>
            <Label value="Bubble line (sat. liquid)" position="left" offset={10} style={{ ...labelStyle, textAnchor: 'end' }} />
          </ReferenceDot>
        )}
        {dewLbl && (
          <ReferenceDot x={dewLbl.x} y={dewLbl.dew} r={0}>
            <Label value="Dew line (sat. vapour)" position="right" offset={10} style={labelStyle} />
          </ReferenceDot>
        )}
        {markers.map((m) => (
          <ReferenceDot key={m.label} x={m.x} y={m.T} r={4} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
            <Label value={m.label} position="top" offset={8} style={{ ...labelStyle, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' }} />
          </ReferenceDot>
        ))}
        <Tooltip content={<CrosshairTooltip />} cursor={{ stroke: VIZ.textFaint, strokeWidth: 1 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TxyLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 text-[10px] text-plant-300">
      {[
        { l: 'Bubble line T(x)', c: VIZ.bubble },
        { l: 'Dew line T(y)', c: VIZ.dew },
      ].map((i) => (
        <li key={i.l} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: i.c }} />
          {i.l}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-plant-100 ring-2 ring-plant-950" />
        Column streams
      </li>
    </ul>
  );
}
