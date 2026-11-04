import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import type { DesignResult, DesignStage, Pt } from '@/engine/mtDesign';
import { linspace } from '@/engine/numerics';
import { fmt } from '@/lib/utils';

export type Window = { x: [number, number]; y: [number, number] };
export const FULL: Window = { x: [0, 1], y: [0, 1] };

const line = {
  dot: false,
  isAnimationActive: false,
  dataKey: 'y',
  type: 'linear' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  activeDot: false,
};
const labelStyle = { fill: VIZ.textMuted, fontSize: 10, fontFamily: 'Inter, sans-serif' };
const monoLabel = { ...labelStyle, fill: VIZ.text, fontFamily: 'JetBrains Mono, monospace' };

function ticks([a, b]: [number, number]) {
  const span = b - a;
  const step = span > 0.6 ? 0.2 : span > 0.3 ? 0.1 : span > 0.12 ? 0.05 : 0.02;
  const out: number[] = [];
  for (let t = Math.ceil(a / step - 1e-9) * step; t <= b + 1e-9; t += step) out.push(Number(t.toFixed(4)));
  return out;
}

function Corner(props: { cx?: number; cy?: number; payload?: DesignStage }) {
  const { cx = 0, cy = 0, payload } = props;
  if (payload?.isFeed) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={VIZ.qLine} stroke={VIZ.surface} strokeWidth={2} />
        <text x={cx - 10} y={cy - 10} textAnchor="end" fill={VIZ.text} fontSize={10} fontFamily="JetBrains Mono, monospace">
          feed · {payload.stage}
        </text>
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={4} fill={VIZ.steps} stroke={VIZ.surface} strokeWidth={2} />;
}

function StageTip({ active, payload, stages }: TooltipProps<number, string> & { stages: DesignStage[] }) {
  const raw = payload?.[0]?.payload as Partial<DesignStage> | undefined;
  const s =
    raw?.stage !== undefined
      ? (raw as DesignStage)
      : stages.find((c) => raw && Math.abs(c.x - (raw.x ?? -1)) < 1e-9 && Math.abs(c.y - (raw.y ?? -1)) < 1e-9);
  if (!active || !s) return null;
  return (
    <div className="rounded border border-white/10 bg-plant-950/95 px-2.5 py-1.5 font-mono text-[10px] leading-4 shadow-glass backdrop-blur">
      <p className="font-semibold text-plant-100">
        Stage {s.stage}
        {s.isFeed && <span className="text-plant-400"> · feed</span>}
        {s.partial && <span className="text-plant-400"> · partial</span>}
      </p>
      <p className="text-plant-400">{s.section} section</p>
      <p className="text-plant-200">
        x <span className="text-plant-100">{fmt(s.x, 4)}</span> · y <span className="text-plant-100">{fmt(s.y, 4)}</span>
      </p>
    </div>
  );
}

