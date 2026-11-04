/**
 * Ternary vapour–liquid equilibrium for the distillation-line workbench.
 *
 * Modified Raoult's law  y_i·P = x_i·γ_i(x)·P_i°(T), with
 *   • γ = 1 (ideal mixtures), or
 *   • Wilson:  ln γ_i = 1 − ln Σ_j x_j Λ_ij − Σ_k x_k Λ_ki / Σ_j x_j Λ_kj
 *     (temperature-independent Λ — adequate for the narrow boiling range here).
 *
 * Binary Wilson pairs are fitted to the literature azeotrope of each pair (its
 * composition and boiling point at 1 atm), so the model reproduces the binary
 * azeotropes exactly; the ternary behaviour is then a prediction.
 */

import { brent } from '../numerics';

export type Vec3 = [number, number, number];

export interface Antoine {
  /** log10(P/mmHg) = A − B/(C + T/°C) */
  A: number;
  B: number;
  C: number;
}

export interface TernaryComponent {
  name: string;
  short: string;
  antoine: Antoine;
}

export interface TernarySystem {
  id: string;
  name: string;
  comps: [TernaryComponent, TernaryComponent, TernaryComponent];
  /** Wilson Λ_ij (Λ_ii = 1); null → ideal */
  wilson: number[][] | null;
  note: string;
}

const MMHG_TO_BAR = 0.00133322368;

/** Vapour pressure in bar at T in °C. */
export const psat = (a: Antoine, T: number) => MMHG_TO_BAR * 10 ** (a.A - a.B / (a.C + T));
/** Boiling point in °C at P in bar. */
export const tsat = (a: Antoine, P: number) => a.B / (a.A - Math.log10(P / MMHG_TO_BAR)) - a.C;

export function gammas(sys: TernarySystem, x: readonly number[]): number[] {
  const L = sys.wilson;
  if (!L) return [1, 1, 1];
  const n = x.length;
  const S = Array.from({ length: n }, (_, i) => x.reduce((s, xj, j) => s + xj * L[i]![j]!, 0));
  return Array.from({ length: n }, (_, i) => {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += (x[k]! * L[k]![i]!) / S[k]!;
    return Math.exp(1 - Math.log(S[i]!) - sum);
  });
}

export interface Equilibrium {
  T: number;
  x: Vec3;
  y: Vec3;
}

const norm = (v: number[]): Vec3 => {
  const s = v[0]! + v[1]! + v[2]!;
  return [v[0]! / s, v[1]! / s, v[2]! / s];
};

/** Bubble point: Σ x_i γ_i P_i°(T) = P → T, y. */
export function bubble(sys: TernarySystem, x: Vec3, P: number): Equilibrium {
  const g = gammas(sys, x);
  const ts = sys.comps.map((c) => tsat(c.antoine, P));
  const lo = Math.min(...ts) - 60;
  const hi = Math.max(...ts) + 60;
  const T = brent((t) => Math.log(sys.comps.reduce((s, c, i) => s + x[i]! * g[i]! * psat(c.antoine, t), 0) / P), lo, hi, { tol: 1e-10 });
  const y = norm(sys.comps.map((c, i) => (x[i]! * g[i]! * psat(c.antoine, T)) / P));
  return { T, x, y };
}

/** Dew point: liquid x in equilibrium with vapour y (successive substitution on γ). */
export function dew(sys: TernarySystem, y: Vec3, P: number): Equilibrium {
  const ts = sys.comps.map((c) => tsat(c.antoine, P));
  const lo = Math.min(...ts) - 60;
  const hi = Math.max(...ts) + 60;
  let g = [1, 1, 1];
  let x: Vec3 = [...y] as Vec3;
  let T = 0;
  for (let it = 0; it < 200; it++) {
    const gg = g;
    T = brent((t) => Math.log(P * sys.comps.reduce((s, c, i) => s + y[i]! / (gg[i]! * psat(c.antoine, t)), 0)), lo, hi, { tol: 1e-10 });
    const xn = norm(sys.comps.map((c, i) => (y[i]! * P) / (gg[i]! * psat(c.antoine, T))));
    const dx = Math.abs(xn[0] - x[0]) + Math.abs(xn[1] - x[1]) + Math.abs(xn[2] - x[2]);
    x = xn;
    if (!sys.wilson) break;
    g = gammas(sys, x);
    if (dx < 1e-12) break;
  }
  return { T, x, y };
}

// ---------------------------------------------------------------------------
// Wilson fit to a binary azeotrope
// ---------------------------------------------------------------------------

/** Binary Wilson ln γ for (Λ12, Λ21) at x1. */
function wilsonBinary(L12: number, L21: number, x1: number): [number, number] {
  const x2 = 1 - x1;
  const a = x1 + L12 * x2;
  const b = x2 + L21 * x1;
  const t = L12 / a - L21 / b;
  return [-Math.log(a) + x2 * t, -Math.log(b) - x1 * t];
}

/**
 * Λ12, Λ21 such that the pair boils as an azeotrope at (x1, T) and P:
 * γ_i = P / P_i°(T) for both components.
 *
 * The two equations can have several roots, so a coarse grid over ln Λ finds the
 * candidates, Newton polishes each, and the most moderate exact root (smallest
 * |ln Λ12| + |ln Λ21|) is kept.
 */
