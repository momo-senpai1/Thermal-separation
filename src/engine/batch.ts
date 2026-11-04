/**
 * Batch distillation of a binary charge (light-key fraction x₀, L₀ moles).
 *
 * Quasi-steady, negligible hold-up, constant molar overflow. With s = L/L₀ the
 * fraction still in the pot and D/L₀ = 1 − s the fraction distilled:
 *
 *   Open distillation (Rayleigh):  ln(L/L₀) = −∫_{x_W}^{x₀} dx / (y*(x) − x)
 *   Batch rectification, v const.: ln(L/L₀) = −∫_{x_W}^{x₀} dx / (x_D(x) − x),
 *       x_D(x_W) such that N stages stepped down from x_D land on x_W
 *   Batch rectification, x_D const.: L/L₀ = (x_D − x₀) / (x_D − x_W),
 *       v(x_W) such that N stages from x_D land on x_W
 *
 * N counts equilibrium stages including the still; the condenser is total.
 * Boil-up: d(V/L₀) = (v + 1)·d(D/L₀).
 */

import { brent } from './numerics';

export type BatchMode = 'rayleigh' | 'constant-reflux' | 'constant-purity';

export interface BatchSpec {
  y: (x: number) => number;
  /** charge composition (light key) */
  x0: number;
  mode: BatchMode;
  /** equilibrium stages incl. the still (rectification modes) */
  N?: number;
  /** reflux ratio (constant-reflux mode) */
  v?: number;
  /** distillate purity (constant-purity mode) */
  xD?: number;
  /** upper limit of the light-key fraction (azeotrope or 1) */
  xMax?: number;
}

export interface BatchPoint {
  /** L/L₀ */
  s: number;
  /** D/L₀ */
  d: number;
  /** still composition */
  xW: number;
  /** instantaneous distillate */
  xD: number;
  /** accumulated distillate (average) */
  xDavg: number;
  /** reflux ratio at this instant (0 for open distillation) */
  v: number;
  /** cumulative boil-up V/L₀ */
  boilup: number;
  /** light-key recovery in the distillate, D·x̄_D / (L₀·x₀) */
  recovery: number;
}

export interface BatchResult {
  ok: boolean;
  error?: string;
  /** why the batch ends where it does */
  endReason: string;
  points: BatchPoint[];
}

const inverse = (y: (x: number) => number, target: number, hi: number) => {
  if (y(0) >= target) return 0;
  if (y(hi) <= target) return hi;
  let lo = 0;
  let h = hi;
  for (let i = 0; i < 70; i++) {
    const m = 0.5 * (lo + h);
    if (y(m) < target) lo = m;
    else h = m;
  }
  return 0.5 * (lo + h);
};

/** Liquid leaving stage N (the still) when the column runs at (x_D, v). */
export function stepDown(y: (x: number) => number, xD: number, v: number, N: number): number {
  const a = v / (v + 1);
  let yn = xD;
  let x = xD;
  for (let n = 1; n <= N; n++) {
    x = inverse(y, yn, x);
    yn = a * x + (1 - a) * xD;
  }
  return x;
}

/** Charge-composition grid, geometric towards zero so the tail is resolved. */
function grid(x0: number, n = 360, ratio = 1e-4): number[] {
  return Array.from({ length: n + 1 }, (_, i) => x0 * ratio ** (i / n));
}

