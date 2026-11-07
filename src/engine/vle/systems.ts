/**
 * Binary vapour–liquid equilibrium systems for the graphical workbenches.
 *
 * Every system exposes y*(x) (light-key vapour in equilibrium with liquid x) on
 * [0, 1]. Four kinds:
 *   • 'alpha'     — constant relative volatility, y* = αx / (1 + (α−1)x)
 *   • 'ideal'     — Raoult's law with Antoine vapour pressures (isobaric)
 *   • 'activity'  — modified Raoult's law, Van Laar activity coefficients
 *   • 'datasheet' — tabulated experimental y–x(–T) points, linear interpolation
 *
 * Model-based systems are evaluated once on a fine grid and then interpolated,
 * so every kind is handled the same way downstream.
 */

import { METHANOL_WATER } from '../data/methanolWater';
import { brent, linspace } from '../numerics';
import { COMPONENTS } from '../components';
import { saturationTemperature, vaporPressure } from '../thermodynamics';

export type VleKind = 'alpha' | 'ideal' | 'activity' | 'datasheet';

export interface VleSystem {
  id: string;
  name: string;
  /** light / heavy component names (x counts the light one) */
  light: string;
  heavy: string;
  kind: VleKind;
  /** system pressure, kPa (NaN for the artificial system) */
  P: number;
  /** y*(x) */
  y: (x: number) => number;
  /** bubble temperature, °C, where known */
  T?: (x: number) => number;
  /** minimum-boiling azeotrope (light-key mole fraction), if any */
  azeotrope: number | null;
  /** constant α (only for kind 'alpha') */
  alpha?: number;
  source: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Piecewise-linear interpolation on ascending xs. */
export function interp(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]!) / (xs[hi]! - xs[lo]!);
  return ys[lo]! + t * (ys[hi]! - ys[lo]!);
}

/** Interior crossing of y*(x) = x (minimum-boiling azeotrope), refined by Brent. */
export function findAzeotrope(y: (x: number) => number, n = 400): number | null {
  const xs = linspace(0.01, 0.99, n);
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1]!;
    const b = xs[i]!;
    const fa = y(a) - a;
    const fb = y(b) - b;
    if (fa > 0 && fb <= 0) return brent((x) => y(x) - x, a, b, { tol: 1e-10 });
  }
  return null;
}

const MMHG_TO_KPA = 0.133322368;

/** Antoine constants (log10 P/mmHg = A − B/(C + T/°C)), Dean, Lange's Handbook. */
const ANTOINE = {
  water: { A: 8.07131, B: 1730.63, C: 233.426 },
  ethanol: { A: 8.20417, B: 1642.89, C: 230.3 },
  isopropanol: { A: 8.87829, B: 2010.33, C: 252.636 },
} as const;
type Polar = keyof typeof ANTOINE;
const psat = (c: Polar, Tc: number) => MMHG_TO_KPA * 10 ** (ANTOINE[c].A - ANTOINE[c].B / (ANTOINE[c].C + Tc));

function gridSystem(xs: number[], ys: number[], Ts: number[] | null) {
  return {
    y: (x: number) => interp(xs, ys, x),
    T: Ts ? (x: number) => interp(xs, Ts, x) : undefined,
  };
}

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

export function alphaSystem(alpha: number): VleSystem {
  return {
    id: 'artificial',
    name: 'Artificial (constant α)',
    light: 'A',
    heavy: 'B',
    kind: 'alpha',
    P: Number.NaN,
    y: (x) => (alpha * x) / (1 + (alpha - 1) * x),
    azeotrope: null,
    alpha,
    source: 'y* = αx / (1 + (α − 1)x)',
  };
}

function idealSystem(id: string, a: keyof typeof COMPONENTS, b: keyof typeof COMPONENTS, P: number): VleSystem {
  const ca = COMPONENTS[a];
  const cb = COMPONENTS[b];
  const xs = linspace(0, 1, 401);
  const Ts: number[] = [];
  const ys = xs.map((x) => {
    const lo = Math.min(saturationTemperature(ca, P), saturationTemperature(cb, P)) - 1e-6;
    const hi = Math.max(saturationTemperature(ca, P), saturationTemperature(cb, P)) + 1e-6;
    const T = brent((t) => x * vaporPressure(ca, t) + (1 - x) * vaporPressure(cb, t) - P, lo, hi);
    Ts.push(T - 273.15);
    return (x * vaporPressure(ca, T)) / P;
  });
  return {
    id,
    name: `${ca.name} / ${cb.name} at ${(P / 100).toFixed(2)} bar`,
    light: ca.name,
    heavy: cb.name,
    kind: 'ideal',
    P,
    ...gridSystem(xs, ys, Ts),
    azeotrope: null,
    source: "Raoult's law, Antoine vapour pressures",
  };
}

