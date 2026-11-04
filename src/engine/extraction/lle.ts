/**
 * Liquid–liquid equilibrium of ternary extraction systems
 * (solute A, carrier C, solvent S), as a set of tie lines in mass fractions.
 *
 * Two sources:
 *   • tabulated tie-line data (Treybal, Mass-Transfer Operations), and
 *   • UNIFAC predictions: an isothermal LLE flash (K_i = γ_i^R / γ_i^E with
 *     Rachford–Rice), continued from the carrier–solvent binary towards the
 *     plait point by adding solute.
 *
 * From the tie lines the page derives both representations of the lecture:
 *   • the ternary diagram (binodal + tie lines) for Hunter–Nash, and
 *   • the loading diagram Y*(X) — X = A/C in the raffinate, Y = A/S in the
 *     extract — for cross- and counter-current cascades, with carrier and
 *     solvent taken as immiscible.
 */

import { brent } from '../numerics';
import { COMPONENTS_LLE as UC, unifac, type UnifacComponent } from './unifac';

/** Mass fractions (solute A, carrier C, solvent S). */
export type W3 = [number, number, number];

export interface TieLine {
  R: W3;
  E: W3;
}

export interface LLESystem {
  id: string;
  name: string;
  solute: string;
  carrier: string;
  solvent: string;
  T: number;
  source: 'data' | 'unifac';
  note: string;
  /** tie lines ordered by rising solute content (absent for loading-only data) */
  tieLines: TieLine[] | null;
  /** equilibrium loadings (X raffinate, Y extract), from (0, 0) upwards */
  loading: { X: number[]; Y: number[] };
  /** whether the last tie line is (close to) the plait point */
  plait: W3 | null;
}

// ---------------------------------------------------------------------------
// Loading curve helpers
// ---------------------------------------------------------------------------

function loadingFromTies(ties: TieLine[]) {
  const X = [0];
  const Y = [0];
  for (const t of ties) {
    const x = t.R[0] / t.R[1];
    const y = t.E[0] / t.E[2];
    if (x > X.at(-1)! + 1e-9 && y > Y.at(-1)!) {
      X.push(x);
      Y.push(y);
    }
  }
  return { X, Y };
}

const lerp = (xs: number[], ys: number[], x: number) => {
  if (x <= xs[0]!) return ys[0]!;
  const n = xs.length;
  if (x >= xs[n - 1]!) {
    // linear extrapolation on the last segment (flagged in the UI by the X range)
    const k = n - 2;
    return ys[k]! + ((ys[k + 1]! - ys[k]!) * (x - xs[k]!)) / (xs[k + 1]! - xs[k]!);
  }
  let i = 1;
  while (xs[i]! < x) i++;
  const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
  return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
};

/**
 * Monotone (Fritsch–Carlson) cubic through the loading points: smooth, and never
 * overshoots between data points.
 */
