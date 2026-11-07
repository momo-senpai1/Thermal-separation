/**
 * Hunter–Nash construction for a counter-current extraction cascade on the
 * ternary diagram (mass fractions; carrier and solvent partly miscible).
 *
 *   mixing point   M = (F + s·S)/(1 + s),           s = S/F
 *   first extract  E₁ on the extract branch, on the line R_N → M
 *   pole (difference point)  Δ = F − E₁ = R_N − S   (net flow, the same between every stage pair)
 *   stage n:  R_n is the tie-line partner of E_n;  E_{n+1} lies on the line Δ → R_n.
 *
 * Stepping from the feed end until the raffinate solute falls below R_N; the last
 * step counts fractionally. The minimum solvent ratio is where a tie line lines
 * up with the pole (the stepping pinches); the maximum is where M reaches the
 * extract branch (beyond it the mixture is single-phase).
 */

import type { LLESystem, TieLine, W3 } from './lle';

type P2 = { x: number; y: number };
/** 2-D working coordinates: x = solvent fraction, y = solute fraction. */
const p2 = (w: W3): P2 => ({ x: w[2], y: w[0] });
const w3 = (p: P2): W3 => [p.y, 1 - p.x - p.y, p.x];

export interface HNSpec {
  sys: LLESystem;
  /** feed solute mass fraction (solvent-free feed) */
  wF: number;
  /** solute mass fraction of the entering solvent */
  wS: number;
  /** raffinate solute specification */
  wRN: number;
  /** solvent-to-feed mass ratio */
  s: number;
}

export interface HNStage {
  stage: number;
  E: W3;
  R: W3;
  partial: boolean;
}

export interface HNResult {
  ok: boolean;
  error?: string;
  F: W3;
  S: W3;
  M: W3;
  RN: W3;
  E1: W3 | null;
  /** pole; null when it lies at infinity (operating lines parallel) */
  pole: W3 | null;
  /** direction of the operating lines when the pole is at infinity */
  poleDir: P2 | null;
  stages: HNStage[];
  N: number;
  sMin: number;
  sMax: number;
  /** extract and raffinate mass per unit feed */
  Emass: number;
  Rmass: number;
}

// ---------------------------------------------------------------------------
// binodal helpers
// ---------------------------------------------------------------------------

function branches(ties: TieLine[], plait: W3 | null) {
  const R = ties.map((t) => p2(t.R));
  const E = ties.map((t) => p2(t.E));
  if (plait) {
    R.push(p2(plait));
    E.push(p2(plait));
  }
  return { R, E };
}

/** Interpolate along the tie lines by the solute content of one phase. */
function partner(ties: TieLine[], plait: W3 | null, w: P2, from: 'E' | 'R'): P2 {
  const A = ties.map((t) => p2(from === 'E' ? t.E : t.R));
  const B = ties.map((t) => p2(from === 'E' ? t.R : t.E));
  if (plait) {
    A.push(p2(plait));
    B.push(p2(plait));
  }
  if (w.y <= A[0]!.y) return B[0]!;
  for (let i = 1; i < A.length; i++) {
    if (w.y <= A[i]!.y) {
      const t = (w.y - A[i - 1]!.y) / (A[i]!.y - A[i - 1]!.y);
      return { x: B[i - 1]!.x + t * (B[i]!.x - B[i - 1]!.x), y: B[i - 1]!.y + t * (B[i]!.y - B[i - 1]!.y) };
    }
  }
  return B.at(-1)!;
}

/** Point on a branch at a given solute fraction. */
function onBranch(branch: P2[], y: number): P2 {
  if (y <= branch[0]!.y) return branch[0]!;
  for (let i = 1; i < branch.length; i++) {
    if (y <= branch[i]!.y) {
      const t = (y - branch[i - 1]!.y) / (branch[i]!.y - branch[i - 1]!.y);
      return { x: branch[i - 1]!.x + t * (branch[i]!.x - branch[i - 1]!.x), y };
    }
  }
  return branch.at(-1)!;
}

