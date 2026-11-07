import {
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { fmt } from '@/lib/utils';
import type { McCabeThieleSeries, Pt, StageCorner } from './chartData';
import { axisTick, STRIPPING_DASH, VIZ } from './vizTokens';

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const line = { dot: false, isAnimationActive: false, dataKey: 'y', type: 'linear' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, activeDot: false };

/** Stage corner: 8px dot with 2px surface ring; feed stage is larger and labelled. */
function CornerShape(props: { cx?: number; cy?: number; payload?: StageCorner }) {
  const { cx = 0, cy = 0, payload } = props;
  if (payload?.isFeed) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={VIZ.qLine} stroke={VIZ.surface} strokeWidth={2} />
        <text x={cx - 10} y={cy - 10} textAnchor="end" fill={VIZ.text} fontSize={10} fontFamily="JetBrains Mono, monospace">
          Feed · stage {payload.stage}
        </text>
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={4} fill={VIZ.steps} stroke={VIZ.surface} strokeWidth={2} />;
}

/**
 * Item tooltip for stage corners. The staircase line runs through every corner,
 * so the hovered payload may be the bare {x, y} line point — resolve it back to
 * its stage by coordinates.
 */
function CornerTooltip({ active, payload, corners }: TooltipProps<number, string> & { corners: StageCorner[] }) {
  const raw = payload?.[0]?.payload as Partial<StageCorner> | undefined;
  const p =
    raw?.stage !== undefined
      ? (raw as StageCorner)
      : corners.find((c) => raw && Math.abs(c.x - (raw.x ?? -1)) < 1e-9 && Math.abs(c.y - (raw.y ?? -1)) < 1e-9);
  if (!active || !p) return null;
  const name = p.section === 'condenser' ? 'Partial condenser' : `Stage ${p.stage}`;
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2.5 py-1.5 font-mono text-[10px] leading-4 shadow-glass backdrop-blur">
      <p className="font-semibold text-plant-100">
        {name}
        {p.isFeed && <span className="text-plant-400"> · feed</span>}
      </p>
      <p className="text-plant-400">
        {p.section} section
      </p>
      <p className="text-plant-200">
        x <span className="text-plant-100">{fmt(p.x, 4)}</span> · y <span className="text-plant-100">{fmt(p.y, 4)}</span>
      </p>
    </div>
  );
}

/** Midpoint of a 2-point segment, for direct labels. */
const mid = ([a, b]: Pt[]) => ({ x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2 });

export function McCabeThieleChart({ s }: { s: McCabeThieleSeries }) {
  const rMid = mid(s.rectifying);
  const sMid = mid(s.stripping);
  const eqLabel = s.equilibrium[Math.round(0.22 * (s.equilibrium.length - 1))] ?? { x: 0.22, y: 0.4 };
  const labelStyle = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };

  return (
    <ResponsiveContainer width="100%" aspect={1}>
      <ComposedChart margin={{ top: 12, right: 16, bottom: 22, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 1]}
          ticks={TICKS}
          tick={axisTick}
          stroke={VIZ.axis}
          tickLine={false}
          allowDuplicatedCategory={false}
        >
          <Label value="x — liquid mole fraction (light key)" position="bottom" offset={6} style={labelStyle} />
        </XAxis>
        <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={TICKS} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={52}>
          <Label value="y — vapour mole fraction" angle={-90} position="insideLeft" offset={4} style={{ ...labelStyle, textAnchor: 'middle' }} />
        </YAxis>

        <Line {...line} data={s.diagonal} stroke={VIZ.diagonal} strokeWidth={1} name="y = x" />
        <Line {...line} data={s.equilibrium} stroke={VIZ.equilibrium} strokeWidth={2} name="Equilibrium" />
        <Line {...line} data={s.rectifying} stroke={VIZ.operating} strokeWidth={2} name="Rectifying" />
        <Line {...line} data={s.stripping} stroke={VIZ.operating} strokeWidth={2} strokeDasharray={STRIPPING_DASH} name="Stripping" />
        <Line {...line} data={s.qLine} stroke={VIZ.qLine} strokeWidth={2} name="q-line" />
        <Line {...line} data={s.staircase} stroke={VIZ.steps} strokeWidth={1.25} strokeOpacity={0.85} name="Stages" />
        <Scatter data={s.corners} shape={<CornerShape />} isAnimationActive={false} />

        {/* selective direct labels */}
        <ReferenceDot x={eqLabel.x} y={eqLabel.y} r={0}>
          <Label value="Equilibrium" position="left" offset={8} style={labelStyle} />
        </ReferenceDot>
        <ReferenceDot x={rMid.x} y={rMid.y} r={0}>
          <Label value="Rectifying" position="right" offset={10} style={labelStyle} />
        </ReferenceDot>
        <ReferenceDot x={sMid.x} y={sMid.y} r={0}>
          <Label value="Stripping" position="right" offset={10} style={labelStyle} />
        </ReferenceDot>
        {[
          { v: s.xB, l: 'x_B' },
          { v: s.zF, l: 'z_F' },
          { v: s.xD, l: 'x_D' },
        ].map(({ v, l }) => (
          <ReferenceDot key={l} x={v} y={v} r={3} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
            <Label value={l} position="bottom" offset={8} style={{ ...labelStyle, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' }} />
          </ReferenceDot>
        ))}

        <Tooltip content={<CornerTooltip corners={s.corners} />} cursor={false} shared={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Legend row — identity never by colour alone (line style is shown too). */
export function McCabeThieleLegend({ real = false }: { real?: boolean }) {
  const items: { label: string; color: string; dash?: string; width?: number }[] = [
    { label: real ? 'Equilibrium (activity model)' : 'Equilibrium (constant α)', color: VIZ.equilibrium },
    { label: 'Rectifying', color: VIZ.operating },
    { label: 'Stripping', color: VIZ.operating, dash: STRIPPING_DASH },
    { label: 'q-line', color: VIZ.qLine },
    { label: 'Stages', color: VIZ.steps, width: 1.25 },
    { label: 'y = x', color: VIZ.diagonal, width: 1 },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-plant-300">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="1" y1="3" x2="17" y2="3" stroke={it.color} strokeWidth={it.width ?? 2} strokeDasharray={it.dash} strokeLinecap="round" />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
