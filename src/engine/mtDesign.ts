/**
 * McCabe–Thiele design workbench (binary, continuous, total condenser).
 *
 * Constant molar overflow → straight operating lines:
 *   rectifying  y = v/(v+1)·x + x_D/(v+1)
 *   q-line      q·x + (1−q)·y = x_F
 *   stripping   from (x_B, x_B) through the rectifying/q-line intersection I
 *
 * Stage stepping starts on the diagonal at x_D (the total condenser is no
 * stage) and alternates: across to the (pseudo-)equilibrium curve → x_n, down to
 * the operating line → y_{n+1}. Every step is an equilibrium stage, reboiler
 * included. The last, partial step counts fractionally:
 *   N = (k − 1) + (x_{k−1} − x_B) / (x_{k−1} − x_k)
 *
 * Murphree efficiency (same on every stage):
 *   y_eff(x) = y_op(x) + E_M·(y*(x) − y_op(x)),
 * with y_op the operating line of the stage's own section.
 *
 * Above a minimum-boiling azeotrope (y* < x, x_D < x_F < x_B) the column is
 * solved in mirrored coordinates x' = 1 − x, y' = 1 − y, where it is an ordinary
 * column, and rotated back.
 */

import { brent } from './numerics';

export type CalcTarget = 'stages' | 'bottoms' | 'distillate';

