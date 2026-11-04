/**
 * Extraction cascades on the loading diagram (carrier and solvent immiscible).
 *
 *   X — solute per unit solute-free carrier (raffinate side), flow L̇
 *   Y — solute per unit solute-free solvent (extract side), flow Ġ
 *   r = Ġ/L̇  solvent ratio (per stage for cross-current, overall for counter-current)
 *
 * Cross-current: every stage gets fresh solvent at Y₀, so each stage has its own
 * operating line from (X_{i−1}, Y₀) with slope −L̇/Ġ:
 *     Y_i = Y₀ + (L̇/Ġ)(X_{i−1} − X_i),   Y_i = Y*(X_i)
 * Counter-current: one operating line through (X_N, Y₀) with slope L̇/Ġ:
 *     Y = Y₀ + (L̇/Ġ)(X − X_N)
 * stepped off from the feed end (X₀, Y₁): across to the curve, down to the line.
 */

import { brent } from '../numerics';

export interface Curve {
  Ystar: (x: number) => number;
  Xstar: (y: number) => number;
  Xmax: number;
}

export type ExtractionTarget = 'stages' | 'raffinate' | 'solvent';

export interface CascadeSpec {
  curve: Curve;
  X0: number;
  Y0: number;
  XN: number;
  /** Ġ/L̇ */
  r: number;
  target: ExtractionTarget;
  /** stages for the 'raffinate' and 'solvent' targets */
  N: number;
}

export interface CrossStage {
  stage: number;
  /** raffinate entering (from the stage before) */
  Xin: number;
  X: number;
  Y: number;
  /** extraction factor λ = K·Ġ/L̇, K the local slope of the equilibrium curve Y*(X) */
  lambda: number;
}

export interface CascadeResult {
  ok: boolean;
  error?: string;
  /** solved / specified values */
  r: number;
  XN: number;
  /** whole stages (cross-current) or fractional stages (counter-current) */
  N: number;
  /** raffinate actually leaving the last stage */
  Xout: number;
  /** pooled extract loading */
  Yout: number;
  /** fraction of the solute extracted */
  extracted: number;
  /** total solvent per carrier */
  solventTotal: number;
  /** lowest raffinate any cascade can reach with solvent at Y₀ */
  Xlimit: number;
}

const slope = (c: Curve, x: number) => {
  const h = Math.max(1e-7, x * 1e-4);
  return (c.Ystar(x + h) - c.Ystar(Math.max(0, x - h))) / (x + h - Math.max(0, x - h));
};

// ---------------------------------------------------------------------------
// Cross-current
// ---------------------------------------------------------------------------

/** One cross-current stage: raffinate leaving for feed X_in and solvent ratio r. */
export function crossStage(c: Curve, Xin: number, Y0: number, r: number): number {
  const lim = c.Xstar(Y0);
  if (Xin <= lim + 1e-15) return Xin;
  return brent((x) => c.Ystar(x) - Y0 - (Xin - x) / r, lim, Xin, { tol: 1e-15 });
}

export interface CrossResult extends CascadeResult {
  stages: CrossStage[];
}

function crossRun(c: Curve, X0: number, Y0: number, r: number, until: { XN?: number; N?: number }) {
  const stages: CrossStage[] = [];
  let x = X0;
  for (let i = 1; i <= 200; i++) {
    const xn = crossStage(c, x, Y0, r);
    stages.push({ stage: i, Xin: x, X: xn, Y: c.Ystar(xn), lambda: slope(c, xn) * r });
    x = xn;
    if (until.N !== undefined && i >= until.N) break;
    if (until.XN !== undefined && x <= until.XN + 1e-15) break;
    if (Math.abs(stages.at(-1)!.Xin - xn) < 1e-14) break;
  }
  return stages;
}

