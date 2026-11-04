import { useCallback, useRef, useState, type PointerEvent } from 'react';
import { VIZ } from '@/components/analysis/vizTokens';
import type { ColumnAtTotalReflux, Line, ProductRegions, SingularPoint } from '@/engine/ternary/lines';
import { project } from '@/engine/ternary/lines';
import { bubble, type TernarySystem, type Vec3 } from '@/engine/ternary/model';
import { fmt } from '@/lib/utils';

const W = 760;
const H = 720;
const SIDE = 600;
const TH = (SIDE * Math.sqrt(3)) / 2;
const TOP = { x: W / 2, y: 78 };
const BL = { x: W / 2 - SIDE / 2, y: 78 + TH };
const BR = { x: W / 2 + SIDE / 2, y: 78 + TH };

export const toXY = (x: readonly number[]) => ({
  x: x[0]! * TOP.x + x[1]! * BL.x + x[2]! * BR.x,
  y: x[0]! * TOP.y + x[1]! * BL.y + x[2]! * BR.y,
});

/** Screen point → composition (barycentric), projected into the triangle. */
export function fromXY(px: number, py: number): Vec3 {
  const det = (BL.y - BR.y) * (TOP.x - BR.x) + (BR.x - BL.x) * (TOP.y - BR.y);
  const a = ((BL.y - BR.y) * (px - BR.x) + (BR.x - BL.x) * (py - BR.y)) / det;
  const b = ((BR.y - TOP.y) * (px - BR.x) + (TOP.x - BR.x) * (py - BR.y)) / det;
  return project([a, b, 1 - a - b]);
}

