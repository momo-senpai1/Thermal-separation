import { VIZ } from '@/components/analysis/vizTokens';
import type { HNResult } from '@/engine/extraction/hunterNash';
import { binodal } from '@/engine/extraction/hunterNash';
import type { LLESystem, W3 } from '@/engine/extraction/lle';
import { fmt } from '@/lib/utils';

const SIDE = 520;
const TH = (SIDE * Math.sqrt(3)) / 2;
// triangle: solute A top, carrier C bottom-left, solvent S bottom-right
const TOP = { x: 0, y: 0 };
const BL = { x: -SIDE / 2, y: TH };
const BR = { x: SIDE / 2, y: TH };
const xy = (w: readonly number[]) => ({
  x: w[0]! * TOP.x + w[1]! * BL.x + w[2]! * BR.x,
  y: w[0]! * TOP.y + w[1]! * BL.y + w[2]! * BR.y,
});
const d = (pts: readonly (readonly number[])[], close = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${xy(p).x.toFixed(2)},${xy(p).y.toFixed(2)}`).join('') + (close ? 'Z' : '');

export interface HNLayers {
  tieLines: boolean;
  construction: boolean;
  stages: boolean;
  pole: boolean;
}

function Dot({ w, label, kind = 'solid', dx = 10, dy = -8 }: { w: W3; label: string; kind?: 'solid' | 'hollow' | 'accent'; dx?: number; dy?: number }) {
  const p = xy(w);
  return (
    <g>
      <circle
        cx={p.x}
        cy={p.y}
        r={kind === 'accent' ? 6 : 5}
        fill={kind === 'hollow' ? VIZ.surface : kind === 'accent' ? VIZ.qLine : VIZ.text}
        stroke={kind === 'hollow' ? VIZ.text : VIZ.surface}
        strokeWidth={2}
      />
      <text x={p.x + dx} y={p.y + dy} fill={VIZ.text} fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">
        {label}
      </text>
    </g>
  );
}

export function HunterNashDiagram({ sys, r, layers }: { sys: LLESystem; r: HNResult; layers: HNLayers }) {
  const ties = sys.tieLines ?? [];
  const bin = binodal(sys);
  // extend the view to include the pole when it is not too far away
  const pole = r.pole ? xy(r.pole) : null;
  const poleInView = pole && Math.abs(pole.x) < SIDE * 1.6 && pole.y > -TH * 0.9 && pole.y < TH * 2.2;
  const xs = [BL.x, BR.x, ...(poleInView && layers.pole ? [pole!.x] : [])];
  const ys = [TOP.y, BL.y, ...(poleInView && layers.pole ? [pole!.y] : [])];
  const pad = 70;
  const vb = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad + 20 };

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
      grid.push(d([p1, p2]));
    }
  }
  const opLines: { from: W3; to: W3 }[] = [];
  if (layers.pole && r.stages.length > 1) {
    for (let i = 0; i < r.stages.length - 1; i++) {
      const Rn = r.stages[i]!.R;
      const En1 = r.stages[i + 1]!.E;
      opLines.push({ from: Rn, to: En1 });
    }
  }

  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-auto w-full" role="img" aria-label={`Hunter–Nash diagram for ${sys.name}`}>
      <path d={d([[1, 0, 0], [0, 1, 0], [0, 0, 1]], true)} fill="rgba(148,163,184,0.025)" stroke={VIZ.axis} strokeWidth={1.2} />
      {grid.map((g, i) => (
        <path key={i} d={g} stroke={VIZ.grid} fill="none" />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((v) => {
        const l = xy([v, 1 - v, 0]);
        const b = xy([0, 1 - v, v]);
        return (
          <g key={v} fill={VIZ.textFaint} fontSize={10} fontFamily="JetBrains Mono, monospace">
            <text x={l.x - 8} y={l.y + 3} textAnchor="end">{v.toFixed(1)}</text>
            <text x={b.x} y={b.y + 16} textAnchor="middle">{v.toFixed(1)}</text>
          </g>
        );
      })}
      <text x={TOP.x} y={TOP.y - 14} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">A — {sys.solute}</text>
      <text x={BL.x - 8} y={BL.y + 34} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">C — {sys.carrier}</text>
      <text x={BR.x + 8} y={BR.y + 34} textAnchor="middle" fill={VIZ.text} fontSize={13} fontWeight={600} fontFamily="Inter, sans-serif">S — {sys.solvent}</text>
      <text x={0} y={BL.y + 34} textAnchor="middle" fill={VIZ.textMuted} fontSize={10} fontFamily="Inter, sans-serif">← solvent mass fraction →  ·  left edge: solute mass fraction</text>

      {/* binodal and tie lines */}
      <path d={d(bin)} stroke={VIZ.equilibrium} strokeWidth={2} fill="rgba(57,135,229,0.06)" />
      {!sys.plait && ties.length > 0 && <path d={d([ties.at(-1)!.R, ties.at(-1)!.E])} stroke={VIZ.equilibrium} strokeWidth={1.2} strokeDasharray="3 3" />}
      {layers.tieLines &&
        ties.filter((_, i) => i % Math.max(1, Math.round(ties.length / 12)) === 0).map((t, i) => (
          <path key={i} d={d([t.R, t.E])} stroke={VIZ.equilibrium} strokeOpacity={0.45} strokeWidth={1} />
        ))}

      {/* construction: F–S mixing line, R_N–M–E₁ */}
      {layers.construction && (
        <>
          <path d={d([r.F, r.S])} stroke={VIZ.textFaint} strokeDasharray="5 4" strokeWidth={1.2} />
          {r.E1 && <path d={d([r.RN, r.E1])} stroke={VIZ.textFaint} strokeDasharray="5 4" strokeWidth={1.2} />}
        </>
      )}
      {/* pole construction */}
      {layers.pole && (
        <>
          {/* operating lines R_n → E_{n+1} all point at the pole; extended to it when it is in view */}
          {opLines.map((o, i) => (
            <path key={i} d={d([r.pole && poleInView ? r.pole : o.from, o.to])} stroke={VIZ.operating} strokeWidth={1.2} strokeOpacity={0.75} />
          ))}
          {r.pole && poleInView && (
            <>
              <path d={d([r.pole, r.S])} stroke={VIZ.operating} strokeWidth={1.2} strokeOpacity={0.75} />
              {r.E1 && <path d={d([r.pole, r.F])} stroke={VIZ.operating} strokeWidth={1.2} strokeOpacity={0.75} />}
            </>
          )}
        </>
      )}
      {/* stages: tie lines E_n – R_n */}
      {layers.stages &&
        r.stages.map((s) => {
          const m = xy([(s.E[0] + s.R[0]) / 2, (s.E[1] + s.R[1]) / 2, (s.E[2] + s.R[2]) / 2]);
          return (
            <g key={s.stage}>
              <path d={d([s.E, s.R])} stroke={VIZ.text} strokeWidth={1.6} strokeDasharray={s.partial ? '3 3' : undefined} />
              <circle cx={xy(s.E).x} cy={xy(s.E).y} r={3} fill={VIZ.text} />
              <circle cx={xy(s.R).x} cy={xy(s.R).y} r={3} fill={VIZ.text} />
              <text x={m.x} y={m.y - 5} textAnchor="middle" fill={VIZ.text} fontSize={10} fontFamily="JetBrains Mono, monospace">{s.stage}</text>
            </g>
          );
        })}

      <Dot w={r.F} label="F" kind="accent" dx={-20} />
      <Dot w={r.S} label="S" dx={8} dy={-10} />
      {layers.construction && <Dot w={r.M} label="M" kind="hollow" />}
      <Dot w={r.RN} label="R_N" kind="hollow" dx={-34} dy={4} />
      {r.E1 && <Dot w={r.E1} label="E₁" dx={8} dy={-10} />}
      {layers.pole && r.pole && poleInView && (
        <g>
          <path d={`M${pole!.x},${pole!.y - 8}L${pole!.x + 8},${pole!.y}L${pole!.x},${pole!.y + 8}L${pole!.x - 8},${pole!.y}Z`} fill={VIZ.operating} stroke={VIZ.surface} strokeWidth={2} />
          <text x={pole!.x + 12} y={pole!.y + 4} fill={VIZ.text} fontSize={12} fontWeight={600} fontFamily="Inter, sans-serif">Δ (pole)</text>
        </g>
      )}
      {layers.pole && r.pole && !poleInView && (
        <text x={vb.x + 10} y={vb.y + 16} fill={VIZ.textMuted} fontSize={10} fontFamily="JetBrains Mono, monospace">
          pole Δ off the chart at ({r.pole.map((v) => fmt(v, 2)).join(', ')})
        </text>
      )}
    </svg>
  );
}