export function DesignDiagram({
  r,
  y,
  azeotrope,
  murphree,
  win = FULL,
}: {
  r: DesignResult;
  y: (x: number) => number;
  azeotrope: number | null;
  murphree: boolean;
  win?: Window;
}) {
  const equilibrium = useMemo(() => linspace(0, 1, 241).map((x) => ({ x, y: y(x) })), [y]);
  const diag: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  const last = r.stages.at(-1);
  const mid = (seg: Pt[]) => (seg.length === 2 ? { x: (seg[0]!.x + seg[1]!.x) / 2, y: (seg[0]!.y + seg[1]!.y) / 2 } : null);
  const rMid = mid(r.rectifying);
  const sMid = mid(r.stripping);

  return (
    <ResponsiveContainer width="100%" aspect={1}>
      <ComposedChart margin={{ top: 12, right: 18, bottom: 22, left: 0 }}>
        <CartesianGrid stroke={VIZ.grid} strokeWidth={1} />
        <XAxis type="number" dataKey="x" domain={win.x} ticks={ticks(win.x)} tick={axisTick} stroke={VIZ.axis} tickLine={false} allowDataOverflow>
          <Label value="x — liquid mole fraction (light component)" position="bottom" offset={6} style={labelStyle} />
        </XAxis>
        <YAxis type="number" dataKey="y" domain={win.y} ticks={ticks(win.y)} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={52} allowDataOverflow>
          <Label value="y — vapour mole fraction" angle={-90} position="insideLeft" offset={4} style={{ ...labelStyle, textAnchor: 'middle' }} />
        </YAxis>

        <Line {...line} data={diag} stroke={VIZ.diagonal} strokeWidth={1} />
        <Line {...line} data={equilibrium} stroke={VIZ.equilibrium} strokeWidth={murphree ? 1.5 : 2} strokeDasharray={murphree ? '5 4' : undefined} />
        {murphree && r.pseudo.length > 0 && <Line {...line} data={r.pseudo} stroke={VIZ.equilibrium} strokeWidth={2} />}
        {r.qLine.length > 0 && <Line {...line} data={r.qLine} stroke={VIZ.qLine} strokeWidth={2} />}
        {r.rectifying.length > 0 && <Line {...line} data={r.rectifying} stroke={VIZ.operating} strokeWidth={2} />}
        {r.stripping.length > 0 && <Line {...line} data={r.stripping} stroke={VIZ.operating} strokeWidth={2} />}
        {r.rectifyingExt.length > 0 && <Line {...line} data={r.rectifyingExt} stroke={VIZ.operating} strokeWidth={1.5} strokeDasharray="5 4" />}
        {r.strippingExt.length > 0 && <Line {...line} data={r.strippingExt} stroke={VIZ.operating} strokeWidth={1.5} strokeDasharray="5 4" />}
        {r.staircase.length > 1 && <Line {...line} data={r.staircase} stroke={VIZ.steps} strokeWidth={1.25} strokeOpacity={0.9} />}
        {r.stages.length > 0 && <Scatter data={r.stages} shape={<Corner />} isAnimationActive={false} />}

        {/* x_B marker runs up to where the column actually stops */}
        {r.ok && last && (
          <ReferenceLine segment={[{ x: r.xB, y: r.xB }, { x: r.xB, y: last.y }]} stroke={VIZ.textMuted} strokeDasharray="2 3" strokeWidth={1} />
        )}

        {rMid && (
          <ReferenceDot x={rMid.x} y={rMid.y} r={0}>
            <Label value="Rectifying" position={r.mirrored ? 'left' : 'right'} offset={10} style={labelStyle} />
          </ReferenceDot>
        )}
        {sMid && (
          <ReferenceDot x={sMid.x} y={sMid.y} r={0}>
            <Label value="Stripping" position={r.mirrored ? 'left' : 'right'} offset={10} style={labelStyle} />
          </ReferenceDot>
        )}
        {[
          { v: r.xB, l: 'x_B' },
          { v: r.xF, l: 'x_F' },
          { v: r.xD, l: 'x_D' },
        ]
          .filter((m) => Number.isFinite(m.v))
          .map((m) => (
            <ReferenceDot key={m.l} x={m.v} y={m.v} r={3} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2}>
              <Label value={m.l} position={r.mirrored ? 'top' : 'bottom'} offset={8} style={monoLabel} />
            </ReferenceDot>
          ))}
        {azeotrope !== null && (
          <ReferenceDot x={azeotrope} y={azeotrope} r={4} fill="none" stroke={VIZ.text} strokeWidth={1.5}>
            <Label value="azeotrope" position="left" offset={8} style={labelStyle} />
          </ReferenceDot>
        )}

        <Tooltip content={<StageTip stages={r.stages} />} cursor={false} shared={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DesignLegend({ murphree }: { murphree: boolean }) {
  const items: { label: string; color: string; dash?: string; width?: number }[] = [
    ...(murphree
      ? [
          { label: 'Pseudo-equilibrium (E_M)', color: VIZ.equilibrium },
          { label: 'Equilibrium', color: VIZ.equilibrium, dash: '5 4', width: 1.5 },
        ]
      : [{ label: 'Equilibrium', color: VIZ.equilibrium }]),
    { label: 'Operating lines', color: VIZ.operating },
    { label: 'Extension beyond the q-line', color: VIZ.operating, dash: '5 4', width: 1.5 },
    { label: 'q-line', color: VIZ.qLine },
    { label: 'Stages', color: VIZ.steps, width: 1.25 },
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
