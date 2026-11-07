/**
 * Thermodynamics engine — ideal vapour–liquid equilibrium and enthalpy balances.
 *
 * Model (the "Raoult's law" property package):
 *   • Liquid: ideal solution        → activity coefficients γᵢ = 1
 *   • Vapour: ideal gas (Dalton)    → partial pressure pᵢ = yᵢ·P
 *   • Raoult: pᵢ = xᵢ·Pᵢ°(T)        → K-value Kᵢ = yᵢ/xᵢ = Pᵢ°(T)/P
 *   • Pᵢ°(T) from the Antoine equation
 *
 * Enthalpy reference: pure liquid at T_ref = 298.15 K, H = 0. Ideal mixing
 * (no heat of mixing). Vapour path per component: heat liquid to Tb, vaporise
 * at Tb, heat ideal gas from Tb to T — so the latent heat varies linearly with T
 * (Kirchhoff): ΔHvap(T) = ΔHvap(Tb) + (cpV − cpL)(T − Tb).
 *
 * Units: T [K], P [kPa], H [J/mol] (= kJ/kmol), F [kmol/h], Q [kW].
 *
 * The core functions take composition vectors so they serve the binary
 * McCabe–Thiele work and the multicomponent MESH solver alike; binary
 * wrappers at the bottom map to the `{ compA, compB }` stream schema.
 */

import {
  COMPONENTS,
  DEFAULT_SYSTEM,
  type BinarySystem,
  type PureComponent,
} from './components';
import { brent, linspace, sum } from './numerics';
import { binaryPackage } from './propertyPackage';

export const T_REF = 298.15;
const MMHG_TO_KPA = 0.133322368;
const T_SEARCH_MIN = 150;
const T_SEARCH_MAX = 900;

export type Composition = readonly number[];

/**
 * A property package: the components plus, optionally, an activity model
 * γ(x) for the liquid (modified Raoult's law). Without `gamma` the package is
 * ideal and every function below reduces to plain Raoult/Dalton.
 */
export type Comps = readonly PureComponent[] & { gamma?: (x: Composition) => number[] };

// ---------------------------------------------------------------------------
// Pure-component vapour pressure (Antoine)
// ---------------------------------------------------------------------------

/** Saturation pressure Pᵢ°(T) [kPa]. */
export function vaporPressure(c: PureComponent, T: number): number {
  const { A, B, C } = c.antoine;
  return MMHG_TO_KPA * 10 ** (A - B / (C + (T - 273.15)));
}

/** Saturation temperature Tᵢ^sat(P) [K] — analytic inverse of Antoine. */
export function saturationTemperature(c: PureComponent, P: number): number {
  const { A, B, C } = c.antoine;
  return B / (A - Math.log10(P / MMHG_TO_KPA)) - C + 273.15;
}

// ---------------------------------------------------------------------------
// Raoult / Dalton equilibrium
// ---------------------------------------------------------------------------

/** K-values Kᵢ = γᵢ(x)·Pᵢ°(T)/P (modified Raoult + Dalton; γ = 1 for an ideal package). */
export function kValues(comps: Comps, T: number, P: number, x?: Composition): number[] {
  const g = comps.gamma && x ? comps.gamma(x) : null;
  return comps.map((c, i) => ((g ? g[i]! : 1) * vaporPressure(c, T)) / P);
}

/** Relative volatility αᵢⱼ = Kᵢ/Kⱼ = Pᵢ°/Pⱼ° (pressure-independent for an ideal system). */
export function relativeVolatility(light: PureComponent, heavy: PureComponent, T: number): number {
  return vaporPressure(light, T) / vaporPressure(heavy, T);
}

/**
 * Column-average α: geometric mean of α at the top (≈ T^sat of the light key)
 * and the bottom (≈ T^sat of the heavy key) at column pressure P.
 */
export function averageRelativeVolatility(light: PureComponent, heavy: PureComponent, P: number): number {
  const aTop = relativeVolatility(light, heavy, saturationTemperature(light, P));
  const aBot = relativeVolatility(light, heavy, saturationTemperature(heavy, P));
  return Math.sqrt(aTop * aBot);
}

/**
 * Bracket for bubble/dew temperatures. Ideal mixtures boil between the pure
 * components; with an activity model an azeotrope can lie outside, so widen it.
 */
function saturationBracket(comps: Comps, z: Composition, P: number): [number, number] {
  const ts = comps.filter((_, i) => (z[i] ?? 0) > 0).map((c) => saturationTemperature(c, P));
  const w = comps.gamma ? 40 : 1e-6;
  return [Math.min(...ts) - w, Math.max(...ts) + w];
}

