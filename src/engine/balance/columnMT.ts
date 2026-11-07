/**
 * McCabe–Thiele for a column taken from a balance problem: any number of feeds
 * (each with its own q), a total condenser (liquid distillate) or a partial
 * condenser (vapour distillate, counted as an equilibrium stage), constant
 * molar overflow, the reboiler counted as the last stage.
 *
 * If the key component goes to the bottoms (x_D < x_B, e.g. above an
 * azeotrope) the construction runs in mirrored coordinates x' = 1 − x for the
 * other component and is rotated back for drawing.
 */

import type { CurveSpec } from './types';

export interface Pt {
  x: number;
  y: number;
}

export interface MTFeed {
  name: string;
  n: number;
  z: number;
  q: number;
}

export interface MTInput {
  curve: (x: number) => number;
  v: number;
  condenser: 'total' | 'partial';
  D: number;
  xD: number;
  B: number;
  xB: number;
  feeds: MTFeed[];
}

export interface MTSection {
  /** L/V */
  slope: number;
  intercept: number;
  L: number;
  V: number;
}

export interface MTResult {
  ok: boolean;
  error?: string;
  mirrored: boolean;
  /** theoretical stages incl. reboiler (and partial condenser), fractional */
  N: number;
  /** stage at which each feed enters (1 = top stage below the condenser) */
  feedStages: { name: string; stage: number }[];
  sections: MTSection[];
  staircase: Pt[];
  opLines: Pt[][];
  qLines: { name: string; pts: Pt[] }[];
  stages: { n: number; x: number; y: number }[];
}

export const PRESET_CURVES: Record<string, { label: string; points: [number, number][] }> = {
  'vr02-20bar': {
    label: 'THF/H₂O 20 bar (VR 02, Abb. 3)',
    points: [[0, 0], [0.0245, 0.4486], [0.0502, 0.4937], [0.075, 0.4937], [0.1486, 0.4614], [0.178, 0.4524], [0.2069, 0.4476], [0.2194, 0.4458], [0.2425, 0.4441], [0.2789, 0.4441], [0.3331, 0.4493], [0.3501, 0.451], [0.3903, 0.4578], [0.4205, 0.4629], [0.4495, 0.4697], [0.5126, 0.4834], [0.5946, 0.5039], [0.6239, 0.5111], [0.6867, 0.5294], [0.7328, 0.5452], [0.7772, 0.5639], [0.7958, 0.5726], [0.8081, 0.5793], [0.8387, 0.5982], [0.8487, 0.6051], [0.8675, 0.6205], [0.8848, 0.6374], [0.8967, 0.6512], [0.9052, 0.6631], [0.9105, 0.6719], [0.9208, 0.6873], [0.9309, 0.7078], [0.9412, 0.7319], [0.948, 0.7476], [0.9532, 0.763], [0.96, 0.7882], [0.9685, 0.8188], [0.9755, 0.8447], [0.9822, 0.8891], [0.9854, 0.9113], [0.9906, 0.9441], [0.9956, 0.9773], [1, 1]],
  },
  'vr02-10bar': {
    label: 'THF/H₂O 10 bar (VR 02, Abb. 4)',
    points: [[0, 0], [0.0242, 0.6685], [0.0494, 0.757], [0.0752, 0.7864], [0.0991, 0.7981], [0.1215, 0.8017], [0.1339, 0.8035], [0.1539, 0.8052], [0.288, 0.807], [0.3492, 0.8088], [0.4775, 0.817], [0.5792, 0.8258], [0.6332, 0.8309], [0.6934, 0.8379], [0.755, 0.8466], [0.7867, 0.8513], [0.8137, 0.8566], [0.8348, 0.8618], [0.8525, 0.8669], [0.8736, 0.8738], [0.8924, 0.8823], [0.9141, 0.8944], [0.932, 0.9061], [0.9493, 0.9215], [0.9755, 0.9537], [1, 1]],
  },
};