export function simulateBatch(spec: BatchSpec): BatchResult {
  const { y, x0, mode } = spec;
  const xMax = spec.xMax ?? 1;
  if (!(x0 > 0 && x0 < xMax)) {
    return { ok: false, error: `The charge must contain both components and lie below ${xMax < 1 ? 'the azeotrope' : '1'}.`, endReason: '', points: [] };
  }
  const xs = grid(x0);
  const N = Math.max(1, Math.round(spec.N ?? 5));
  const pts: BatchPoint[] = [];
  let lnS = 0;
  let boil = 0;
  let endReason = '';

  const push = (xW: number, xD: number, v: number, s: number, prevD: number) => {
    const d = 1 - s;
    boil += (v + 1) * Math.max(0, d - prevD);
    const xDavg = d > 1e-9 ? (x0 - s * xW) / d : xD;
    pts.push({ s, d, xW, xD, xDavg, v, boilup: boil, recovery: d > 0 ? (d * xDavg) / x0 : 0 });
  };

  if (mode === 'rayleigh' || mode === 'constant-reflux') {
    const v = mode === 'rayleigh' ? 0 : Math.max(0, spec.v ?? 3);
    const xDof = (xW: number) => {
      if (mode === 'rayleigh') return y(xW);
      // x_N(x_D) rises with x_D: find the x_D whose staircase lands on x_W
      const top = xMax - 1e-9;
      if (stepDown(y, top, v, N) <= xW) return top;
      return brent((xd) => stepDown(y, xd, v, N) - xW, xW, top, { tol: 1e-12 });
    };
    let prev = { xW: x0, g: 1 / (xDof(x0) - x0) };
    push(x0, xDof(x0), v, 1, 0);
    for (let i = 1; i < xs.length; i++) {
      const xW = xs[i]!;
      const xD = xDof(xW);
      const g = 1 / Math.max(xD - xW, 1e-14);
      lnS -= 0.5 * (g + prev.g) * (prev.xW - xW); // trapezoid in x
      const s = Math.exp(lnS);
      push(xW, xD, v, s, pts.at(-1)!.d);
      prev = { xW, g };
      if (s < 1e-6) break;
    }
    // light key exhausted: the rest of the pot is (practically) pure heavy component
    const last = pts.at(-1)!;
    if (last.s > 0) push(0, 0, v, 0, last.d);
    endReason = 'Pot boiled to dryness; the last fraction is practically pure heavy component.';
  } else {
    const xD = spec.xD ?? 0.95;
    if (!(xD > y(x0))) {
      return { ok: false, error: 'x_D is no richer than the vapour over the charge — no reflux is needed; raise x_D.', endReason: '', points: [] };
    }
    if (!(xD < xMax)) {
      return { ok: false, error: 'x_D must lie below the azeotrope.', endReason: '', points: [] };
    }
    const vMax = 1e4;
    for (let i = 0; i < xs.length; i++) {
      const xW = xs[i]!;
      // x_N(v) falls with v; above v_max the purity can no longer be held
      if (stepDown(y, xD, vMax, N) > xW) {
        endReason = `x_D = ${xD.toFixed(3)} can no longer be held with ${N} stages (reflux → ∞).`;
        break;
      }
      let v: number;
      if (stepDown(y, xD, 1e-6, N) <= xW) v = 0;
      else v = brent((vv) => stepDown(y, xD, vv, N) - xW, 1e-6, vMax, { tol: 1e-10 });
      const s = (xD - x0) / (xD - xW);
      push(xW, xD, v, s, pts.at(-1)?.d ?? 0);
    }
    if (pts.length < 2) {
      return { ok: false, error: `x_D = ${xD.toFixed(3)} cannot be reached from the charge with ${N} stages, even at total reflux.`, endReason: '', points: [] };
    }
  }

  return { ok: true, endReason, points: pts };
}

/**
 * Interpolate the batch trajectory at a distilled fraction d = D/L₀.
 * For constant purity the still follows exactly from x_W = x_D − (x_D − x₀)/s.
 */
export function batchAt(points: BatchPoint[], d: number, mode?: BatchMode): BatchPoint {
  if (points.length === 0) throw new RangeError('empty trajectory');
  if (d <= points[0]!.d) return points[0]!;
  const last = points.at(-1)!;
  if (d >= last.d) return last;
  let i = 1;
  while (points[i]!.d < d) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const t = (d - a.d) / (b.d - a.d);
  const lerp = (p: number, q: number) => p + t * (q - p);
  const x0 = points[0]!.xW;
  const s = 1 - d;
  const pure = mode === 'constant-purity';
  const xW = pure ? a.xD - (a.xD - x0) / s : lerp(a.xW, b.xW);
  // the receiver follows from the light-key balance, so it closes exactly
  const xDavg = pure ? a.xD : (x0 - s * xW) / d;
  return {
    s,
    d,
    xW,
    xD: lerp(a.xD, b.xD),
    xDavg,
    v: lerp(a.v, b.v),
    boilup: lerp(a.boilup, b.boilup),
    recovery: (d * xDavg) / x0,
  };
}

/** Staircase geometry for the current instant: (x_D, x_D) → N steps → still. */
export function batchStaircase(y: (x: number) => number, xD: number, v: number, N: number) {
  const a = v / (v + 1);
  const path: { x: number; y: number }[] = [{ x: xD, y: xD }];
  const corners: { x: number; y: number; stage: number }[] = [];
  let yn = xD;
  let x = xD;
  for (let n = 1; n <= N; n++) {
    x = inverse(y, yn, x);
    path.push({ x, y: yn });
    corners.push({ x, y: yn, stage: n });
    yn = a * x + (1 - a) * xD;
    if (n < N) path.push({ x, y: yn });
  }
  return { path, corners, xW: x };
}