export interface SaturationPoint {
  T: number;
  P: number;
  /** liquid composition */
  x: number[];
  /** vapour composition */
  y: number[];
}

/** Bubble pressure at T: P = Σ xᵢγᵢPᵢ°(T); yᵢ = xᵢγᵢPᵢ°/P. */
export function bubblePressure(comps: Comps, x: Composition, T: number): SaturationPoint {
  const g = comps.gamma ? comps.gamma(x) : null;
  const ps = comps.map((c, i) => (g ? g[i]! : 1) * vaporPressure(c, T));
  const P = sum(ps.map((p, i) => (x[i] ?? 0) * p));
  return { T, P, x: [...x], y: ps.map((p, i) => ((x[i] ?? 0) * p) / P) };
}

/** Dew pressure at T: 1/P = Σ yᵢ/(γᵢPᵢ°(T)); xᵢ = yᵢP/(γᵢPᵢ°) — iterated on γ(x). */
export function dewPressure(comps: Comps, y: Composition, T: number): SaturationPoint {
  const p0 = comps.map((c) => vaporPressure(c, T));
  let x = [...y];
  let P = 0;
  for (let it = 0; it < (comps.gamma ? 200 : 1); it++) {
    const g = comps.gamma ? comps.gamma(x) : null;
    const ps = p0.map((p, i) => (g ? g[i]! : 1) * p);
    P = 1 / sum(ps.map((p, i) => (y[i] ?? 0) / p));
    const xn = ps.map((p, i) => ((y[i] ?? 0) * P) / p);
    const s0 = sum(xn);
    const dx = xn.reduce((a, v, i) => a + Math.abs(v / s0 - x[i]!), 0);
    x = xn.map((v) => v / s0);
    if (dx < 1e-13) break;
  }
  return { T, P, x, y: [...y] };
}

/** Bubble temperature at P: solve Σ xᵢKᵢ(T, x) = 1 (γ depends on x only, so x is fixed). */
export function bubbleTemperature(comps: Comps, x: Composition, P: number): SaturationPoint {
  const [lo, hi] = saturationBracket(comps, x, P);
  const T = brent((t) => Math.log(sum(kValues(comps, t, P, x).map((k, i) => k * (x[i] ?? 0)))), lo, hi);
  const K = kValues(comps, T, P, x);
  const y = K.map((k, i) => k * (x[i] ?? 0));
  const sy = sum(y);
  return { T, P, x: [...x], y: y.map((v) => v / sy) };
}

/** Dew temperature at P: solve Σ yᵢ/Kᵢ(T, x) = 1, iterating x for an activity model. */
export function dewTemperature(comps: Comps, y: Composition, P: number): SaturationPoint {
  const [lo, hi] = saturationBracket(comps, y, P);
  let x = [...y];
  let T = 0;
  for (let it = 0; it < (comps.gamma ? 200 : 1); it++) {
    const xx = x;
    T = brent((t) => -Math.log(sum(kValues(comps, t, P, xx).map((k, i) => (y[i] ?? 0) / k))), lo, hi);
    const K = kValues(comps, T, P, x);
    const xn = K.map((k, i) => (y[i] ?? 0) / k);
    const s0 = sum(xn);
    const dx = xn.reduce((a, v, i) => a + Math.abs(v / s0 - x[i]!), 0);
    x = xn.map((v) => v / s0);
    if (dx < 1e-13) break;
  }
  return { T, P, x, y: [...y] };
}

// ---------------------------------------------------------------------------
// Equilibrium curves
// ---------------------------------------------------------------------------

/** Constant-α equilibrium line y = αx / (1 + (α − 1)x). */
export const yFromAlpha = (alpha: number, x: number) => (alpha * x) / (1 + (alpha - 1) * x);

/** Inverse: x = y / (α − (α − 1)y). Used for McCabe–Thiele stage stepping. */
export const xFromAlpha = (alpha: number, y: number) => y / (alpha - (alpha - 1) * y);

export interface XYPoint {
  x: number;
  y: number;
}

export function equilibriumCurveAlpha(alpha: number, n = 51): XYPoint[] {
  return linspace(0, 1, n).map((x) => ({ x, y: yFromAlpha(alpha, x) }));
}

export interface TxyPoint {
  /** light-key liquid fraction */
  x: number;
  /** light-key vapour fraction in equilibrium with x */
  y: number;
  /** bubble temperature of x  [K] */
  T: number;
}

