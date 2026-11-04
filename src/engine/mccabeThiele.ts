/**
 * McCabe–Thiele binary rectification (rating mode).
 *
 * Assumptions: constant molar overflow (CMO), constant relative volatility α,
 * theoretical (equilibrium) stages, saturated reflux.
 *
 * Stage convention
 *   • `theoreticalStages` N counts every equilibrium stage in the column,
 *     including the partial reboiler (stage N).
 *   • Total condenser  → 0 equilibrium stages (y₁ = x_D).
 *   • Partial condenser → +1 equilibrium stage on top (stage 0): the vapour
 *     distillate y_D is in equilibrium with the reflux x₀.
 *
 * Rating problem: given N, R, D/F and the feed (F, z_F, q), find x_D and x_B.
 * For a trial x_D, x_B follows from the component balance; the column is stepped
 * down from the top with optimal feed location, and x_D is adjusted (Brent)
 * until the liquid leaving the reboiler equals x_B.
 *
 * Operating lines
 *   rectifying  y = R/(R+1)·x + x_D/(R+1)          (L = R·D,       V = (R+1)·D)
 *   stripping   y = (L'/V')·x − (B/V')·x_B          (L' = L + qF,   V' = V − (1−q)F)
 *   q-line      y = q/(q−1)·x − z_F/(q−1)           ⇔  q·x + (1−q)·y = z_F
 */

import { brent, ConvergenceError } from './numerics';
import { xFromAlpha, yFromAlpha } from './thermodynamics';

export interface ColumnSpec {
  alpha: number;
  /** feed molar flow, kmol/h */
  F: number;
  /** feed light-key fraction */
  zF: number;
  /** feed thermal condition */
  q: number;
  /** equilibrium stages in the column incl. reboiler */
  N: number;
  /** reflux ratio L/D */
  R: number;
  /** distillate-to-feed ratio D/F */
  DF: number;
  condenser: 'total' | 'partial';
}

export interface StageStep {
  /** 0 = partial condenser, 1…N = column stages (N = reboiler) */
  stage: number;
  /** liquid leaving the stage */
  x: number;
  /** vapour leaving the stage */
  y: number;
  section: 'condenser' | 'rectifying' | 'stripping';
}

export interface OperatingLine {
  slope: number;
  intercept: number;
}

