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

export const T_REF = 298.15;
const MMHG_TO_KPA = 0.133322368;
const T_SEARCH_MIN = 150;
const T_SEARCH_MAX = 900;

export type Composition = readonly number[];

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

/** K-values Kᵢ = Pᵢ°(T)/P (Raoult + Dalton). */
export function kValues(comps: readonly PureComponent[], T: number, P: number): number[] {
  return comps.map((c) => vaporPressure(c, T) / P);
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

/** Bracket for bubble/dew temperatures: they lie between the pure-component T^sat(P). */
function saturationBracket(comps: readonly PureComponent[], z: Composition, P: number): [number, number] {
  const ts = comps.filter((_, i) => (z[i] ?? 0) > 0).map((c) => saturationTemperature(c, P));
  return [Math.min(...ts) - 1e-6, Math.max(...ts) + 1e-6];
}

export interface SaturationPoint {
  T: number;
  P: number;
  /** liquid composition */
  x: number[];
  /** vapour composition */
  y: number[];
}

/** Bubble pressure at T: P = Σ xᵢPᵢ°(T); yᵢ = xᵢPᵢ°/P. */
export function bubblePressure(comps: readonly PureComponent[], x: Composition, T: number): SaturationPoint {
  const ps = comps.map((c) => vaporPressure(c, T));
  const P = sum(ps.map((p, i) => (x[i] ?? 0) * p));
  return { T, P, x: [...x], y: ps.map((p, i) => ((x[i] ?? 0) * p) / P) };
}

/** Dew pressure at T: 1/P = Σ yᵢ/Pᵢ°(T); xᵢ = yᵢP/Pᵢ°. */
export function dewPressure(comps: readonly PureComponent[], y: Composition, T: number): SaturationPoint {
  const ps = comps.map((c) => vaporPressure(c, T));
  const P = 1 / sum(ps.map((p, i) => (y[i] ?? 0) / p));
  return { T, P, x: ps.map((p, i) => ((y[i] ?? 0) * P) / p), y: [...y] };
}

/** Bubble temperature at P: solve Σ xᵢKᵢ(T) = 1. */
export function bubbleTemperature(comps: readonly PureComponent[], x: Composition, P: number): SaturationPoint {
  const [lo, hi] = saturationBracket(comps, x, P);
  const T = brent((t) => Math.log(sum(kValues(comps, t, P).map((k, i) => k * (x[i] ?? 0)))), lo, hi);
  const K = kValues(comps, T, P);
  return { T, P, x: [...x], y: K.map((k, i) => k * (x[i] ?? 0)) };
}

/** Dew temperature at P: solve Σ yᵢ/Kᵢ(T) = 1. */
export function dewTemperature(comps: readonly PureComponent[], y: Composition, P: number): SaturationPoint {
  const [lo, hi] = saturationBracket(comps, y, P);
  const T = brent((t) => -Math.log(sum(kValues(comps, t, P).map((k, i) => (y[i] ?? 0) / k))), lo, hi);
  const K = kValues(comps, T, P);
  return { T, P, x: K.map((k, i) => (y[i] ?? 0) / k), y: [...y] };
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
export function flashTP(comps: readonly PureComponent[], z: Composition, T: number, P: number): FlashResult {
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

export const liquidEnthalpy = (comps: readonly PureComponent[], x: Composition, T: number) =>
  sum(comps.map((c, i) => (x[i] ?? 0) * pureLiquidEnthalpy(c, T)));

export const vaporEnthalpy = (comps: readonly PureComponent[], y: Composition, T: number) =>
  sum(comps.map((c, i) => (y[i] ?? 0) * pureVaporEnthalpy(c, T)));

/** Molar enthalpy of a (possibly two-phase) flashed mixture. */
export const flashEnthalpy = (comps: readonly PureComponent[], f: FlashResult) =>
  (1 - f.beta) * liquidEnthalpy(comps, f.x, f.T) + f.beta * vaporEnthalpy(comps, f.y, f.T);

/** Molar enthalpy of overall composition z at (T, P). */
export const enthalpyTP = (comps: readonly PureComponent[], z: Composition, T: number, P: number) =>
  flashEnthalpy(comps, flashTP(comps, z, T, P));

/**
 * PH flash: find T (and phase split) such that H(T, P, z) = H.
 * H is strictly increasing in T across all phase regions, so the root is unique.
 */
export function flashPH(comps: readonly PureComponent[], z: Composition, P: number, H: number): FlashResult {
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
export function thermalCondition(comps: readonly PureComponent[], z: Composition, P: number, H: number): number {
  const bub = bubbleTemperature(comps, z, P);
  const dew = dewTemperature(comps, z, P);
  const hL = liquidEnthalpy(comps, z, bub.T);
  const hV = vaporEnthalpy(comps, z, dew.T);
  return (hV - H) / (hV - hL);
}

/** Inverse of `thermalCondition`: the state (T, β, …) that has feed condition q. */
export function stateFromThermalCondition(
  comps: readonly PureComponent[],
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
export function evaluateStream(comps: readonly PureComponent[], s: MaterialStream): StreamState {
  const f = flashTP(comps, s.z, s.T, s.P);
  const H = flashEnthalpy(comps, f);
  return { ...s, H, beta: f.beta, phase: f.phase, q: thermalCondition(comps, s.z, s.P, H), x: f.x, y: f.y };
}

function fromPH(comps: readonly PureComponent[], F: number, z: number[], P: number, H: number): StreamState {
  const f = flashPH(comps, z, P, H);
  return { F, T: f.T, P, z, H, beta: f.beta, phase: f.phase, q: thermalCondition(comps, z, P, H), x: f.x, y: f.y };
}

/**
 * Adiabatic mixer. Material: F = ΣFⱼ, F·zᵢ = ΣFⱼzᵢⱼ.
 * Energy: F·H = ΣFⱼHⱼ. Outlet pressure = lowest inlet pressure.
 */
export function mixStreams(comps: readonly PureComponent[], inlets: readonly MaterialStream[]): StreamState {
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
  comps: readonly PureComponent[],
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

/** Advisory warnings when T leaves the Antoine fit range or exceeds Tc. */
export function validityWarnings(comps: readonly PureComponent[], T: number): string[] {
  const tc = T - 273.15;
  const out: string[] = [];
  for (const c of comps) {
    if (T >= c.Tc) out.push(`${c.name}: T = ${T.toFixed(1)} K is above Tc (${c.Tc} K)`);
    else if (tc < c.antoine.Tmin || tc > c.antoine.Tmax)
      out.push(`${c.name}: Antoine extrapolated (${c.antoine.Tmin}–${c.antoine.Tmax} °C)`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Binary adapters for the `{ compA, compB }` stream schema
// ---------------------------------------------------------------------------

export interface BinaryFractions {
  compA: number;
  compB: number;
}

export const binaryComponents = (sys: BinarySystem = DEFAULT_SYSTEM) => [COMPONENTS[sys.A], COMPONENTS[sys.B]];
export const toVector = (m: BinaryFractions): number[] => [m.compA, m.compB];
export const toBinary = (v: Composition): BinaryFractions => ({ compA: v[0] ?? 0, compB: v[1] ?? 0 });