/** Rigorous isobaric T–x–y diagram (and y–x curve) for a binary under Raoult's law. */
export function txyDiagram(sys: BinarySystem, P: number, n = 51): TxyPoint[] {
  const comps = [COMPONENTS[sys.A], COMPONENTS[sys.B]];
  return linspace(0, 1, n).map((x) => {
    const bp = bubbleTemperature(comps, [x, 1 - x], P);
    return { x, y: bp.y[0] ?? 0, T: bp.T };
  });
}

// ---------------------------------------------------------------------------
// Isothermal flash (Rachford–Rice)
// ---------------------------------------------------------------------------

export type Phase = 'liquid' | 'two-phase' | 'vapor';

export interface FlashResult {
  T: number;
  P: number;
  /** vapour fraction β = V/F, 0…1 */
  beta: number;
  phase: Phase;
  x: number[];
  y: number[];
  K: number[];
}

/**
 * TP flash. Rachford–Rice:  Σ zᵢ(Kᵢ − 1) / (1 + β(Kᵢ − 1)) = 0
 * Phase tests first: Σ zᵢKᵢ ≤ 1 → subcooled/saturated liquid; Σ zᵢ/Kᵢ ≤ 1 → vapour.
 */
export function flashTP(comps: Comps, z: Composition, T: number, P: number): FlashResult {
  if (comps.gamma) return flashTPActivity(comps, z, T, P);
  const K = kValues(comps, T, P);
  const zs = [...z];
  if (sum(K.map((k, i) => k * (zs[i] ?? 0))) <= 1) {
    return { T, P, beta: 0, phase: 'liquid', x: zs, y: zs, K };
  }
  if (sum(K.map((k, i) => (zs[i] ?? 0) / k)) <= 1) {
    return { T, P, beta: 1, phase: 'vapor', x: zs, y: zs, K };
  }
  const rr = (b: number) => sum(K.map((k, i) => ((zs[i] ?? 0) * (k - 1)) / (1 + b * (k - 1))));
  const beta = brent(rr, 0, 1, { tol: 1e-13 });
  const x = K.map((k, i) => (zs[i] ?? 0) / (1 + beta * (k - 1)));
  const y = K.map((k, i) => k * (x[i] ?? 0));
  return { T, P, beta, phase: 'two-phase', x, y, K };
}

/**
 * TP flash with an activity model: phase from the bubble and dew temperatures
 * of z, then successive substitution on K(T, x) with Rachford–Rice.
 */
function flashTPActivity(comps: Comps, z: Composition, T: number, P: number): FlashResult {
  const zs = [...z];
  const Tb = bubbleTemperature(comps, zs, P).T;
  if (T <= Tb) return { T, P, beta: 0, phase: 'liquid', x: zs, y: zs, K: kValues(comps, T, P, zs) };
  const dw = dewTemperature(comps, zs, P);
  if (T >= dw.T) return { T, P, beta: 1, phase: 'vapor', x: zs, y: zs, K: kValues(comps, T, P, dw.x) };
  // start from a linear guess between the bubble (β = 0) and dew (β = 1) liquids
  const f = (T - Tb) / (dw.T - Tb);
  let x = zs.map((v, i) => (1 - f) * v + f * dw.x[i]!);
  let K = kValues(comps, T, P, x);
  let beta = f;
  for (let it = 0; it < 300; it++) {
    const rr = (b: number) => sum(K.map((k, i) => ((zs[i] ?? 0) * (k - 1)) / (1 + b * (k - 1))));
    beta = rr(0) * rr(1) < 0 ? brent(rr, 0, 1, { tol: 1e-14 }) : rr(0) <= 0 ? 0 : 1;
    const xn = K.map((k, i) => (zs[i] ?? 0) / (1 + beta * (k - 1)));
    const s0 = sum(xn);
    const dx = xn.reduce((a, v, i) => a + Math.abs(v / s0 - x[i]!), 0);
    x = xn.map((v) => v / s0);
    K = kValues(comps, T, P, x);
    if (dx < 1e-13) break;
  }
  const y = K.map((k, i) => k * x[i]!);
  const sy = sum(y);
  return { T, P, beta, phase: 'two-phase', x, y: y.map((v) => v / sy), K };
}

// ---------------------------------------------------------------------------
// Enthalpy
// ---------------------------------------------------------------------------

/** Pure-component liquid enthalpy [J/mol] relative to liquid at T_REF. */
export const pureLiquidEnthalpy = (c: PureComponent, T: number) => c.cpL * (T - T_REF);