export interface DesignSpec {
  /** equilibrium y*(x) */
  y: (x: number) => number;
  /** minimum-boiling azeotrope of y*, if any */
  azeotrope?: number | null;
  /** constant relative volatility (enables Fenske / Underwood / Gilliland) */
  alpha?: number;
  v: number;
  xF: number;
  xD: number;
  xB: number;
  q: number;
  /** Murphree efficiency, 0 < E_M ≤ 1 (1 = ideal stages) */
  EM?: number;
  /** fixed feed stage (null/undefined = optimal) */
  feedStage?: number | null;
  target?: CalcTarget;
  /** column height for the concentration targets */
  N?: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface DesignStage {
  stage: number;
  /** liquid leaving the stage */
  x: number;
  /** vapour leaving the stage */
  y: number;
  /** vapour entering from below (on the operating line at x) */
  yBelow: number;
  section: 'rectifying' | 'stripping';
  isFeed: boolean;
  /** last (fractional) step */
  partial: boolean;
}

export type DesignErrorCode =
  | 'order'
  | 'azeotrope'
  | 'parallel'
  | 'reflux-low'
  | 'pinch'
  | 'feed-pinch'
  | 'feed-beyond'
  | 'step-limit'
  | 'target-unreachable'
  | 'feed-too-low'
  | 'input';

export interface Shortcut {
  Nmin: number;
  vmin: number;
  /** Gilliland (Liddle) stage estimate at the current v, null if not applicable */
  gilliland: number | null;
  /** Gilliland curve N(v) from just above v_min to 5·v_min */
  curve: { v: number; N: number }[];
}

export interface DesignResult {
  ok: boolean;
  error?: { code: DesignErrorCode; message: string };
  /** true when the construction runs below the diagonal (above an azeotrope) */
  mirrored: boolean;
  /** solved compositions (= spec for target 'stages') */
  xD: number;
  xB: number;
  xF: number;
  /** fractional number of equilibrium stages */
  N: number;
  feedStage: number;
  stages: DesignStage[];
  staircase: Pt[];
  intersection: Pt;
  rectifying: Pt[];
  stripping: Pt[];
  /** operating-line extensions beyond the intersection that the staircase used (dashed) */
  rectifyingExt: Pt[];
  strippingExt: Pt[];
  qLine: Pt[];
  /** pseudo-equilibrium curve (E_M < 1), drawn between x_B and x_D */
  pseudo: Pt[];
  shortcut: Shortcut | null;
}

const MAX_STEPS = 200;
const EPS = 1e-12;

// ---------------------------------------------------------------------------
// Shortcut methods (constant α)
// ---------------------------------------------------------------------------

/** Fenske: N_min = ln[x_D(1−x_B) / (x_B(1−x_D))] / ln α */
export const fenske = (alpha: number, xD: number, xB: number) =>
  Math.log((xD * (1 - xB)) / (xB * (1 - xD))) / Math.log(alpha);

/**
 * Underwood, binary: α·x_F/(α−θ) + (1−x_F)/(1−θ) = 1 − q with 1 < θ < α, then
 * v_min + 1 = α·x_D/(α−θ) + (1−x_D)/(1−θ).
 */
export function underwood(alpha: number, xF: number, q: number, xD: number): number {
  const g = (t: number) => (alpha * xF) / (alpha - t) + (1 - xF) / (1 - t) - (1 - q);
  const d = (alpha - 1) * 1e-12;
  const theta = brent(g, 1 + d, alpha - d, { tol: 1e-14 });
  return (alpha * xD) / (alpha - theta) + (1 - xD) / (1 - theta) - 1;
}

/** Liddle's fit of the Gilliland correlation (slide misprints corrected). */
export function gillilandY(X: number): number {
  if (X <= 0.01) return 1 - 18.5715 * X;
  if (X <= 0.9) return 0.545827 - 0.591422 * X + 0.002743 / X;
  return 0.16595 - 0.16595 * X;
}

/** Stage count from Gilliland: Y = (N − N_min)/(N + 1) → N = (Y + N_min)/(1 − Y). */
export function gillilandN(v: number, vmin: number, Nmin: number): number {
  const X = (v - vmin) / (v + 1);
  const Y = gillilandY(X);
  return (Y + Nmin) / (1 - Y);
}

// ---------------------------------------------------------------------------
// Core construction in "normal" orientation: x_B < x_F < x_D, y* > x between
// ---------------------------------------------------------------------------

interface Core {
  ok: boolean;
  code?: DesignErrorCode;
  message?: string;
  N: number;
  feedStage: number;
  stages: DesignStage[];
  xI: number;
  yI: number;
  rect: (x: number) => number;
  strip: (x: number) => number;
}

function lines(v: number, xF: number, xD: number, xB: number, q: number) {
  const a = v / (v + 1);
  const b = xD / (v + 1);
  const rect = (x: number) => a * x + b;
  let xI: number;
  if (Math.abs(q - 1) < 1e-12) {
    xI = xF;
  } else {
    const den = q + (1 - q) * a;
    if (Math.abs(den) < 1e-12) return { error: 'parallel' as const, rect, a, b };
    xI = (xF - (1 - q) * b) / den;
  }
  const yI = rect(xI);
  const s = (yI - xB) / (xI - xB);
  const strip = (x: number) => xB + s * (x - xB);
  return { rect, strip, xI, yI, a, b };
}

function construct(
  y: (x: number) => number,
  v: number,
  xF: number,
  xD: number,
  xB: number,
  q: number,
  EM: number,
  feedStage: number | null,
): Core {
  const L = lines(v, xF, xD, xB, q);
  const fail = (code: DesignErrorCode, message: string, extra: Partial<Core> = {}): Core => ({
    ok: false,
    code,
    message,
    N: Number.NaN,
    feedStage: 0,
    stages: [],
    xI: Number.NaN,
    yI: Number.NaN,
    rect: L.rect,
    strip: L.rect,
    ...extra,
  });
  if ('error' in L) return fail('parallel', 'q = −v: the q-line is parallel to the rectifying line — no intersection.');
  const { rect, strip, xI, yI } = L as Required<typeof L> & { strip: (x: number) => number };
  if (!(xI > xB && xI < xD)) {
    return fail('reflux-low', 'Reflux too low for this feed condition: the operating lines meet outside x_B … x_D.', {
      xI,
      yI,
      strip,
    });
  }

  const lineFor = (n: number, x: number) =>
    feedStage ? (n < feedStage ? rect : strip) : x > xI ? rect : strip;
  const yEff = (n: number, x: number) => {
    const op = lineFor(n, x);
    const o = op(x);
    return o + EM * (y(x) - o);
  };

  const stages: DesignStage[] = [];
  let xPrev = xD;
  let yN = xD; // total condenser: y₁ = x_D
  let feed = 0;
  for (let n = 1; n <= MAX_STEPS; n++) {
    // horizontal: solve y_eff(n, x) = y_n on [0, x_{n−1}]
    if (yEff(n, xPrev) <= yN + EPS) {
      const code = feedStage ? 'feed-pinch' : 'pinch';
      const message = feedStage
        ? 'The feed stage is too far from the optimum: the column pinches before x_B.'
        : 'No solution for these settings: the staircase pinches against the equilibrium curve (reflux at or below the minimum).';
      return { ...fail(code, message), xI, yI, rect, strip, stages };
    }
    let x: number;
    if (yEff(n, 0) >= yN) x = 0;
    else {
      let lo = 0;
      let hi = xPrev;
      for (let i = 0; i < 100; i++) {
        const m = 0.5 * (lo + hi);
        if (yEff(n, m) < yN) lo = m;
        else hi = m;
      }
      x = 0.5 * (lo + hi);
    }
    const op = lineFor(n, x);
    const section = op === rect ? 'rectifying' : 'stripping';
    if (section === 'stripping' && feed === 0) feed = n;
    const partial = x <= xB;
    const yBelow = op(x);
    stages.push({ stage: n, x, y: yN, yBelow, section, isFeed: n === feed, partial });

    if (partial) {
      if (feedStage && n < feedStage) {
        return {
          ...fail('feed-beyond', `The feed stage (${feedStage}) lies below the last stage the column needs (${n}).`),
          xI, yI, rect, strip, stages,
        };
      }
      const N = n - 1 + (xPrev - xB) / (xPrev - x);
      if (feed === 0) {
        feed = n;
        stages[stages.length - 1]!.isFeed = true;
      }
      return { ok: true, N, feedStage: feed, stages, xI, yI, rect, strip };
    }
    xPrev = x;
    yN = yBelow;
  }
  return {
    ...fail('step-limit', `No solution for these settings: more than ${MAX_STEPS} steps (at or just above the minimum reflux).`),
    xI, yI, rect, strip, stages,
  };
}

// ---------------------------------------------------------------------------
// Public solver
// ---------------------------------------------------------------------------

const err = (code: DesignErrorCode, message: string, s: DesignSpec, mirrored = false): DesignResult => ({
  ok: false,
  error: { code, message },
  mirrored,
  xD: s.xD,
  xB: s.xB,
  xF: s.xF,
  N: Number.NaN,
  feedStage: 0,
  stages: [],
  staircase: [],
  intersection: { x: Number.NaN, y: Number.NaN },
  rectifying: [],
  stripping: [],
  rectifyingExt: [],
  strippingExt: [],
  qLine: [],
  pseudo: [],
  shortcut: null,
});

/** Where the q-line from (x_F, x_F) meets the equilibrium curve (for drawing). */
function qLineEnd(y: (x: number) => number, xF: number, q: number): Pt {
  if (Math.abs(q - 1) < 1e-12) return { x: xF, y: y(xF) };
  const f = (x: number) => q * x + (1 - q) * y(x) - xF;
  try {
    // the q-line runs from the diagonal towards the curve; search the side it heads to
    const x = q > 1 || q < 0 ? brent(f, q > 1 ? xF : 0, q > 1 ? 1 : xF, { tol: 1e-12 }) : brent(f, 0, xF, { tol: 1e-12 });
    return { x, y: y(x) };
  } catch {
    return { x: xF, y: xF };
  }
}

export function solveDesign(spec: DesignSpec): DesignResult {
  const target = spec.target ?? 'stages';
  const EM = spec.EM ?? 1;
  const feedStage = spec.feedStage ?? null;
  const { v, q } = spec;
  if (!(v > 0) || !(EM > 0 && EM <= 1)) return err('input', 'Reflux ratio must be positive and 0 < E_M ≤ 1.', spec);

  // orientation from the specifications that are fixed by the target
  const { xF } = spec;
  const ref = target === 'distillate' ? spec.xB : spec.xD;
  const normal = target === 'distillate' ? ref < xF : ref > xF;
  const mirrored = !normal;
  // the fixed spec must be on the correct side for its orientation
  if (target === 'stages') {
    const okNormal = spec.xB < xF && xF < spec.xD;
    const okMirror = spec.xD < xF && xF < spec.xB;
    if (!okNormal && !okMirror) {
      return err('order', 'Order the compositions x_B < x_F < x_D (or the reverse, above an azeotrope).', spec);
    }
  }

  // transform to normal coordinates
  const T = (x: number) => (mirrored ? 1 - x : x);
  const yN = mirrored ? (x: number) => 1 - spec.y(1 - x) : spec.y;
  const az = spec.azeotrope != null ? T(spec.azeotrope) : null;
  const sxF = T(xF);
  let sxD = T(spec.xD);
  let sxB = T(spec.xB);

  // equilibrium must lie above the diagonal between the products
  const aboveDiag = (lo: number, hi: number) => {
    for (let i = 1; i < 200; i++) {
      const x = lo + ((hi - lo) * i) / 200;
      if (yN(x) <= x) return false;
    }
    return true;
  };
  const azMsg = (side: string) =>
    `All specifications must lie on one side of the azeotrope at x ≈ ${spec.azeotrope?.toFixed(3)} (${side}).`;

  let core: Core | null = null;
  const run = (xd: number, xb: number) => construct(yN, v, sxF, xd, xb, q, EM, feedStage);

  if (target === 'stages') {
    if (!aboveDiag(sxB, sxD)) return err('azeotrope', azMsg('x_D and x_B are on different sides'), spec, mirrored);
    core = run(sxD, sxB);
  } else {
    const Nt = spec.N ?? 10;
    if (!(Nt >= 1)) return err('input', 'Column height N must be at least 1 stage.', spec, mirrored);
    if (feedStage && feedStage > Nt - 1) {
      return err('feed-too-low', `With N = ${Nt} the feed stage can be at most ${Nt - 1}.`, spec, mirrored);
    }
    const Nof = (xd: number, xb: number) => {
      const c = run(xd, xb);
      return c.ok ? c.N : Number.POSITIVE_INFINITY;
    };
    if (target === 'bottoms') {
      if (!(sxD > sxF)) return err('order', 'x_D must lie above x_F.', spec, mirrored);
      if (!aboveDiag(sxF, sxD)) return err('azeotrope', azMsg('x_D is beyond it'), spec, mirrored);
      const L0 = lines(v, sxF, sxD, 0, q);
      if ('error' in L0) return err('parallel', 'q = −v: the q-line is parallel to the rectifying line.', spec, mirrored);
      const hi = Math.min(sxF, L0.xI) - 1e-9;
      let lo = 1e-9;
      if (!(hi > lo)) return err('reflux-low', 'Reflux too low for this feed condition.', spec, mirrored);
      if (Nof(sxD, hi) > Nt) return err('target-unreachable', 'Even the leanest split needs more stages than N.', spec, mirrored);
      if (Nof(sxD, lo) <= Nt) {
        sxB = lo;
      } else {
        let h = hi;
        for (let i = 0; i < 90; i++) {
          const m = 0.5 * (lo + h);
          if (Nof(sxD, m) > Nt) lo = m;
          else h = m;
        }
        sxB = 0.5 * (lo + h);
      }
    } else {
      if (!(sxB < sxF)) return err('order', 'x_B must lie below x_F.', spec, mirrored);
      const top = az !== null && az > sxF ? az - 1e-7 : 1 - 1e-9;
      if (!aboveDiag(sxB, sxF)) return err('azeotrope', azMsg('x_B is beyond it'), spec, mirrored);
      let lo = sxF + 1e-7;
      let hi = top;
      if (Nof(lo, sxB) > Nt) return err('target-unreachable', 'No distillate richer than the feed is reachable with N stages.', spec, mirrored);
      if (Nof(hi, sxB) <= Nt) {
        sxD = hi;
      } else {
        for (let i = 0; i < 90; i++) {
          const m = 0.5 * (lo + hi);
          if (Nof(m, sxB) <= Nt) lo = m;
          else hi = m;
        }
        sxD = lo;
      }
    }
    core = run(sxD, sxB);
  }

  // ---- shortcuts (constant α, normal orientation only) ----
  let shortcut: Shortcut | null = null;
  if (spec.alpha && spec.alpha > 1 && !mirrored) {
    try {
      const Nmin = fenske(spec.alpha, sxD, sxB);
      const vmin = underwood(spec.alpha, sxF, q, sxD);
      const gil = EM === 1 && v > vmin ? gillilandN(v, vmin, Nmin) : null;
      const curve: { v: number; N: number }[] = [];
      if (vmin > 0) {
        for (let i = 1; i <= 160; i++) {
          const vv = vmin * (1 + (4 * i ** 1.6) / 160 ** 1.6);
          curve.push({ v: vv, N: gillilandN(vv, vmin, Nmin) });
        }
      }
      shortcut = { Nmin, vmin, gilliland: gil, curve };
    } catch {
      shortcut = null;
    }
  }

  // ---- geometry back in original coordinates ----
  const P = (x: number, y: number): Pt => (mirrored ? { x: 1 - x, y: 1 - y } : { x, y });
  const xD0 = T(sxD);
  const xB0 = T(sxB);
  const base = {
    mirrored,
    xD: xD0,
    xB: xB0,
    xF,
    shortcut,
  };

  if (!core.ok) {
    const r = err(core.code ?? 'input', core.message ?? 'No solution.', { ...spec, xD: xD0, xB: xB0 }, mirrored);
    // still draw the lines when they exist, to show the user why
    if (Number.isFinite(core.xI)) {
      r.intersection = P(core.xI, core.yI);
      r.rectifying = [P(sxD, sxD), P(core.xI, core.yI)];
      r.stripping = [P(core.xI, core.yI), P(sxB, sxB)];
    }
    r.qLine = [P(sxF, sxF), P(qLineEnd(yN, sxF, q).x, qLineEnd(yN, sxF, q).y)];
    r.shortcut = shortcut;
    return r;
  }

  const { stages, xI, yI, rect, strip } = core;
  const staircase: Pt[] = [P(sxD, sxD)];
  for (const s of stages) {
    staircase.push(P(s.x, s.y));
    if (!s.partial) staircase.push(P(s.x, s.yBelow));
  }
  const strippingExtXs = stages.filter((s) => s.section === 'stripping' && s.x > xI).map((s) => s.x);
  const rectExtXs = stages.filter((s) => s.section === 'rectifying' && s.x < xI).map((s) => s.x);
  const pseudo: Pt[] = [];
  if (EM < 1) {
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const x = sxB + ((sxD - sxB) * i) / n;
      const op = feedStage ? null : x > xI ? rect : strip;
      // with a fixed feed stage the kink sits where the staircase changes lines
      const switchX = feedStage ? (stages.find((s) => s.stage === feedStage)?.x ?? xI) : xI;
      const o = (op ?? (x > switchX ? rect : strip))(x);
      pseudo.push(P(x, o + EM * (yN(x) - o)));
    }
  }
  const qEnd = qLineEnd(yN, sxF, q);

  return {
    ok: true,
    ...base,
    N: core.N,
    feedStage: core.feedStage,
    stages: stages.map((s) => {
      const p = P(s.x, s.y);
      return { ...s, x: p.x, y: p.y, yBelow: P(s.x, s.yBelow).y };
    }),
    staircase,
    intersection: P(xI, yI),
    rectifying: [P(sxD, sxD), P(xI, yI)],
    stripping: [P(xI, yI), P(sxB, sxB)],
    rectifyingExt: rectExtXs.length ? [P(xI, yI), P(Math.min(...rectExtXs), rect(Math.min(...rectExtXs)))] : [],
    strippingExt: strippingExtXs.length ? [P(xI, yI), P(Math.max(...strippingExtXs), strip(Math.max(...strippingExtXs)))] : [],
    qLine: [P(sxF, sxF), P(qEnd.x, qEnd.y)],
    pseudo,
  };
}
