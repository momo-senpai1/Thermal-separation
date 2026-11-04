/**
 * Distillation lines (Stichlmair) for ternary mixtures.
 *
 * At total reflux the liquid leaving stage n+1 equals the vapour rising from
 * stage n:  x_{n+1} = y*(x_n). A distillation line is that sequence of
 * equilibrium stages; going up it ends at a light node, going down at a heavy
 * node. Singular points (pure components and azeotropes, y* = x) are classified
 * from the eigenvalues λ of the stage map's Jacobian:
 *   both λ < 1 → light node (lines arrive going up — "unstable node"),
 *   both λ > 1 → heavy node ("stable node"), otherwise → saddle.
 * Border lines (separatrices) are the distillation lines through interior
 * directions of saddles; they split the triangle into distillation regions that
 * a column at total reflux cannot cross.
 */

import { brent } from '../numerics';
import { bubble, dew, type TernarySystem, type Vec3 } from './model';

export type PointKind = 'light-node' | 'heavy-node' | 'saddle';

export interface SingularPoint {
  x: Vec3;
  T: number;
  kind: PointKind;
  /** 'pure', 'binary' or 'ternary' */
  order: 'pure' | 'binary' | 'ternary';
  label: string;
}

export interface Line {
  pts: Vec3[];
  T: number[];
}

const EPS = 1e-12;

export const project = (v: number[]): Vec3 => {
  const c = v.map((a) => Math.max(0, a));
  const s = c[0]! + c[1]! + c[2]!;
  return [c[0]! / s, c[1]! / s, c[2]! / s];
};

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const upStep = (sys: TernarySystem, P: number, x: Vec3) => bubble(sys, x, P);
export const downStep = (sys: TernarySystem, P: number, x: Vec3) => dew(sys, x, P);

/** Follow the stage map up (towards the light end) or down (towards the heavy end). */
export function trace(sys: TernarySystem, P: number, x0: Vec3, dir: 'up' | 'down', maxSteps = 300, tol = 2e-6): Line {
  const pts: Vec3[] = [x0];
  const T: number[] = [bubble(sys, x0, P).T];
  let x = x0;
  for (let i = 0; i < maxSteps; i++) {
    const e = dir === 'up' ? upStep(sys, P, x) : downStep(sys, P, x);
    const nx = project(dir === 'up' ? e.y : e.x);
    if (dist(nx, x) < tol) break;
    x = nx;
    pts.push(x);
    T.push(dir === 'up' ? bubble(sys, x, P).T : e.T);
  }
  return { pts, T };
}

/** Whole distillation line through x: down to the heavy end, up to the light end. */
export function lineThrough(sys: TernarySystem, P: number, x: Vec3, maxSteps = 300): Line {
  const d = trace(sys, P, x, 'down', maxSteps);
  const u = trace(sys, P, x, 'up', maxSteps);
  return { pts: [...d.pts.slice(1).reverse(), ...u.pts], T: [...d.T.slice(1).reverse(), ...u.T] };
}

// ---------------------------------------------------------------------------
// Singular points
// ---------------------------------------------------------------------------