export interface McCabeThieleResult {
  xD: number;
  xB: number;
  D: number;
  B: number;
  /** liquid / vapour flows in rectifying (L, V) and stripping (Lp, Vp) sections */
  L: number;
  V: number;
  Lp: number;
  Vp: number;
  /** first stage (from top) stepped on the stripping line */
  feedStage: number;
  steps: StageStep[];
  rectifying: OperatingLine;
  stripping: OperatingLine;
  /** intersection of the operating lines (lies on the q-line) */
  intersection: { x: number; y: number };
  /** intersection of the q-line with the equilibrium curve */
  pinch: { x: number; y: number };
  /** minimum reflux ratio for the achieved x_D (Underwood/pinch, binary) */
  Rmin: number;
  /** Fenske minimum number of equilibrium stages for the achieved split */
  Nmin: number;
  /** reflux at the top: x of reflux liquid (= x_D for total condenser) */
  xReflux: number;
  /** vapour leaving stage 1 */
  yTop: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Point where the q-line meets the equilibrium curve: q·x + (1−q)·y_eq(x) = z_F. */
export function qLinePinch(alpha: number, zF: number, q: number): { x: number; y: number } {
  if (Math.abs(q - 1) < 1e-12) return { x: zF, y: yFromAlpha(alpha, zF) };
  const x = brent((x) => q * x + (1 - q) * yFromAlpha(alpha, x) - zF, 0, 1, { tol: 1e-13 });
  return { x, y: yFromAlpha(alpha, x) };
}

/** Minimum reflux: rectifying line through (x_D, x_D) and the q-line pinch. */
export function minimumReflux(alpha: number, zF: number, q: number, xD: number): number {
  const p = qLinePinch(alpha, zF, q);
  return Math.max(0, (xD - p.y) / (p.y - p.x));
}

/** Fenske: N_min = ln[(x_D/(1−x_D))·((1−x_B)/x_B)] / ln α (equilibrium stages incl. reboiler). */
export function fenskeMinimumStages(alpha: number, xD: number, xB: number): number {
  return Math.log((xD / (1 - xD)) * ((1 - xB) / xB)) / Math.log(alpha);
}

interface Profile {
  steps: StageStep[];
  feedStage: number;
  xBottom: number;
  L: number;
  V: number;
  Lp: number;
  Vp: number;
  rect: OperatingLine;
  strip: OperatingLine;
  xInt: number;
  xReflux: number;
  yTop: number;
}

/** Step N stages down from the top for a trial x_D. */
function stepColumn(s: ColumnSpec, xD: number): Profile {
  const D = s.DF * s.F;
  const B = s.F - D;
  const xB = (s.F * s.zF - D * xD) / B;
  const L = s.R * D;
  const V = (s.R + 1) * D;
  const Lp = L + s.q * s.F;
  const Vp = V - (1 - s.q) * s.F;
  if (Vp <= 0) {
    throw new ConvergenceError(
      'No stripping vapour (V′ ≤ 0): the feed is too vaporised for this reflux — raise R or q.',
    );
  }
  const rect: OperatingLine = { slope: L / V, intercept: (D * xD) / V };
  const strip: OperatingLine = { slope: Lp / Vp, intercept: (-B * xB) / Vp };
  const xInt = (strip.intercept - rect.intercept) / (rect.slope - strip.slope);

  const steps: StageStep[] = [];
  let y: number;
  let xReflux = xD;
  if (s.condenser === 'partial') {
    xReflux = xFromAlpha(s.alpha, xD);
    steps.push({ stage: 0, x: xReflux, y: xD, section: 'condenser' });
    y = rect.slope * xReflux + rect.intercept;
  } else {
    y = xD;
  }
  const yTop = y;

  let section: 'rectifying' | 'stripping' = 'rectifying';
  let feedStage = s.N + 1;
  let x = xD;
  for (let n = 1; n <= s.N; n++) {
    x = clamp01(xFromAlpha(s.alpha, clamp01(y)));
    // optimal feed location: switch lines on the stage that crosses the intersection
    if (section === 'rectifying' && x <= xInt) {
      section = 'stripping';
      feedStage = n;
    }
    steps.push({ stage: n, x, y: clamp01(y), section });
    const line = section === 'rectifying' ? rect : strip;
    y = line.slope * x + line.intercept;
  }
  // ensure the reboiler (last stage) is reported on the stripping line
  const last = steps.at(-1);
  if (last && last.section !== 'stripping') last.section = 'stripping';
  if (feedStage > s.N) feedStage = s.N;

  return { steps, feedStage, xBottom: x, L, V, Lp, Vp, rect, strip, xInt, xReflux, yTop };
}

export function rateColumn(spec: ColumnSpec): McCabeThieleResult {
  const { alpha, F, zF, q, N, R, DF } = spec;
  if (!(alpha > 1)) throw new RangeError('Relative volatility must exceed 1 (A must be the light key).');
  if (!(F > 0)) throw new RangeError('Column has no feed flow.');
  if (!(zF > 0 && zF < 1)) throw new RangeError('Feed must contain both components (0 < z_F < 1).');
  if (!(DF > 0 && DF < 1)) throw new RangeError('D/F must lie strictly between 0 and 1.');
  if (!(N >= 1)) throw new RangeError('At least one theoretical stage is required.');
  if (!(R > 0)) throw new RangeError('Reflux ratio must be positive.');

  // feasible x_D: above z_F, and x_B = (z_F − D/F·x_D)/(1 − D/F) ≥ 0
  const eps = 1e-10;
  const lo = zF + eps;
  const hi = Math.min(1, zF / DF) - eps;
  const residual = (xD: number) => {
    const p = stepColumn(spec, xD);
    const xB = (zF - DF * xD) / (1 - DF);
    return p.xBottom - xB;
  };
  const xD = brent(residual, lo, hi, { tol: 1e-12 });
  const p = stepColumn(spec, xD);
  const D = DF * F;
  const B = F - D;
  const xB = Math.max(0, (zF - DF * xD) / (1 - DF));

  return {
    xD,
    xB,
    D,
    B,
    L: p.L,
    V: p.V,
    Lp: p.Lp,
    Vp: p.Vp,
    feedStage: p.feedStage,
    steps: p.steps,
    rectifying: p.rect,
    stripping: p.strip,
    intersection: { x: p.xInt, y: p.rect.slope * p.xInt + p.rect.intercept },
    pinch: qLinePinch(alpha, zF, q),
    Rmin: minimumReflux(alpha, zF, q, xD),
    Nmin: fenskeMinimumStages(alpha, xD, xB),
    xReflux: p.xReflux,
    yTop: p.yTop,
  };
}