/** Pure-component ideal-gas enthalpy [J/mol] via the Tb vaporisation path. */
export const pureVaporEnthalpy = (c: PureComponent, T: number) =>
  c.cpL * (c.Tb - T_REF) + c.dHvap + c.cpV * (T - c.Tb);

/** Latent heat at T (Kirchhoff, linear in T). */
export const latentHeat = (c: PureComponent, T: number) => pureVaporEnthalpy(c, T) - pureLiquidEnthalpy(c, T);

export const liquidEnthalpy = (comps: Comps, x: Composition, T: number) =>
  sum(comps.map((c, i) => (x[i] ?? 0) * pureLiquidEnthalpy(c, T)));

export const vaporEnthalpy = (comps: Comps, y: Composition, T: number) =>
  sum(comps.map((c, i) => (y[i] ?? 0) * pureVaporEnthalpy(c, T)));

/** Molar enthalpy of a (possibly two-phase) flashed mixture. */
export const flashEnthalpy = (comps: Comps, f: FlashResult) =>
  (1 - f.beta) * liquidEnthalpy(comps, f.x, f.T) + f.beta * vaporEnthalpy(comps, f.y, f.T);

/** Molar enthalpy of overall composition z at (T, P). */
export const enthalpyTP = (comps: Comps, z: Composition, T: number, P: number) =>
  flashEnthalpy(comps, flashTP(comps, z, T, P));

/**
 * PH flash: find T (and phase split) such that H(T, P, z) = H.
 * H is strictly increasing in T across all phase regions, so the root is unique.
 */
export function flashPH(comps: Comps, z: Composition, P: number, H: number): FlashResult {
  const T = brent((t) => enthalpyTP(comps, z, t, P) - H, T_SEARCH_MIN, T_SEARCH_MAX, { tol: 1e-9 });
  return flashTP(comps, z, T, P);
}

// ---------------------------------------------------------------------------
// Feed thermal condition q
// ---------------------------------------------------------------------------

/**
 * q = (H_V,sat − H_F) / (H_V,sat − H_L,sat): moles of liquid added to the
 * stripping section per mole of feed. H_L,sat at the bubble point, H_V,sat at
 * the dew point of the overall composition z.
 */
export function thermalCondition(comps: Comps, z: Composition, P: number, H: number): number {
  const bub = bubbleTemperature(comps, z, P);
  const dew = dewTemperature(comps, z, P);
  const hL = liquidEnthalpy(comps, z, bub.T);
  const hV = vaporEnthalpy(comps, z, dew.T);
  return (hV - H) / (hV - hL);
}

/** Inverse of `thermalCondition`: the state (T, β, …) that has feed condition q. */
export function stateFromThermalCondition(
  comps: Comps,
  z: Composition,
  P: number,
  q: number,
): FlashResult {
  const bub = bubbleTemperature(comps, z, P);
  const dew = dewTemperature(comps, z, P);
  const hL = liquidEnthalpy(comps, z, bub.T);
  const hV = vaporEnthalpy(comps, z, dew.T);
  return flashPH(comps, z, P, hV - q * (hV - hL));
}

// ---------------------------------------------------------------------------
// Steady-state material & enthalpy balances on streams
// ---------------------------------------------------------------------------

export interface MaterialStream {
  /** kmol/h */
  F: number;
  T: number;
  P: number;
  z: number[];
}

export interface StreamState extends MaterialStream {
  /** J/mol */
  H: number;
  beta: number;
  phase: Phase;
  /** feed thermal condition */
  q: number;
  x: number[];
  y: number[];
}

/** Fully characterise a stream specified by (F, T, P, z). */
export function evaluateStream(comps: Comps, s: MaterialStream): StreamState {
  const f = flashTP(comps, s.z, s.T, s.P);
  const H = flashEnthalpy(comps, f);
  return { ...s, H, beta: f.beta, phase: f.phase, q: thermalCondition(comps, s.z, s.P, H), x: f.x, y: f.y };
}

export function fromPH(comps: Comps, F: number, z: number[], P: number, H: number): StreamState {
  const f = flashPH(comps, z, P, H);
  return { F, T: f.T, P, z, H, beta: f.beta, phase: f.phase, q: thermalCondition(comps, z, P, H), x: f.x, y: f.y };
}

/**
 * Adiabatic mixer. Material: F = ΣFⱼ, F·zᵢ = ΣFⱼzᵢⱼ.
 * Energy: F·H = ΣFⱼHⱼ. Outlet pressure = lowest inlet pressure.
 */