/**
 * Modified Raoult's law with Van Laar activity coefficients (polar + water):
 *   ln γ₁ = A₁₂ (A₂₁x₂ / (A₁₂x₁ + A₂₁x₂))²,  ln γ₂ = A₂₁ (A₁₂x₁ / (A₁₂x₁ + A₂₁x₂))²
 */
function vanLaarWaterSystem(id: string, light: Exclude<Polar, 'water'>, name: string, A12: number, A21: number, P: number): VleSystem {
  const xs = linspace(0, 1, 401);
  const Ts: number[] = [];
  const ys = xs.map((x1) => {
    const x2 = 1 - x1;
    const d = A12 * x1 + A21 * x2;
    const g1 = Math.exp(A12 * ((A21 * x2) / d) ** 2);
    const g2 = Math.exp(A21 * ((A12 * x1) / d) ** 2);
    const T = brent((t) => x1 * g1 * psat(light, t) + x2 * g2 * psat('water', t) - P, 20, 130);
    Ts.push(T);
    return (x1 * g1 * psat(light, T)) / P;
  });
  const sys = gridSystem(xs, ys, Ts);
  return {
    id,
    name,
    light: light === 'ethanol' ? 'Ethanol' : 'Isopropanol',
    heavy: 'Water',
    kind: 'activity',
    P,
    ...sys,
    azeotrope: findAzeotrope(sys.y),
    source: `Van Laar (A₁₂ = ${A12}, A₂₁ = ${A21}, Perry's) + Antoine`,
  };
}



function datasheetSystem(): VleSystem {
  const xs = METHANOL_WATER.map((r) => r[0]);
  const ys = METHANOL_WATER.map((r) => r[1]);
  const Ts = METHANOL_WATER.map((r) => r[2]);
  return {
    id: 'methanol-water',
    name: 'Methanol / Water at 1.013 bar',
    light: 'Methanol',
    heavy: 'Water',
    kind: 'datasheet',
    P: 101.325,
    ...gridSystem(xs, ys, Ts),
    azeotrope: null,
    source: "Datasheet — Perry's Handbook, linear between points",
  };
}

// ---------------------------------------------------------------------------
// catalogue
// ---------------------------------------------------------------------------

export type SystemId =
  | 'artificial'
  | 'benzene-toluene'
  | 'hexane-heptane'
  | 'methanol-water'
  | 'ethanol-water'
  | 'isopropanol-water';

const cache = new Map<SystemId, VleSystem>();

/** Real systems are built lazily and cached; the artificial one depends on α. */
export function getSystem(id: SystemId, alpha = 2): VleSystem {
  if (id === 'artificial') return alphaSystem(alpha);
  const hit = cache.get(id);
  if (hit) return hit;
  const built =
    id === 'benzene-toluene'
      ? idealSystem(id, 'benzene', 'toluene', 101.325)
      : id === 'hexane-heptane'
        ? idealSystem(id, 'n-hexane', 'n-heptane', 101.325)
        : id === 'methanol-water'
          ? datasheetSystem()
          : id === 'ethanol-water'
            ? vanLaarWaterSystem(id, 'ethanol', 'Ethanol / Water at 1.013 bar', 1.6798, 0.9227, 101.325)
            : vanLaarWaterSystem(id, 'isopropanol', 'Isopropanol / Water at 1.013 bar', 2.4702, 1.0938, 101.325);
  cache.set(id, built);
  return built;
}

export const SYSTEM_OPTIONS: { id: SystemId; label: string }[] = [
  { id: 'artificial', label: 'Artificial — constant α' },
  { id: 'benzene-toluene', label: 'Benzene / Toluene · 1.013 bar (Raoult)' },
  { id: 'hexane-heptane', label: 'n-Hexane / n-Heptane · 1.013 bar (Raoult)' },
  { id: 'methanol-water', label: 'Methanol / Water · 1.013 bar (datasheet)' },
  { id: 'ethanol-water', label: 'Ethanol / Water · 1.013 bar (Van Laar, azeotrope)' },
  { id: 'isopropanol-water', label: 'Isopropanol / Water · 1.013 bar (Van Laar, azeotrope)' },
];