/** Intersection of the line P + t·d with a polyline; returns the t > tMin closest to tMin. */
function intersect(P: P2, d: P2, poly: P2[], tMin = 1e-9): { at: P2; t: number } | null {
  let best: { at: P2; t: number } | null = null;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const e = { x: b.x - a.x, y: b.y - a.y };
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-15) continue;
    const w = { x: a.x - P.x, y: a.y - P.y };
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * d.y - w.y * d.x) / den;
    if (u >= -1e-9 && u <= 1 + 1e-9 && t > tMin && (!best || t < best.t)) best = { at: { x: P.x + t * d.x, y: P.y + t * d.y }, t };
  }
  return best;
}


// ---------------------------------------------------------------------------
// construction
// ---------------------------------------------------------------------------

function construct(spec: HNSpec, s: number) {
  const ties = spec.sys.tieLines!;
  const { R: Rb, E: Eb } = branches(ties, spec.sys.plait);
  const F: P2 = { x: 0, y: spec.wF };
  const S: P2 = { x: 1 - spec.wS, y: spec.wS };
  const RN = onBranch(Rb, spec.wRN);
  const M: P2 = { x: (F.x + s * S.x) / (1 + s), y: (F.y + s * S.y) / (1 + s) };
  const hit = intersect(RN, { x: M.x - RN.x, y: M.y - RN.y }, Eb, 1e-9);
  const base = { F, S, M, RN };
  if (!hit || hit.t < 1) return { ...base, ok: false as const, reason: 'single-phase' as const };
  const E1 = hit.at;
  const Emass = (1 + s) / hit.t; // lever rule along R_N → M → E₁
  const Rmass = 1 + s - Emass;
  // pole Δ = (F − E·E₁)/(1 − E)
  const den = 1 - Emass;
  const pole = Math.abs(den) > 1e-9 ? { x: (F.x - Emass * E1.x) / den, y: (F.y - Emass * E1.y) / den } : null;
  const poleDir = pole ? null : { x: F.x - E1.x, y: F.y - E1.y };

  const stages: { stage: number; E: P2; R: P2; partial: boolean }[] = [];
  let E = E1;
  let prevR = F;
  for (let n = 1; n <= 150; n++) {
    const R = partner(ties, spec.sys.plait, E, 'E');
    const partial = R.y <= RN.y + 1e-12;
    stages.push({ stage: n, E, R, partial });
    if (partial) {
      const N = n - 1 + (prevR.y - RN.y) / (prevR.y - R.y);
      return { ...base, ok: true as const, E1, pole, poleDir, stages, N, Emass, Rmass };
    }
    if (!(R.y < prevR.y - 1e-10)) return { ...base, ok: false as const, reason: 'pinch' as const, E1, pole, poleDir, stages, Emass, Rmass };
    // next extract on the line Δ → R_n, continued to the extract branch
    const d = pole ? { x: R.x - pole.x, y: R.y - pole.y } : poleDir!;
    const nx = pole ? intersect(R, d, Eb, 1e-9) ?? intersect(R, { x: -d.x, y: -d.y }, Eb, 1e-9) : intersect(R, d, Eb, 1e-9) ?? intersect(R, { x: -d.x, y: -d.y }, Eb, 1e-9);
    if (!nx) return { ...base, ok: false as const, reason: 'pinch' as const, E1, pole, poleDir, stages, Emass, Rmass };
    if (!(nx.at.y < E.y - 1e-10)) return { ...base, ok: false as const, reason: 'pinch' as const, E1, pole, poleDir, stages, Emass, Rmass };
    prevR = R;
    E = nx.at;
  }
  return { ...base, ok: false as const, reason: 'pinch' as const, E1, pole, poleDir, stages, Emass, Rmass };
}