export function solveCross(spec: CascadeSpec): CrossResult {
  const { curve: c, X0, Y0, target } = spec;
  const Xlimit = c.Xstar(Y0);
  const fail = (error: string): CrossResult => ({
    ok: false, error, r: spec.r, XN: spec.XN, N: Number.NaN, Xout: Number.NaN, Yout: Number.NaN,
    extracted: Number.NaN, solventTotal: Number.NaN, Xlimit, stages: [],
  });
  if (!(X0 > Xlimit)) return fail('The feed is already at or below X*(Y₀): the solvent cannot take up any solute.');
  let r = spec.r;
  let XN = spec.XN;
  let stages: CrossStage[];
  if (target === 'stages') {
    if (!(XN > Xlimit)) return fail(`No cross-current cascade gets the raffinate below X*(Y₀) = ${Xlimit.toPrecision(3)}.`);
    if (!(XN < X0)) return fail('The raffinate specification must lie below the feed.');
    stages = crossRun(c, X0, Y0, r, { XN });
    if (stages.at(-1)!.X > XN + 1e-12) return fail('More than 200 stages — raise the solvent ratio.');
  } else if (target === 'raffinate') {
    stages = crossRun(c, X0, Y0, r, { N: Math.round(spec.N) });
    XN = stages.at(-1)!.X;
  } else {
    if (!(XN > Xlimit && XN < X0)) return fail('The raffinate specification must lie between X*(Y₀) and the feed.');
    const N = Math.round(spec.N);
    const g = (rr: number) => crossRun(c, X0, Y0, rr, { N }).at(-1)!.X - XN;
    if (g(1e5) > 0) return fail(`Even unlimited solvent cannot reach X_N in ${N} stage${N > 1 ? 's' : ''}.`);
    r = brent((lr) => g(Math.exp(lr)), Math.log(1e-6), Math.log(1e5), { tol: 1e-12 });
    r = Math.exp(r);
    stages = crossRun(c, X0, Y0, r, { N });
  }
  const N = stages.length;
  const Xout = stages.at(-1)!.X;
  const solventTotal = N * r;
  return {
    ok: true, r, XN, N, Xout,
    Yout: Y0 + (X0 - Xout) / solventTotal,
    extracted: (X0 - Xout) / X0,
    solventTotal, Xlimit, stages,
  };
}

// ---------------------------------------------------------------------------
// Counter-current
// ---------------------------------------------------------------------------

export interface CounterStage {
  stage: number;
  /** extract leaving the stage */
  Y: number;
  /** raffinate leaving the stage (in equilibrium with Y) */
  X: number;
  /** extract entering from the stage below, on the operating line at X */
  Ybelow: number;
  partial: boolean;
}

export interface CounterResult extends CascadeResult {
  stages: CounterStage[];
  /** extract leaving stage 1 */
  Y1: number;
  /** minimum solvent ratio (operating line touches the curve) */
  rMin: number;
  /** solvent ratio at which one stage suffices */
  rOne: number;
}

/** Minimum Ġ/L̇: the operating line from (X_N, Y₀) touches the curve somewhere in [X_N, X₀]. */
export function counterMinRatio(c: Curve, X0: number, Y0: number, XN: number): number {
  let best = 0;
  const n = 400;
  for (let i = 1; i <= n; i++) {
    const x = XN + ((X0 - XN) * i) / n;
    const d = c.Ystar(x) - Y0;
    if (d <= 0) return Number.POSITIVE_INFINITY;
    best = Math.max(best, (x - XN) / d);
  }
  return best;
}

function counterRun(c: Curve, X0: number, Y0: number, XN: number, r: number) {
  const op = (x: number) => Y0 + (x - XN) / r;
  const Y1 = op(X0);
  const stages: CounterStage[] = [];
  let y = Y1;
  let xPrev = X0;
  for (let n = 1; n <= 200; n++) {
    const x = c.Xstar(y);
    if (!(x < xPrev - 1e-14)) return { ok: false as const, stages, Y1, N: Number.NaN };
    const partial = x <= XN;
    stages.push({ stage: n, Y: y, X: x, Ybelow: op(x), partial });
    if (partial) return { ok: true as const, stages, Y1, N: n - 1 + (xPrev - XN) / (xPrev - x) };
    xPrev = x;
    y = op(x);
  }
  return { ok: false as const, stages, Y1, N: Number.NaN };
}