/** 2×2 Jacobian eigenvalues/vectors of x → y*(x) in a local chart (drop the largest component). */
function jacobian(sys: TernarySystem, P: number, x: Vec3) {
  const dep = x.indexOf(Math.max(...x));
  const free = [0, 1, 2].filter((i) => i !== dep) as [number, number];
  const h = 1e-6;
  const G = (u: number[]) => {
    const v = [0, 0, 0];
    v[free[0]] = u[0]!;
    v[free[1]] = u[1]!;
    v[dep] = 1 - u[0]! - u[1]!;
    const y = bubble(sys, v as Vec3, P).y;
    return [y[free[0]], y[free[1]]];
  };
  const u0: number[] = [x[free[0]]!, x[free[1]]!];
  const J = [
    [0, 0],
    [0, 0],
  ];
  for (let c = 0; c < 2; c++) {
    const up = [...u0];
    up[c]! += h;
    const dn = [...u0];
    const back = dn[c]! - h >= 0;
    if (back) dn[c]! -= h;
    const gp = G(up);
    const gm = G(back ? dn : u0);
    const span = back ? 2 * h : h;
    J[0]![c] = (gp[0]! - gm[0]!) / span;
    J[1]![c] = (gp[1]! - gm[1]!) / span;
  }
  const tr = J[0]![0]! + J[1]![1]!;
  const det = J[0]![0]! * J[1]![1]! - J[0]![1]! * J[1]![0]!;
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const lam = [(tr + disc) / 2, (tr - disc) / 2];
  const vecs = lam.map((l) => {
    // (J − λI)v = 0
    const a = J[0]![0]! - l;
    const b = J[0]![1]!;
    const c = J[1]![0]!;
    const d = J[1]![1]! - l;
    let v = Math.abs(b) + Math.abs(a) > Math.abs(c) + Math.abs(d) ? [-b, a] : [-d, c];
    if (Math.hypot(v[0]!, v[1]!) < 1e-14) v = [1, 0];
    const n = Math.hypot(v[0]!, v[1]!);
    const w = [0, 0, 0];
    w[free[0]] = v[0]! / n;
    w[free[1]] = v[1]! / n;
    w[dep] = -(v[0]! + v[1]!) / n;
    return w as Vec3;
  });
  return { lam, vecs };
}

function classify(lam: number[]): PointKind {
  if (lam.every((l) => l < 1)) return 'light-node';
  if (lam.every((l) => l > 1)) return 'heavy-node';
  return 'saddle';
}