/** y*(x) from a table (linear interpolation, as the figure is drawn) or constant α. */
export function curveFn(spec: CurveSpec): ((x: number) => number) | null {
  if (spec.kind === 'alpha') {
    const a = spec.alpha;
    if (!(a > 0)) return null;
    return (x) => (a * x) / (1 + (a - 1) * x);
  }
  const pts = [...spec.points].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  return (x) => {
    if (x <= pts[0]![0]) return pts[0]![1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      if (x <= x1) {
        const [x0, y0] = pts[i - 1]!;
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return pts.at(-1)![1];
  };
}

/** Parse "x y" pairs, one per line (comma or point decimals, ; or tab separators). */
export function parseTable(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const line of text.split(/\n/)) {
    const nums = line
      .trim()
      .split(/[\s;\t]+/)
      .map((s) => Number(s.replace(',', '.')))
      .filter((v) => Number.isFinite(v));
    if (nums.length >= 2) out.push([nums[0]!, nums[1]!]);
  }
  return out;
}

const fail = (error: string, mirrored = false): MTResult => ({
  ok: false,
  error,
  mirrored,
  N: Number.NaN,
  feedStages: [],
  sections: [],
  staircase: [],
  opLines: [],
  qLines: [],
  stages: [],
});

export function columnMT(inp: MTInput): MTResult {
  const { v, D, B } = inp;
  if (!(v > 0)) return fail('reflux');
  if (!(D > 0) || !(B > 0)) return fail('flows');
  if (!inp.feeds.length) return fail('nofeed');
  const mirrored = inp.xD < inp.xB;
  const m = (x: number) => (mirrored ? 1 - x : x);
  const y = mirrored ? (x: number) => 1 - inp.curve(1 - x) : inp.curve;
  const xD = m(inp.xD);
  const xB = m(inp.xB);
  const feeds = inp.feeds.map((f) => ({ ...f, z: m(f.z) })).sort((a, b) => b.z - a.z);
  if (!(xD > xB)) return fail('order', mirrored);

  // sections from the top: V_k·y = L_k·x + D·x_D − Σ F_j·z_j (feeds above)
  const sections: MTSection[] = [];
  let L = v * D;
  let V = (v + 1) * D;
  let top = D * xD;
  sections.push({ slope: L / V, intercept: top / V, L, V });
  for (const f of feeds) {
    L += f.q * f.n;
    V -= (1 - f.q) * f.n;
    top -= f.n * f.z;
    if (!(V > 0)) return fail('vapour', mirrored);
    sections.push({ slope: L / V, intercept: top / V, L, V });
  }
  const op = (k: number, x: number) => sections[k]!.slope * x + sections[k]!.intercept;
  // where consecutive operating lines meet (on the feed's q-line)
  const xInt = feeds.map((_, k) => {
    const a = sections[k]!;
    const b = sections[k + 1]!;
    return Math.abs(a.slope - b.slope) < 1e-12 ? Number.NaN : (b.intercept - a.intercept) / (a.slope - b.slope);
  });

  // inverse equilibrium on [0, hi]
  const inv = (yt: number, hi: number): number | null => {
    if (y(hi) < yt - 1e-12) return null;
    if (y(0) >= yt) return 0;
    let lo = 0;
    let h = hi;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + h);
      if (y(mid) < yt) lo = mid;
      else h = mid;
    }
    return 0.5 * (lo + h);
  };

  const stages: { n: number; x: number; y: number }[] = [];
  const stair: Pt[] = [{ x: xD, y: xD }];
  const feedStages: { name: string; stage: number }[] = [];
  let count = 0;
  let yn = xD;
  let xPrev = xD;
  if (inp.condenser === 'partial') {
    const x0 = inv(xD, 1);
    if (x0 === null) return fail('pinch', mirrored);
    count = 1;
    stages.push({ n: 0, x: x0, y: xD });
    stair.push({ x: x0, y: xD });
    yn = op(0, x0);
    stair.push({ x: x0, y: yn });
    xPrev = x0;
  }
  let sec = 0;
  let N = Number.NaN;
  for (let n = 1; n <= 200; n++) {
    const x = inv(yn, xPrev);
    if (x === null || x >= xPrev - 1e-10) return { ...fail('pinch', mirrored), stages: back(stages, mirrored), staircase: stair.map((p) => ({ x: m(p.x), y: m(p.y) })) };
    count++;
    stages.push({ n, x, y: yn });
    stair.push({ x, y: yn });
    if (x <= xB) {
      N = count - 1 + (xPrev - xB) / (xPrev - x);
      while (sec < feeds.length) feedStages.push({ name: feeds[sec++]!.name, stage: n });
      break;
    }
    while (sec < feeds.length && x < (Number.isFinite(xInt[sec]!) ? xInt[sec]! : -1)) feedStages.push({ name: feeds[sec++]!.name, stage: n });
    yn = op(sec, x);
    stair.push({ x, y: yn });
    xPrev = x;
  }
  if (!Number.isFinite(N)) return fail('steps', mirrored);
  const last = stair.at(-1)!;
  stair.push({ x: last.x, y: last.x });

  // operating line segments: x_D → first intersection → … → x_B
  const bounds = [xD, ...xInt.map((v2, k) => (Number.isFinite(v2) ? Math.min(Math.max(v2, xB), xD) : k === 0 ? xD : xB)), xB];
  const opLines = sections.map((_, k) => {
    const a = bounds[k]!;
    const b = bounds[k + 1]!;
    return [
      { x: m(a), y: m(op(k, a)) },
      { x: m(b), y: m(op(k, b)) },
    ];
  });
  const qLines = feeds.map((f, k) => {
    const xi = xInt[k]!;
    const end = Number.isFinite(xi) ? { x: xi, y: op(k, xi) } : { x: f.z, y: f.z };
    return { name: f.name, pts: [{ x: m(f.z), y: m(f.z) }, { x: m(end.x), y: m(end.y) }] };
  });

  return {
    ok: true,
    mirrored,
    N,
    feedStages,
    sections,
    staircase: stair.map((p) => ({ x: m(p.x), y: m(p.y) })),
    opLines,
    qLines,
    stages: back(stages, mirrored),
  };
}

function back(stages: { n: number; x: number; y: number }[], mirrored: boolean) {
  return mirrored ? stages.map((s) => ({ n: s.n, x: 1 - s.x, y: 1 - s.y })) : stages;
}