export function equilibriumCurve(sys: LLESystem) {
  const { X, Y } = sys.loading;
  const n = X.length;
  const d = X.slice(0, -1).map((x, i) => (Y[i + 1]! - Y[i]!) / (X[i + 1]! - x));
  const m = X.map((_, i) => (i === 0 ? d[0]! : i === n - 1 ? d[n - 2]! : d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  const Xmax = X[n - 1]!;
  const Ystar = (x: number) => {
    if (x <= 0) return 0;
    if (x >= Xmax) return lerp(X, Y, x);
    let i = 1;
    while (X[i]! < x) i++;
    const h = X[i]! - X[i - 1]!;
    const t = (x - X[i - 1]!) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    return h00 * Y[i - 1]! + h10 * h * m[i - 1]! + h01 * Y[i]! + h11 * h * m[i]!;
  };
  /** X*(Y): raffinate loading in equilibrium with extract Y. */
  const Xstar = (y: number) => {
    if (y <= 0) return 0;
    let hi = Xmax;
    while (Ystar(hi) < y && hi < 50 * Xmax) hi *= 1.5;
    return brent((x) => Ystar(x) - y, 0, hi, { tol: 1e-13 });
  };
  return { Ystar, Xstar, Xmax, Ymax: Y[n - 1]! };
}

// ---------------------------------------------------------------------------
// UNIFAC LLE flash and tie-line continuation
// ---------------------------------------------------------------------------

const toMass = (x: number[], mw: number[]): W3 => {
  const m = x.map((v, i) => v * mw[i]!);
  const s = m[0]! + m[1]! + m[2]!;
  return [m[0]! / s, m[1]! / s, m[2]! / s];
};

function flash(lnG: (x: number[]) => number[], z: number[], xR0: number[], xE0: number[]) {
  let xR = [...xR0];
  let xE = [...xE0];
  for (let it = 0; it < 400; it++) {
    const gR = lnG(xR);
    const gE = lnG(xE);
    const K = gR.map((g, i) => Math.exp(g - gE[i]!)); // x_E / x_R
    const rr = (b: number) => z.reduce((s, zi, i) => s + (zi * (K[i]! - 1)) / (1 + b * (K[i]! - 1)), 0);
    let beta: number;
    try {
      // bracket strictly between the poles
      const lo = Math.max(...K.map((k) => (k > 1 ? -1 / (k - 1) : -Infinity))) + 1e-12;
      const hi = Math.min(...K.map((k) => (k < 1 ? 1 / (1 - k) : Infinity))) - 1e-12;
      beta = brent(rr, Math.max(lo, -0.5), Math.min(hi, 1.5), { tol: 1e-14 });
    } catch {
      return null;
    }
    const nR = z.map((zi, i) => zi / (1 + beta * (K[i]! - 1)));
    const nE = nR.map((v, i) => v * K[i]!);
    const sR = nR.reduce((s, v) => s + v, 0);
    const sE = nE.reduce((s, v) => s + v, 0);
    const xRn = nR.map((v) => Math.max(v / sR, 1e-15));
    const xEn = nE.map((v) => Math.max(v / sE, 1e-15));
    const dx = xRn.reduce((s, v, i) => s + Math.abs(v - xR[i]!) + Math.abs(xEn[i]! - xE[i]!), 0);
    // damped successive substitution
    xR = xR.map((v, i) => 0.5 * v + 0.5 * xRn[i]!);
    xE = xE.map((v, i) => 0.5 * v + 0.5 * xEn[i]!);
    if (dx < 1e-12) return { xR: xRn, xE: xEn, beta };
  }
  return { xR, xE, beta: Number.NaN };
}

/** Tie lines from the carrier–solvent binary to (near) the plait point. */
export function unifacTieLines(solute: UnifacComponent, carrier: UnifacComponent, solvent: UnifacComponent, T = 298.15) {
  const comps = [solute, carrier, solvent];
  const mw = comps.map((c) => c.mw);
  const lnG = unifac(comps);
  const g = (x: number[]) => lnG(x, T);
  // binary carrier–solvent split
  let xR = [1e-9, 0.999, 0.001 - 1e-9];
  let xE = [1e-9, 0.001, 0.999 - 1e-9];
  let res = flash(g, [1e-9, 0.5, 0.5 - 1e-9], xR, xE);
  if (!res) throw new Error('No carrier–solvent split');
  const ties: TieLine[] = [];
  let plait: W3 | null = null;
  let h = 0.004;
  for (let k = 0; k < 400; k++) {
    xR = res.xR;
    xE = res.xE;
    const R = toMass(xR, mw);
    const E = toMass(xE, mw);
    const gap = Math.hypot(R[0] - E[0], R[1] - E[1], R[2] - E[2]);
    if (gap < 0.02) {
      plait = [(R[0] + E[0]) / 2, (R[1] + E[1]) / 2, (R[2] + E[2]) / 2];
      break;
    }
    if (!ties.length || Math.abs(R[0] - ties.at(-1)!.R[0]) > 0.004 || Math.abs(E[0] - ties.at(-1)!.E[0]) > 0.004) ties.push({ R, E });
    // next overall composition: move the tie-line midpoint towards pure solute
    const mid = xR.map((v, i) => 0.5 * (v + xE[i]!));
    const z = mid.map((v, i) => (1 - h) * v + (i === 0 ? h : 0));
    const next = flash(g, z, xR, xE);
    const triv = next && Math.abs(next.xR[0]! - next.xE[0]!) + Math.abs(next.xR[1]! - next.xE[1]!) < 1e-4;
    if (!next || triv || !Number.isFinite(next.beta)) {
      if (h < 2e-4) {
        plait = [(R[0] + E[0]) / 2, (R[1] + E[1]) / 2, (R[2] + E[2]) / 2];
        break;
      }
      h /= 2;
      continue;
    }
    res = next;
    h = Math.min(h * 1.3, 0.03);
  }
  return { ties, plait };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** Water (C) – acetic acid (A) – isopropyl ether (S), 20 °C, Treybal Table. Mass %. */
const TREYBAL_AA_IPE: { R: W3; E: W3 }[] = [
  { R: [0.69, 98.1, 1.2], E: [0.18, 0.5, 99.3] },
  { R: [1.41, 97.1, 1.5], E: [0.37, 0.7, 98.9] },
  { R: [2.89, 95.5, 1.6], E: [0.79, 0.8, 98.4] },
  { R: [6.42, 91.7, 1.9], E: [1.93, 1.0, 97.1] },
  { R: [13.3, 84.4, 2.3], E: [4.82, 1.9, 93.3] },
  { R: [25.5, 71.1, 3.4], E: [11.4, 3.9, 84.7] },
  { R: [36.7, 58.9, 4.4], E: [21.6, 6.9, 71.5] },
  { R: [44.3, 45.1, 10.6], E: [31.1, 10.8, 58.1] },
  { R: [46.4, 37.1, 16.5], E: [36.2, 15.1, 48.7] },
].map((t) => ({ R: t.R.map((v) => v / 100) as W3, E: t.E.map((v) => v / 100) as W3 }));

/** Water (C) – nicotine (A) – kerosene (S), 20 °C, Treybal: kg nicotine / kg water vs / kg kerosene. */
const TREYBAL_NICOTINE = {
  X: [0, 0.001011, 0.00246, 0.00502, 0.00751, 0.00998, 0.0204],
  Y: [0, 0.000807, 0.001961, 0.00456, 0.00686, 0.00913, 0.0187],
};

type Key = 'acetone' | 'ethanol' | 'toluene' | 'benzene' | 'mibk';
const predicted: { id: string; solute: Key; solvent: Key }[] = [
  { id: 'acetone-toluene', solute: 'acetone', solvent: 'toluene' },
  { id: 'acetone-benzene', solute: 'acetone', solvent: 'benzene' },
  { id: 'acetone-mibk', solute: 'acetone', solvent: 'mibk' },
  { id: 'ethanol-toluene', solute: 'ethanol', solvent: 'toluene' },
  { id: 'ethanol-benzene', solute: 'ethanol', solvent: 'benzene' },
];

const cache = new Map<string, LLESystem>();

export const LLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'aa-ipe', label: 'Water / Acetic acid / Isopropyl ether · 20 °C (Treybal data)' },
  { id: 'nicotine-kerosene', label: 'Water / Nicotine / Kerosene · 20 °C (Treybal data, loading only)' },
  ...predicted.map((p) => ({
    id: p.id,
    label: `Water / ${UC[p.solute].name} / ${UC[p.solvent].name} · 25 °C (UNIFAC)`,
  })),
];

export function getLLE(id: string): LLESystem {
  const hit = cache.get(id);
  if (hit) return hit;
  let sys: LLESystem;
  if (id === 'aa-ipe') {
    sys = {
      id,
      name: 'Water / Acetic acid / Isopropyl ether',
      solute: 'Acetic acid',
      carrier: 'Water',
      solvent: 'Isopropyl ether',
      T: 20,
      source: 'data',
      note: 'Tie-line data at 20 °C, Treybal, Mass-Transfer Operations (classic Hunter–Nash example).',
      tieLines: TREYBAL_AA_IPE,
      loading: loadingFromTies(TREYBAL_AA_IPE),
      plait: null,
    };
  } else if (id === 'nicotine-kerosene') {
    sys = {
      id,
      name: 'Water / Nicotine / Kerosene',
      solute: 'Nicotine',
      carrier: 'Water',
      solvent: 'Kerosene',
      T: 20,
      source: 'data',
      note: 'Distribution data in mass ratios at 20 °C, Treybal — water and kerosene practically immiscible.',
      tieLines: null,
      loading: TREYBAL_NICOTINE,
      plait: null,
    };
  } else {
    const p = predicted.find((q) => q.id === id);
    if (!p) throw new Error(`Unknown LLE system ${id}`);
    const { ties, plait } = unifacTieLines(UC[p.solute], UC.water, UC[p.solvent]);
    sys = {
      id,
      name: `Water / ${UC[p.solute].name} / ${UC[p.solvent].name}`,
      solute: UC[p.solute].name,
      carrier: 'Water',
      solvent: UC[p.solvent].name,
      T: 25,
      source: 'unifac',
      note: 'Predicted with UNIFAC (Hansen et al. 1991) — qualitative: binodal shape and tie-line slope, not design data.',
      tieLines: ties,
      loading: loadingFromTies(ties),
      plait,
    };
  }
  cache.set(id, sys);
  return sys;
}