export function singularPoints(sys: TernarySystem, P: number): SingularPoint[] {
  const out: SingularPoint[] = [];
  const names = sys.comps.map((c) => c.short);
  const add = (x: Vec3, order: SingularPoint['order'], label: string) => {
    if (out.some((p) => dist(p.x, x) < 1e-4)) return;
    const { lam } = jacobian(sys, P, x);
    out.push({ x, T: bubble(sys, x, P).T, kind: classify(lam), order, label });
  };
  // pure components
  for (let i = 0; i < 3; i++) {
    const x = [0, 0, 0];
    x[i] = 1;
    add(x as Vec3, 'pure', sys.comps[i]!.name);
  }
  // binary azeotropes on each edge
  for (const [i, j] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    const at = (s: number) => {
      const x = [0, 0, 0];
      x[i] = s;
      x[j] = 1 - s;
      return x as Vec3;
    };
    const f = (s: number) => bubble(sys, at(s), P).y[i] - s;
    const n = 200;
    for (let k = 1; k < n - 1; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      if (f(a) * f(b) < 0) add(at(brent(f, a, b, { tol: 1e-12 })), 'binary', `${names[i]}–${names[j]} az.`);
    }
  }
  // ternary azeotropes: Newton on y*(x) − x = 0 from interior seeds
  if (sys.wilson) {
    for (let a = 0.1; a < 0.9; a += 0.1) {
      for (let b = 0.1; a + b < 0.95; b += 0.1) {
        let u = [a, b];
        let ok = false;
        for (let it = 0; it < 60; it++) {
          const F = (v: number[]) => {
            const x = [v[0]!, v[1]!, 1 - v[0]! - v[1]!] as Vec3;
            const y = bubble(sys, x, P).y;
            return [y[0] - x[0], y[1] - x[1]];
          };
          const r = F(u);
          if (Math.hypot(r[0]!, r[1]!) < 1e-11) {
            ok = true;
            break;
          }
          const h = 1e-7;
          const ra = F([u[0]! + h, u[1]!]);
          const rb = F([u[0]!, u[1]! + h]);
          const J = [
            [(ra[0]! - r[0]!) / h, (rb[0]! - r[0]!) / h],
            [(ra[1]! - r[1]!) / h, (rb[1]! - r[1]!) / h],
          ];
          const det = J[0]![0]! * J[1]![1]! - J[0]![1]! * J[1]![0]!;
          if (Math.abs(det) < EPS) break;
          const d0 = (J[1]![1]! * r[0]! - J[0]![1]! * r[1]!) / det;
          const d1 = (-J[1]![0]! * r[0]! + J[0]![0]! * r[1]!) / det;
          const s = Math.min(1, 0.05 / Math.max(Math.abs(d0), Math.abs(d1), 1e-12));
          u = [u[0]! - s * d0, u[1]! - s * d1];
          if (u[0]! <= 1e-4 || u[1]! <= 1e-4 || u[0]! + u[1]! >= 1 - 1e-4) break;
        }
        if (ok) add([u[0]!, u[1]!, 1 - u[0]! - u[1]!], 'ternary', 'ternary az.');
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Border lines and the field
// ---------------------------------------------------------------------------

const interior = (x: Vec3, m = 1e-7) => x[0] > m && x[1] > m && x[2] > m;

/** Separatrices through the interior directions of every saddle. */
export function borderLines(sys: TernarySystem, P: number, pts: SingularPoint[]): Line[] {
  const out: Line[] = [];
  for (const s of pts.filter((p) => p.kind === 'saddle')) {
    const { lam, vecs } = jacobian(sys, P, s.x);
    lam.forEach((l, k) => {
      for (const sign of [1, -1]) {
        const v = vecs[k]!;
        const start = [s.x[0] + sign * 2e-3 * v[0], s.x[1] + sign * 2e-3 * v[1], s.x[2] + sign * 2e-3 * v[2]];
        if (start.some((c) => c < 0)) continue;
        const x0 = project(start);
        if (!interior(x0)) continue;
        const t = trace(sys, P, x0, l > 1 ? 'up' : 'down', 400);
        out.push({ pts: [s.x, ...t.pts], T: [s.T, ...t.T] });
      }
    });
  }
  return out;
}

/**
 * Field of distillation lines: seeded around every heavy node and traced up,
 * plus whole lines through points near every saddle (where node seeds thin out).
 */
export function field(sys: TernarySystem, P: number, pts: SingularPoint[], perNode = 14): Line[] {
  const out: Line[] = [];
  const centroid: Vec3 = [1 / 3, 1 / 3, 1 / 3];
  for (const sd of pts.filter((p) => p.kind === 'saddle')) {
    for (const f of [0.06, 0.14, 0.26]) {
      const x = project(sd.x.map((v, i) => v + f * (centroid[i]! - v)));
      for (const off of [-0.04, 0.04]) {
        // fan out slightly sideways so the lines don't coincide
        const side: Vec3 = sd.order === 'pure' ? project(x.map((v, i) => v + off * (i === (sd.x.indexOf(1) + 1) % 3 ? 1 : i === (sd.x.indexOf(1) + 2) % 3 ? -1 : 0))) : x;
        if (!interior(side, 1e-4)) continue;
        out.push(lineThrough(sys, P, side, 300));
        if (sd.order !== 'pure') break;
      }
    }
  }
  for (const node of pts.filter((p) => p.kind === 'heavy-node')) {
    const r = 0.035;
    const cands: Vec3[] = [];
    for (let k = 0; k < 720; k++) {
      const a = (2 * Math.PI * k) / 720;
      // unit direction in the composition plane Σx = 0 (orthonormal basis e₁, e₂)
      const c1 = Math.cos(a) / Math.SQRT2;
      const c2 = Math.sin(a) / Math.sqrt(6);
      const d = [c1 + c2, -c1 + c2, -2 * c2];
      const x = [node.x[0] + r * d[0]!, node.x[1] + r * d[1]!, node.x[2] + r * d[2]!];
      if (x.every((c) => c > 1e-4)) cands.push(x as Vec3);
    }
    if (!cands.length) continue;
    const step = Math.max(1, Math.floor(cands.length / perNode));
    for (let k = Math.floor(step / 2); k < cands.length; k += step) {
      const t = trace(sys, P, cands[k]!, 'up', 400);
      out.push({ pts: [node.x, ...t.pts], T: [node.T, ...t.T] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feed, product regions and the column at total reflux
// ---------------------------------------------------------------------------

export interface ProductRegions {
  /** distillation line through F, from its heavy end to its light end */
  line: Line;
  /**
   * Reachable distillates at total reflux: between the distillation line from F
   * up to its light end L and the indirect split — the straight line from the
   * heavy end H through F to the region boundary — closed along that boundary.
   */
  distillate: Vec3[];
  /** Reachable bottoms: the mirror image (line from F down to H, direct split from L through F). */
  bottoms: Vec3[];
}

const VERT: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Perimeter parameter s ∈ [0, 3) of a point on the triangle boundary (null if interior). */
function perimeterS(p: Vec3, tol = 1e-6): number | null {
  if (p[2] < tol) return p[1]; // edge v0 → v1
  if (p[0] < tol) return 1 + p[2]; // edge v1 → v2
  if (p[1] < tol) return 2 + p[0]; // edge v2 → v0
  return null;
}
function perimeterPoint(sv: number): Vec3 {
  const t = ((sv % 3) + 3) % 3;
  const e = Math.floor(t);
  const f = t - e;
  const a = VERT[e]!;
  const b = VERT[(e + 1) % 3]!;
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
}

/** Walk along the triangle boundary from `from` to `to`, the way that does not pass `avoid`. */
function perimeterPath(from: Vec3, to: Vec3, avoid: Vec3): Vec3[] {
  const s0 = perimeterS(from);
  const s1 = perimeterS(to);
  if (s0 === null || s1 === null) return [to];
  const sa = perimeterS(avoid);
  const fwd = (((s1 - s0) % 3) + 3) % 3; // length going forward
  const inFwd = sa !== null && (((sa - s0) % 3) + 3) % 3 < fwd;
  const dir = sa === null ? (fwd <= 1.5 ? 1 : -1) : inFwd ? -1 : 1;
  const len = dir === 1 ? fwd : 3 - fwd;
  const out: Vec3[] = [];
  // include every vertex passed on the way
  const steps = Math.ceil(len * 4) + 1;
  for (let k = 1; k <= steps; k++) out.push(perimeterPoint(s0 + (dir * len * k) / steps));
  return out;
}

/** First point where the ray from F, pointing away from A, meets the boundary or a border line. */
function rayHit(F: Vec3, A: Vec3, borders: Line[]): { at: Vec3; border: { line: Line; seg: number } | null } {
  const d = [F[0] - A[0], F[1] - A[1], F[2] - A[2]];
  let u = Infinity;
  for (let i = 0; i < 3; i++) if (d[i]! < -1e-12) u = Math.min(u, -F[i]! / d[i]!);
  let hit: { line: Line; seg: number } | null = null;
  // intersect with border segments in (x0, x1) coordinates
  for (const line of borders) {
    for (let k = 1; k < line.pts.length; k++) {
      const p = line.pts[k - 1]!;
      const q = line.pts[k]!;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const den = d[0]! * ey - d[1]! * ex;
      if (Math.abs(den) < 1e-14) continue;
      const wx = p[0] - F[0];
      const wy = p[1] - F[1];
      const uu = (wx * ey - wy * ex) / den;
      const vv = (wx * d[1]! - wy * d[0]!) / den;
      if (uu > 1e-6 && uu < u && vv >= 0 && vv <= 1) {
        u = uu;
        hit = { line, seg: k };
      }
    }
  }
  return { at: project([F[0] + u * d[0]!, F[1] + u * d[1]!, F[2] + u * d[2]!]), border: hit };
}

/** Boundary path from the node N to the hit point (along a border line or the triangle edges). */
function closeRegion(N: Vec3, hit: ReturnType<typeof rayHit>, avoid: Vec3): Vec3[] {
  if (hit.border) {
    const pts = hit.border.line.pts;
    const a = pts[0]!;
    const b = pts.at(-1)!;
    // walk the border from the end nearest N to the hit
    if (dist(b, N) <= dist(a, N)) return [b, ...pts.slice(hit.border.seg, -1).reverse(), hit.at];
    return [a, ...pts.slice(1, hit.border.seg), hit.at];
  }
  return [...perimeterPath(N, hit.at, avoid)];
}

export function productRegions(sys: TernarySystem, P: number, F: Vec3, borders: Line[] = []): ProductRegions {
  const up = trace(sys, P, F, 'up', 400);
  const dn = trace(sys, P, F, 'down', 400);
  const L = up.pts.at(-1)!;
  const Hn = dn.pts.at(-1)!;
  const indirect = rayHit(F, Hn, borders); // D-limit: H → F → boundary
  const direct = rayHit(F, L, borders); // B-limit: L → F → boundary
  return {
    line: { pts: [...dn.pts.slice(1).reverse(), ...up.pts], T: [...dn.T.slice(1).reverse(), ...up.T] },
    distillate: [...up.pts, ...closeRegion(L, indirect, Hn).slice(1)],
    bottoms: [...dn.pts, ...closeRegion(Hn, direct, L).slice(1)],
  };
}

/**
 * A feasible starting split, constructed exactly: pick B inside the reachable
 * bottoms region, trace its distillation line up, and take D where that line
 * crosses the straight line from B through F (beyond F). D, F, B are then
 * collinear and on one distillation line by construction.
 */
export function defaultDistillate(sys: TernarySystem, P: number, F: Vec3, borders: Line[] = []): Vec3 {
  const r = productRegions(sys, P, F, borders);
  const dn = trace(sys, P, F, 'down', 400).pts;
  const hitB = r.bottoms.at(-1)!; // direct-split limit on the boundary
  let best: { D: Vec3; score: number } | null = null;
  for (const a of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const b of [0.5, 0.3, 0.7]) {
      const onLine = dn[Math.max(1, Math.floor(dn.length * a))] ?? F;
      const B = project(onLine.map((v, i) => b * v + (1 - b) * hitB[i]!));
      const dir = [F[0] - B[0], F[1] - B[1]];
      const L2 = dir[0]! ** 2 + dir[1]! ** 2;
      if (L2 < 1e-10) continue;
      const side = (p: Vec3) => dir[0]! * (p[1] - B[1]) - dir[1]! * (p[0] - B[0]);
      const along = (p: Vec3) => (dir[0]! * (p[0] - B[0]) + dir[1]! * (p[1] - B[1])) / L2; // 1 at F
      const up = trace(sys, P, B, 'up', 300).pts;
      for (let k = 1; k < up.length; k++) {
        const s0 = side(up[k - 1]!);
        const s1 = side(up[k]!);
        if (s0 === 0 || s0 * s1 > 0) continue;
        const f = s0 / (s0 - s1);
        const D = project(up[k - 1]!.map((v, i) => v + f * (up[k]![i]! - v)));
        const u = along(D);
        if (u > 1.1) {
          const DF = 1 / u; // F = B + (D − B)/u  ⇒  D/F = 1/u
          const score = Math.abs(DF - 0.5);
          if (DF > 0.1 && DF < 0.9 && (!best || score < best.score)) best = { D, score };
        }
        break;
      }
    }
  }
  if (best) return best.D;
  return snapDistillate(sys, P, F, r.distillate[Math.floor(r.distillate.length / 2)] ?? F);
}

/** Closest point of a polyline to p, with the fractional segment index. */
function closest(poly: Vec3[], p: Vec3) {
  let best = { d: Infinity, at: poly[0]!, k: 0 };
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = L2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0]! + (p[1] - a[1]) * ab[1]! + (p[2] - a[2]) * ab[2]!) / L2)) : 0;
    const q: Vec3 = [a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!];
    const d = dist(q, p);
    if (d < best.d) best = { d, at: q, k: i - 1 + t };
  }
  return best;
}

export interface ColumnAtTotalReflux {
  B: Vec3;
  /** distillate-to-feed ratio from the lever rule */
  DF: number;
  /** distance from D to the distillation line through B (0 = feasible) */
  gap: number;
  /** nearest point of that line to D (where "snap" moves D) */
  snap: Vec3;
  /** equilibrium stages from B (reboiler) up to D, fractional */
  N: number;
  /** stage compositions from B to the stage at D */
  stages: Vec3[];
  feasible: boolean;
}

/**
 * Bottoms on the extension of D → F (material balance), chosen so that the
 * distillation line through B passes as close to D as possible.
 */
export function columnAtTotalReflux(sys: TernarySystem, P: number, F: Vec3, D: Vec3, tolerance = 0.006): ColumnAtTotalReflux | null {
  const dir = [F[0] - D[0], F[1] - D[1], F[2] - D[2]];
  if (Math.hypot(dir[0]!, dir[1]!, dir[2]!) < 1e-6) return null;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) if (dir[i]! < 0) tMax = Math.min(tMax, -F[i]! / dir[i]!);
  if (!Number.isFinite(tMax) || tMax <= 1e-6) return null;
  // D/F = t/(1+t) ≥ 2 %: B = F (a vanishing distillate) is not a column
  const tMin = 0.02 / 0.98;
  if (tMax <= tMin) return null;
  const Bof = (t: number) => project([F[0] + t * dir[0]!, F[1] + t * dir[1]!, F[2] + t * dir[2]!]);
  const evalT = (t: number) => {
    const up = trace(sys, P, Bof(t), 'up', 300);
    const c = closest(up.pts, D);
    // which side of the line D lies on (2-D cross product in (x0, x1))
    const k = Math.min(up.pts.length - 2, Math.max(0, Math.floor(c.k)));
    const a = up.pts[k]!;
    const b = up.pts[k + 1] ?? a;
    const side = Math.sign((b[0] - a[0]) * (D[1] - c.at[1]) - (b[1] - a[1]) * (D[0] - c.at[0])) || 1;
    return { up, c, signed: side * c.d };
  };
  // scan for a sign change of the signed gap (D crossed by the sweeping line), else take the closest
  const n = 40;
  const tAt = (k: number) => Math.min(tMin + ((tMax - tMin) * k) / n, tMax * 0.9999);
  const samples = Array.from({ length: n + 1 }, (_, k) => ({ t: tAt(k), ...evalT(tAt(k)) }));
  let t: number;
  const flip = samples.findIndex((q, k) => k > 0 && Math.sign(q.signed) !== Math.sign(samples[k - 1]!.signed) && Math.min(q.c.d, samples[k - 1]!.c.d) < 0.05);
  if (flip > 0) {
    let lo = samples[flip - 1]!.t;
    let hi = samples[flip]!.t;
    const sLo = Math.sign(samples[flip - 1]!.signed);
    for (let i = 0; i < 50; i++) {
      const m = 0.5 * (lo + hi);
      if (Math.sign(evalT(m).signed) === sLo) lo = m;
      else hi = m;
    }
    t = 0.5 * (lo + hi);
  } else {
    let best = samples[0]!;
    for (const q of samples) if (q.c.d < best.c.d) best = q;
    t = best.t;
  }
  const { up, c } = evalT(t);
  const k = Math.floor(c.k);
  return {
    B: Bof(t),
    DF: t / (1 + t),
    gap: c.d,
    snap: c.at,
    N: c.k + 1,
    stages: [...up.pts.slice(0, k + 1), c.at],
    feasible: c.d < tolerance,
  };
}

/**
 * Move D onto a feasible total-reflux split: alternately find the balanced B and
 * put D on the distillation line through it, until D, F and B are consistent.
 */
export function snapDistillate(sys: TernarySystem, P: number, F: Vec3, D: Vec3, iterations = 30): Vec3 {
  let d = D;
  for (let i = 0; i < iterations; i++) {
    const c = columnAtTotalReflux(sys, P, F, d);
    if (!c) break;
    if (c.gap < 2e-4) break;
    d = c.snap;
  }
  return d;
}

/** Bubble temperature of each pure component at P (°C), for labels. */
export const vertexT = (sys: TernarySystem, P: number) =>
  [0, 1, 2].map((i) => {
    const x = [0, 0, 0];
    x[i] = 1;
    return bubble(sys, x as Vec3, P).T;
  });