export function solveCounter(spec: CascadeSpec): CounterResult {
  const { curve: c, X0, Y0, target } = spec;
  const Xlimit = c.Xstar(Y0);
  let r = spec.r;
  let XN = spec.XN;
  const fail = (error: string, extra: Partial<CounterResult> = {}): CounterResult => ({
    ok: false, error, r, XN, N: Number.NaN, Xout: Number.NaN, Yout: Number.NaN, extracted: Number.NaN,
    solventTotal: Number.NaN, Xlimit, stages: [], Y1: Number.NaN, rMin: Number.NaN, rOne: Number.NaN, ...extra,
  });
  if (!(X0 > Xlimit)) return fail('The feed is already at or below X*(Y₀).');

  if (target === 'raffinate') {
    const N = Math.round(spec.N);
    const f = (xn: number) => {
      const run = counterRun(c, X0, Y0, xn, r);
      return run.ok ? run.N - N : Number.POSITIVE_INFINITY;
    };
    const lo = Xlimit + (X0 - Xlimit) * 1e-9;
    const hi = X0 * (1 - 1e-9);
    if (f(hi) > 0) return fail('The solvent ratio is too low for any extraction.');
    // N(X_N) falls as X_N rises: find where it equals N
    let a = lo;
    let b = hi;
    if (f(a) <= 0) XN = a;
    else {
      for (let i = 0; i < 100; i++) {
        const m = 0.5 * (a + b);
        if (f(m) > 0) a = m;
        else b = m;
      }
      XN = b;
    }
  } else {
    if (!(XN > Xlimit)) return fail(`The raffinate cannot go below X*(Y₀) = ${Xlimit.toPrecision(3)}.`);
    if (!(XN < X0)) return fail('The raffinate specification must lie below the feed.');
  }

  const rMin = counterMinRatio(c, X0, Y0, XN);
  const rOne = (X0 - XN) / (c.Ystar(XN) - Y0);

  if (target === 'solvent') {
    const N = Math.round(spec.N);
    const f = (rr: number) => {
      const run = counterRun(c, X0, Y0, XN, rr);
      return run.ok ? run.N - N : Number.POSITIVE_INFINITY;
    };
    if (N <= 1) r = rOne;
    else {
      let a = rMin * (1 + 1e-9);
      let b = Math.max(rOne, rMin * 2);
      while (f(b) > 0) b *= 2;
      for (let i = 0; i < 100; i++) {
        const m = 0.5 * (a + b);
        if (f(m) > 0) a = m;
        else b = m;
      }
      r = b;
    }
  }

  if (!(r > rMin)) return fail(`Below the minimum solvent ratio Ġ/L̇_min = ${rMin.toFixed(4)}: the operating line touches the curve.`, { rMin, rOne });
  const run = counterRun(c, X0, Y0, XN, r);
  if (!run.ok) return fail('More than 200 stages — too close to the minimum solvent ratio.', { rMin, rOne });
  const Xout = XN;
  return {
    ok: true, r, XN, N: run.N, Xout,
    Yout: run.Y1,
    extracted: (X0 - Xout) / X0,
    solventTotal: r, Xlimit, stages: run.stages, Y1: run.Y1, rMin, rOne,
  };
}

/** Kremser (constant K): counter-current fractional recovery for N stages, E = K·Ġ/L̇. */
export const kremserCounter = (E: number, N: number) =>
  Math.abs(E - 1) < 1e-12 ? N / (N + 1) : (E ** (N + 1) - E) / (E ** (N + 1) - 1);