export function mixStreams(comps: Comps, inlets: readonly MaterialStream[]): StreamState {
  const live = inlets.filter((s) => s.F > 0);
  if (live.length === 0) throw new RangeError('mixStreams: no inlet flow');
  const F = sum(live.map((s) => s.F));
  const z = comps.map((_, i) => sum(live.map((s) => s.F * (s.z[i] ?? 0))) / F);
  const H = sum(live.map((s) => s.F * enthalpyTP(comps, s.z, s.T, s.P))) / F;
  const P = Math.min(...live.map((s) => s.P));
  return fromPH(comps, F, z, P, H);
}

/**
 * Heater / cooler with duty Q [kW] (Q < 0 cools).
 * Energy: H_out = H_in + 3600·Q / F   (kW → kJ/h; per kmol/h → kJ/kmol = J/mol).
 */
export function heatStream(
  comps: Comps,
  inlet: MaterialStream,
  Q: number,
  dP = 0,
): StreamState {
  if (inlet.F <= 0) throw new RangeError('heatStream: no inlet flow');
  const Hin = enthalpyTP(comps, inlet.z, inlet.T, inlet.P);
  return fromPH(comps, inlet.F, [...inlet.z], inlet.P - dP, Hin + (3600 * Q) / inlet.F);
}

// ---------------------------------------------------------------------------
// Validity diagnostics
// ---------------------------------------------------------------------------

/**
 * Tolerance for Antoine extrapolation before warning. Antoine fits of this kind
 * typically stay within ~1 % of measured P° for ~10 K beyond the fitted range
 * (e.g. benzene in toluene-column bottoms at ≈ 107–110 °C).
 */
export const ANTOINE_EXTRAPOLATION_MARGIN = 10;

/** Advisory warnings when T leaves the Antoine fit range (beyond the margin) or exceeds Tc. */
export function validityWarnings(comps: Comps, T: number): string[] {
  const tc = T - 273.15;
  const m = ANTOINE_EXTRAPOLATION_MARGIN;
  const out: string[] = [];
  for (const c of comps) {
    if (T >= c.Tc) out.push(`${c.name}: T = ${T.toFixed(1)} K is above Tc (${c.Tc} K)`);
    else if (tc < c.antoine.Tmin - m || tc > c.antoine.Tmax + m)
      out.push(`${c.name}: Antoine extrapolated (${c.antoine.Tmin}–${c.antoine.Tmax} °C)`);
  }
  return out;
}

/**
 * The isobaric y*(x) curve of a binary package on a fine grid, with its inverse
 * and the minimum-boiling azeotrope (where y* crosses the diagonal) as xMax.
 */
export function binaryEquilibrium(comps: Comps, P: number, n = 401) {
  const xs = linspace(0, 1, n);
  const ys = xs.map((x) => bubbleTemperature(comps, [x, 1 - x], P).y[0]!);
  const yOf = (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const f = x * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    return ys[i]! + (f - i) * (ys[i + 1]! - ys[i]!);
  };
  let xMax = 1;
  for (let i = 2; i < n - 2; i++) {
    if (ys[i]! - xs[i]! > 0 && ys[i + 1]! - xs[i + 1]! <= 0) {
      xMax = brent((x) => yOf(x) - x, xs[i]!, xs[i + 1]!, { tol: 1e-12 });
      break;
    }
  }
  const xOf = (y: number) => {
    if (y <= 0) return 0;
    if (y >= yOf(xMax)) return xMax;
    let lo = 0;
    let hi = xMax;
    for (let k = 0; k < 60; k++) {
      const m = 0.5 * (lo + hi);
      if (yOf(m) < y) lo = m;
      else hi = m;
    }
    return 0.5 * (lo + hi);
  };
  return { y: yOf, x: xOf, xMax, grid: { x: xs, y: ys } };
}

// ---------------------------------------------------------------------------
// Binary adapters for the `{ compA, compB }` stream schema
// ---------------------------------------------------------------------------

export interface BinaryFractions {
  compA: number;
  compB: number;
}

/** Property package of a binary system (with its activity model where one is defined). */
export const binaryComponents = (sys: BinarySystem = DEFAULT_SYSTEM): Comps => binaryPackage(sys);
export const toVector = (m: BinaryFractions): number[] => [m.compA, m.compB];
export const toBinary = (v: Composition): BinaryFractions => ({ compA: v[0] ?? 0, compB: v[1] ?? 0 });