const path = (pts: readonly (readonly number[])[]) =>
  pts.map((p, i) => {
    const q = toXY(p);
    return `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  }).join('');

/** Arrowhead near the middle of a line, pointing towards the heavy end (rising T). */
function Arrow({ line }: { line: Line }) {
  const n = line.pts.length;
  if (n < 4) return null;
  const i = Math.floor(n * 0.45);
  const a = toXY(line.pts[i + 1]!);
  const b = toXY(line.pts[i]!);
  const hot = line.T[i]! > line.T[i + 1]! ? b : a;
  const cold = hot === b ? a : b;
  const ang = Math.atan2(hot.y - cold.y, hot.x - cold.x);
  if (Math.hypot(hot.x - cold.x, hot.y - cold.y) < 0.5) return null;
  const s = 6;
  const tip = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const p1 = { x: tip.x - s * Math.cos(ang - 0.45), y: tip.y - s * Math.sin(ang - 0.45) };
  const p2 = { x: tip.x - s * Math.cos(ang + 0.45), y: tip.y - s * Math.sin(ang + 0.45) };
  return <path d={`M${p1.x},${p1.y}L${tip.x},${tip.y}L${p2.x},${p2.y}Z`} fill={VIZ.equilibrium} />;
}

export interface Layers {
  lines: boolean;
  arrows: boolean;
  borders: boolean;
  feed: boolean;
  column: boolean;
  points: boolean;
}

function PointMark({ p }: { p: SingularPoint }) {
  const q = toXY(p.x);
  const common = { stroke: VIZ.surface, strokeWidth: 2 };
  if (p.kind === 'light-node') return <circle cx={q.x} cy={q.y} r={5.5} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={1.8} />;
  if (p.kind === 'heavy-node') return <rect x={q.x - 5} y={q.y - 5} width={10} height={10} fill={VIZ.text} {...common} />;
  return <path d={`M${q.x},${q.y - 7}L${q.x + 7},${q.y}L${q.x},${q.y + 7}L${q.x - 7},${q.y}Z`} fill={VIZ.textMuted} {...common} />;
}

export function TernaryDiagram({
  sys,
  P,
  points,
  field,
  borders,
  regions,
  column,
  F,
  D,
  layers,
  onMove,
}: {
  sys: TernarySystem;
  P: number;
  points: SingularPoint[];
  field: Line[];
  borders: Line[];
  regions: ProductRegions | null;
  column: ColumnAtTotalReflux | null;
  F: Vec3;
  D: Vec3;
  layers: Layers;
  onMove: (which: 'F' | 'D', x: Vec3) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'F' | 'D' | null>(null);
  const [hover, setHover] = useState<{ x: Vec3; T: number } | null>(null);

  const local = useCallback((e: PointerEvent) => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = el.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return fromXY(p.x, p.y);
  }, []);

  const onPointerMove = (e: PointerEvent) => {
    const x = local(e);
    if (drag) onMove(drag, x);
    setHover({ x, T: bubble(sys, x, P).T });
  };

  // ternary grid
  const grid: string[] = [];
  for (let k = 0; k < 3; k++) {
    const [a, b] = [0, 1, 2].filter((i) => i !== k) as [number, number];
    for (let v = 0.1; v < 0.95; v += 0.1) {
      const p1 = [0, 0, 0];
      const p2 = [0, 0, 0];
      p1[k] = v;
      p1[a] = 1 - v;
      p2[k] = v;
      p2[b] = 1 - v;
      grid.push(path([p1, p2]));
    }
  }
  const ticks: { x: number; y: number; t: string; anchor: 'start' | 'end' | 'middle' }[] = [];
  for (let i = 1; i < 10; i++) {
    const v = i / 10;
    const l = toXY([v, 1 - v, 0]);
    ticks.push({ x: l.x - 8, y: l.y + 3, t: v.toFixed(1), anchor: 'end' }); // x₁ on the left edge
    const r = toXY([1 - v, 0, v]);
    ticks.push({ x: r.x + 8, y: r.y + 3, t: v.toFixed(1), anchor: 'start' }); // x₃ on the right edge
    const bt = toXY([0, v, 1 - v]);
    ticks.push({ x: bt.x, y: bt.y + 16, t: v.toFixed(1), anchor: 'middle' }); // x₂ on the bottom edge
  }
  const vT = [0, 1, 2].map((i) => points.find((p) => p.order === 'pure' && p.x[i] === 1)?.T ?? Number.NaN);
  const label = (i: number) => `${i + 1} — ${sys.comps[i]!.name}`;
  const fXY = toXY(F);
  const dXY = toXY(D);
  const bXY = column ? toXY(column.B) : null;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none select-none"
      role="img"
      aria-label={`Ternary diagram of ${sys.name}: distillation lines at total reflux`}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => {
        setDrag(null);
        setHover(null);
      }}
    >
      <defs>
        <clipPath id="tri">
          <path d={path([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]])} />
        </clipPath>
      </defs>

      {/* frame and grid */}
      <path d={path([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]])} fill="rgba(148,163,184,0.025)" stroke={VIZ.axis} strokeWidth={1.2} />
      {grid.map((d, i) => (
        <path key={i} d={d} stroke={VIZ.grid} strokeWidth={1} fill="none" />
      ))}
      {ticks.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} fill={VIZ.textFaint} fontSize={10} fontFamily="JetBrains Mono, monospace">
          {t.t}
        </text>
      ))}
      <text x={BL.x - 30} y={BL.y - TH / 2} fill={VIZ.textMuted} fontSize={11} fontFamily="Inter, sans-serif" textAnchor="end">↖ x₁</text>
      <text x={BR.x + 30} y={BR.y - TH / 2} fill={VIZ.textMuted} fontSize={11} fontFamily="Inter, sans-serif">x₃ ↘</text>
      <text x={W / 2} y={BL.y + 34} fill={VIZ.textMuted} fontSize={11} fontFamily="Inter, sans-serif" textAnchor="middle">← x₂</text>

      {/* vertex labels */}
      <text x={TOP.x} y={TOP.y - 28} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">{label(0)}</text>
      <text x={TOP.x} y={TOP.y - 13} textAnchor="middle" fill={VIZ.textMuted} fontSize={10} fontFamily="JetBrains Mono, monospace">{fmt(vT[0], 1)} °C at {fmt(P, 3)} bar</text>
      <text x={BL.x - 20} y={BL.y + 40} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">{label(1)}</text>
      <text x={BL.x - 20} y={BL.y + 55} textAnchor="middle" fill={VIZ.textMuted} fontSize={10} fontFamily="JetBrains Mono, monospace">{fmt(vT[1], 1)} °C</text>
      <text x={BR.x + 20} y={BR.y + 40} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">{label(2)}</text>
      <text x={BR.x + 20} y={BR.y + 55} textAnchor="middle" fill={VIZ.textMuted} fontSize={10} fontFamily="JetBrains Mono, monospace">{fmt(vT[2], 1)} °C</text>

      <g clipPath="url(#tri)">
        {/* product regions ("segmentation areas") */}
        {layers.feed && regions && (
          <>
            <path d={`${path(regions.distillate)}Z`} fill={VIZ.qLine} fillOpacity={0.13} stroke={VIZ.qLine} strokeOpacity={0.5} strokeWidth={1} />
            <path d={`${path(regions.bottoms)}Z`} fill={VIZ.qLine} fillOpacity={0.13} stroke={VIZ.qLine} strokeOpacity={0.5} strokeWidth={1} />
          </>
        )}
        {layers.lines &&
          field.map((l, i) => <path key={i} d={path(l.pts)} stroke={VIZ.equilibrium} strokeOpacity={0.55} strokeWidth={1.1} fill="none" />)}
        {layers.lines && layers.arrows && field.map((l, i) => <Arrow key={i} line={l} />)}
        {layers.borders && borders.map((l, i) => <path key={i} d={path(l.pts)} stroke={VIZ.operating} strokeWidth={2.4} fill="none" strokeLinecap="round" />)}
        {layers.feed && regions && <path d={path(regions.line.pts)} stroke={VIZ.qLine} strokeWidth={2} fill="none" />}

        {/* the column: material-balance line and stage profile */}
        {layers.column && column && bXY && (
          <>
            <line x1={dXY.x} y1={dXY.y} x2={bXY.x} y2={bXY.y} stroke={VIZ.textMuted} strokeWidth={1.2} strokeDasharray="5 4" />
            <path d={path(column.stages)} stroke={VIZ.text} strokeWidth={1.6} fill="none" strokeOpacity={column.feasible ? 1 : 0.45} strokeDasharray={column.feasible ? undefined : '2 3'} />
            {column.stages.slice(0, -1).map((s, i) => {
              const q = toXY(s);
              return <circle key={i} cx={q.x} cy={q.y} r={3.2} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={1.5} opacity={column.feasible ? 1 : 0.5} />;
            })}
          </>
        )}
      </g>

      {/* singular points */}
      {layers.points &&
        points
          .filter((p) => p.order !== 'pure')
          .map((p) => {
            const q = toXY(p.x);
            return (
              <g key={p.label}>
                <PointMark p={p} />
                <text x={q.x + 9} y={q.y - 8} fill={VIZ.text} fontSize={10} fontFamily="JetBrains Mono, monospace">
                  {fmt(p.T, 1)} °C
                </text>
              </g>
            );
          })}
      {layers.points &&
        points
          .filter((p) => p.order === 'pure')
          .map((p) => (
            <PointMark key={p.label} p={p} />
          ))}

      {/* products and feed (draggable) */}
      {layers.column && bXY && (
        <g>
          <circle cx={bXY.x} cy={bXY.y} r={6} fill={VIZ.surface} stroke={VIZ.text} strokeWidth={2} />
          <text x={bXY.x + 10} y={bXY.y + 4} fill={VIZ.text} fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">B</text>
        </g>
      )}
      {layers.feed && (
        <g className="cursor-grab" onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag('F'); }}>
          <circle cx={fXY.x} cy={fXY.y} r={16} fill="transparent" />
          <circle cx={fXY.x} cy={fXY.y} r={7} fill={VIZ.qLine} stroke={VIZ.surface} strokeWidth={2} />
          <text x={fXY.x + 11} y={fXY.y + 4} fill={VIZ.text} fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">F</text>
        </g>
      )}
      {layers.column && (
        <g className="cursor-grab" onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag('D'); }}>
          <circle cx={dXY.x} cy={dXY.y} r={16} fill="transparent" />
          <circle cx={dXY.x} cy={dXY.y} r={8} fill={VIZ.text} stroke={VIZ.surface} strokeWidth={2} />
          <text x={dXY.x + 12} y={dXY.y + 4} fill={VIZ.text} fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">D</text>
        </g>
      )}

      {/* cursor readout */}
      {hover && (
        <text x={16} y={H - 14} fill={VIZ.textMuted} fontSize={10} fontFamily="JetBrains Mono, monospace">
          x = ({hover.x.map((v) => v.toFixed(3)).join(', ')}) · T_bubble = {fmt(hover.T, 2)} °C
        </text>
      )}
    </svg>
  );
}