export function fitWilsonToAzeotrope(c1: Antoine, c2: Antoine, x1: number, T: number, P = 1.01325): [number, number] {
  const target = [Math.log(P / psat(c1, T)), Math.log(P / psat(c2, T))];
  const f = (u: number[]) => {
    const [g1, g2] = wilsonBinary(Math.exp(u[0]!), Math.exp(u[1]!), x1);
    return [g1 - target[0]!, g2 - target[1]!];
  };
  const res = (u: number[]) => Math.hypot(...f(u));
  const newton = (u0: number[]) => {
    let u = [...u0];
    for (let it = 0; it < 80; it++) {
      const r = f(u);
      if (Math.hypot(r[0]!, r[1]!) < 1e-14) break;
      const h = 1e-7;
      const a = f([u[0]! + h, u[1]!]);
      const b = f([u[0]!, u[1]! + h]);
      const J00 = (a[0]! - r[0]!) / h;
      const J01 = (b[0]! - r[0]!) / h;
      const J10 = (a[1]! - r[1]!) / h;
      const J11 = (b[1]! - r[1]!) / h;
      const det = J00 * J11 - J01 * J10;
      if (Math.abs(det) < 1e-14) break;
      const d0 = (J11 * r[0]! - J01 * r[1]!) / det;
      const d1 = (-J10 * r[0]! + J00 * r[1]!) / det;
      const sc = Math.min(1, 0.5 / Math.max(Math.abs(d0), Math.abs(d1), 1e-12));
      u = [u[0]! - sc * d0, u[1]! - sc * d1];
    }
    return u;
  };
  const roots: number[][] = [];
  for (let a = -4; a <= 3; a += 0.25) {
    for (let b = -4; b <= 3; b += 0.25) {
      if (res([a, b]) > 0.3) continue;
      const u = newton([a, b]);
      if (res(u) < 1e-10 && Math.abs(u[0]!) < 6 && Math.abs(u[1]!) < 6) roots.push(u);
    }
  }
  if (!roots.length) throw new Error('Wilson fit to the azeotrope did not converge');
  roots.sort((p, q) => Math.abs(p[0]!) + Math.abs(p[1]!) - (Math.abs(q[0]!) + Math.abs(q[1]!)));
  return [Math.exp(roots[0]![0]!), Math.exp(roots[0]![1]!)];
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** Antoine constants (mmHg, °C), Dean — Lange's Handbook. */
const ANT = {
  hexane: { A: 6.87601, B: 1171.17, C: 224.41 },
  cyclohexane: { A: 6.8413, B: 1201.53, C: 222.65 },
  heptane: { A: 6.89677, B: 1264.9, C: 216.54 },
  acetone: { A: 7.11714, B: 1210.595, C: 229.664 },
  chloroform: { A: 6.95465, B: 1170.966, C: 226.232 },
  methanol: { A: 8.08097, B: 1582.271, C: 239.726 },
} satisfies Record<string, Antoine>;

/**
 * Binary azeotropes at 1.013 bar (Horsley, Azeotropic Data), as mole fraction of
 * the first component of the pair and boiling point in °C.
 */
export const ACM_AZEOTROPES = {
  'acetone-chloroform': { x1: 0.339, T: 64.4 }, // maximum-boiling
  'acetone-methanol': { x1: 0.802, T: 55.5 }, // minimum-boiling
  'chloroform-methanol': { x1: 0.65, T: 53.5 }, // minimum-boiling
} as const;

function acetoneChloroformMethanol(): TernarySystem {
  const L = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const pairs: [number, number, keyof typeof ACM_AZEOTROPES, Antoine, Antoine][] = [
    [0, 1, 'acetone-chloroform', ANT.acetone, ANT.chloroform],
    [0, 2, 'acetone-methanol', ANT.acetone, ANT.methanol],
    [1, 2, 'chloroform-methanol', ANT.chloroform, ANT.methanol],
  ];
  for (const [i, j, key, a, b] of pairs) {
    const { x1, T } = ACM_AZEOTROPES[key];
    const [Lij, Lji] = fitWilsonToAzeotrope(a, b, x1, T);
    L[i]![j] = Lij;
    L[j]![i] = Lji;
  }
  return {
    id: 'acm',
    name: 'Acetone / Chloroform / Methanol — azeotropic',
    comps: [
      { name: 'Acetone', short: 'Ace', antoine: ANT.acetone },
      { name: 'Chloroform', short: 'Chl', antoine: ANT.chloroform },
      { name: 'Methanol', short: 'MeOH', antoine: ANT.methanol },
    ],
    wilson: L,
    note: 'Wilson, each binary fitted to its literature azeotrope; the ternary azeotrope is predicted.',
  };
}

let acm: TernarySystem | null = null;

export const TERNARY_SYSTEMS: { id: string; label: string; get: () => TernarySystem }[] = [
  {
    id: 'hch',
    label: 'Hexane / Cyclohexane / Heptane — zeotropic reference',
    get: () => ({
      id: 'hch',
      name: 'Hexane / Cyclohexane / Heptane — zeotropic reference',
      comps: [
        { name: 'n-Hexane', short: 'C6', antoine: ANT.hexane },
        { name: 'Cyclohexane', short: 'cC6', antoine: ANT.cyclohexane },
        { name: 'n-Heptane', short: 'C7', antoine: ANT.heptane },
      ],
      wilson: null,
      note: "Ideal mixture — Raoult's law with Antoine vapour pressures.",
    }),
  },
  { id: 'acm', label: 'Acetone / Chloroform / Methanol — four azeotropes', get: () => (acm ??= acetoneChloroformMethanol()) },
];