export function solveHunterNash(spec: HNSpec): HNResult {
  const sys = spec.sys;
  const empty = (error: string, extra: Partial<HNResult> = {}): HNResult => ({
    ok: false, error, F: [spec.wF, 1 - spec.wF, 0], S: [spec.wS, 0, 1 - spec.wS], M: [0, 0, 0], RN: [0, 0, 0], E1: null,
    pole: null, poleDir: null, stages: [], N: Number.NaN, sMin: Number.NaN, sMax: Number.NaN, Emass: Number.NaN, Rmass: Number.NaN, ...extra,
  });
  if (!sys.tieLines) return empty('This system has distribution data only (immiscible carrier and solvent) — use the loading-diagram tools.');
  const Rb = branches(sys.tieLines, sys.plait).R;
  if (!(spec.wRN > Rb[0]!.y && spec.wRN < spec.wF)) return empty('The raffinate specification must lie between the first tie line and the feed.');

  // The two-phase window is an interval: too little solvent leaves M next to the
  // (single-phase) feed, too much puts it beyond the extract branch. Scan for it,
  // then bisect both ends; the minimum ratio is the larger of the window's lower
  // end and the tie-line pinch.
  const feasible = (s: number) => construct(spec, s).ok;
  const twoPhase = (s: number) => {
    const c = construct(spec, s);
    return !(c.ok === false && c.reason === 'single-phase');
  };
  const grid = Array.from({ length: 81 }, (_, i) => 10 ** (-3 + (6 * i) / 80));
  const firstFeasible = grid.findIndex(feasible);
  let sMin = Number.NaN;
  let sMax = Number.NaN;
  if (firstFeasible >= 0) {
    const bis = (a: number, b: number, okAtB: (s: number) => boolean) => {
      for (let i = 0; i < 70; i++) {
        const m = Math.sqrt(a * b);
        if (okAtB(m)) b = m;
        else a = m;
      }
      return b;
    };
    sMin = firstFeasible === 0 ? grid[0]! : bis(grid[firstFeasible - 1]!, grid[firstFeasible]!, feasible);
    let k = firstFeasible;
    while (k + 1 < grid.length && twoPhase(grid[k + 1]!)) k++;
    sMax = k + 1 >= grid.length ? Number.POSITIVE_INFINITY : 1 / bis(1 / grid[k + 1]!, 1 / grid[k]!, (inv) => twoPhase(1 / inv));
  }

  const c = construct(spec, spec.s);
  const W = (p: P2) => w3(p);
  const common = {
    F: W(c.F), S: W(c.S), M: W(c.M), RN: W(c.RN), sMin, sMax,
  };
  if (!c.ok) {
    const msg =
      c.reason === 'single-phase'
        ? Number.isFinite(sMax) && spec.s > sMax
          ? `Too much solvent: the mixing point M leaves the two-phase region (S/F_max ≈ ${sMax.toFixed(3)}).`
          : `Too little solvent: the mixing point M lies outside the two-phase region (S/F_min ≈ ${Number.isFinite(sMin) ? sMin.toFixed(3) : '—'}).`
        : `Below the minimum solvent ratio (S/F_min ≈ ${Number.isFinite(sMin) ? sMin.toFixed(3) : '—'}): a tie line lines up with the pole and the stages pinch.`;
    return {
      ...empty(msg),
      ...common,
      E1: 'E1' in c && c.E1 ? W(c.E1) : null,
      pole: 'pole' in c && c.pole ? W(c.pole) : null,
      poleDir: 'poleDir' in c ? c.poleDir ?? null : null,
      stages: 'stages' in c ? c.stages.map((st) => ({ stage: st.stage, E: W(st.E), R: W(st.R), partial: st.partial })) : [],
    };
  }
  return {
    ok: true,
    ...common,
    E1: W(c.E1),
    pole: c.pole ? W(c.pole) : null,
    poleDir: c.poleDir,
    stages: c.stages.map((st) => ({ stage: st.stage, E: W(st.E), R: W(st.R), partial: st.partial })),
    N: c.N,
    Emass: c.Emass,
    Rmass: c.Rmass,
  };
}

/** Binodal outline (raffinate branch up to the plait, extract branch back down) for drawing. */
export function binodal(sys: LLESystem): W3[] {
  if (!sys.tieLines) return [];
  const R = sys.tieLines.map((t) => t.R);
  const E = sys.tieLines.map((t) => t.E);
  return [...R, ...(sys.plait ? [sys.plait] : []), ...E.reverse()];
}
