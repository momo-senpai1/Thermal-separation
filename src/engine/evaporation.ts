/**
 * Evaporation of aqueous solutions with a non-volatile solute.
 *
 * Water: Antoine (two ranges) for T_sat(P); latent heat by Watson,
 *   λ(T) = 2257·[(1 − T_r)/(1 − 0.5767)]^0.38 kJ/kg  (T_r = T/647.1 K).
 * Boiling-point elevation, dilute (ebullioscopic) estimate:
 *   ΔT_b = K_b · i · b,  K_b = 0.512 K·kg/mol, b = molality.
 * Solution heat capacity  c_p = 4.19·(1 − w) + c_p,s·w  kJ/(kg·K).
 *
 * Multiple-effect, forward feed (McCabe–Smith method): energy balances per
 * effect form a linear system for S, V₁…V_N; the temperature drops are then
 * redistributed ∝ A_i/Ā until all effects have the same area.
 */

export interface Solute {
  id: string;
  name: string;
  /** kg/mol */
  M: number;
  /** van 't Hoff factor */
  i: number;
  /** kJ/(kg·K) */
  cp: number;
}

export const SOLUTES: Solute[] = [
  { id: 'sucrose', name: 'Sucrose (sugar, fruit juice)', M: 0.3423, i: 1, cp: 1.25 },
  { id: 'nacl', name: 'Sodium chloride (brine)', M: 0.05844, i: 2, cp: 0.86 },
  { id: 'none', name: 'No boiling-point elevation (ideal)', M: 1, i: 0, cp: 1.5 },
];

/** Water saturation pressure, bar, at T °C (Antoine, Dean: 1–100 °C and 99–374 °C). */
export function psatWater(T: number) {
  const [A, B, C] = T <= 100 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  return 0.00133322368 * 10 ** (A - B / (C + T));
}
/** Water saturation temperature, °C, at P bar. */
export function tsatWater(P: number) {
  const t1 = 1730.63 / (8.07131 - Math.log10(P / 0.00133322368)) - 233.426;
  return t1 <= 100 ? t1 : 1810.94 / (8.14019 - Math.log10(P / 0.00133322368)) - 244.485;
}
/** Latent heat of water, kJ/kg (Watson correlation). */
export const latentWater = (T: number) => 2257 * ((1 - (T + 273.15) / 647.1) / (1 - 0.5767)) ** 0.38;

/** Boiling-point elevation (K) at solute mass fraction w. */
export function bpe(s: Solute, w: number) {
  if (s.i === 0 || w <= 0) return 0;
  const molality = w / s.M / (1 - w);
  return 0.512 * s.i * molality;
}
export const cpSolution = (s: Solute, w: number) => 4.19 * (1 - w) + s.cp * w;

export interface EvaporatorSpec {
  solute: Solute;
  /** feed, kg/h */
  F: number;
  /** feed solute mass fraction */
  wF: number;
  /** product solute mass fraction */
  wP: number;
  /** feed temperature, °C */
  TF: number;
  /** heating steam pressure, bar */
  Ps: number;
  /** pressure in the last effect, bar */
  Plast: number;
  /** overall heat-transfer coefficients per effect, W/(m²·K) */
  U: number[];
}

export interface Effect {
  /** boiling temperature of the solution, °C */
  T: number;
  /** saturation temperature of the vapour produced (pressure of the effect), °C */
  Tsat: number;
  P: number;
  /** temperature driving force, K */
  dT: number;
  bpe: number;
  /** vapour produced, kg/h */
  V: number;
  /** liquid leaving, kg/h and its concentration */
  L: number;
  w: number;
  /** duty, kW, and area, m² */
  Q: number;
  A: number;
}

export interface EvaporatorResult {
  ok: boolean;
  error?: string;
  /** steam, kg/h */
  S: number;
  Ts: number;
  /** total evaporation, kg/h */
  V: number;
  /** product, kg/h */
  P: number;
  economy: number;
  /** area of each effect (equal-area design), m² */
  A: number;
  effects: Effect[];
}

/** Solve the linear system M·u = b (Gaussian elimination, partial pivoting). */
function solveLinear(M: number[][], b: number[]) {
  const n = b.length;
  const a = M.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = a[r]![c]! / a[c]![c]!;
      for (let k = c; k <= n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  const u = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= a[r]![k]! * u[k]!;
    u[r] = s / a[r]![r]!;
  }
  return u;
}

export function solveEvaporator(spec: EvaporatorSpec): EvaporatorResult {
  const N = spec.U.length;
  const { solute, F, wF, wP } = spec;
  const Ts = tsatWater(spec.Ps);
  const TlastSat = tsatWater(spec.Plast);
  const Vtot = F * (1 - wF / wP);
  const fail = (error: string): EvaporatorResult => ({ ok: false, error, S: NaN, Ts, V: Vtot, P: F - Vtot, economy: NaN, A: NaN, effects: [] });
  if (!(wP > wF)) return fail('The product must be more concentrated than the feed.');
  if (!(Ts > TlastSat)) return fail('The steam must be hotter than the last effect.');

  let V = new Array<number>(N).fill(Vtot / N);
  let frac = spec.U.map((u) => 1 / u);
  const fs = frac.reduce((a, b) => a + b, 0);
  frac = frac.map((f) => f / fs);
  let result: EvaporatorResult | null = null;

  for (let iter = 0; iter < 60; iter++) {
    // concentrations and boiling-point elevations from the current evaporation split
    const L: number[] = [];
    let rem = F;
    for (let i = 0; i < N; i++) {
      rem -= V[i]!;
      L.push(rem);
    }
    const w = L.map((l) => (F * wF) / l);
    const B = w.map((wi) => bpe(solute, wi));
    const dTtot = Ts - TlastSat - B.reduce((a, b) => a + b, 0);
    if (!(dTtot > 1)) return fail('The boiling-point elevation eats up the whole temperature difference — raise the steam pressure or lower the last-effect pressure.');
    const dT = frac.map((f) => f * dTtot);
    // temperatures down the train
    const T: number[] = [];
    const Tsat: number[] = [];
    let hot = Ts;
    for (let i = 0; i < N; i++) {
      const Ti = hot - dT[i]!;
      T.push(Ti);
      Tsat.push(Ti - B[i]!);
      hot = Ti - B[i]!; // vapour condenses at its saturation temperature in the next effect
    }
    const lam = Tsat.map((t) => latentWater(t));
    const lamS = latentWater(Ts);
    // unknowns u = [S, V1..VN]; N energy balances + total evaporation
    const M: number[][] = [];
    const b: number[] = [];
    const cpF = cpSolution(solute, wF);
    for (let i = 0; i < N; i++) {
      const row = new Array<number>(N + 1).fill(0);
      // heat in: steam (i = 0) or vapour of effect i−1
      if (i === 0) row[0] = lamS;
      else row[i] = lam[i - 1]!;
      // vapour produced
      row[i + 1]! -= lam[i]!;
      // sensible heat of the liquid entering: L_in·cp·(T_i − T_in), L_in = F − Σ_{j<i} V_j
      const Tin = i === 0 ? spec.TF : T[i - 1]!;
      const cpIn = i === 0 ? cpF : cpSolution(solute, w[i - 1]!);
      const sens = cpIn * (T[i]! - Tin);
      // −(F − Σ_{j<i} V_j)·sens → constant −F·sens, + sens per earlier V_j
      for (let j = 0; j < i; j++) row[j + 1]! += sens;
      M.push(row);
      b.push(F * sens);
    }
    M.push([0, ...new Array<number>(N).fill(1)]);
    b.push(Vtot);
    const u = solveLinear(M, b);
    const S = u[0]!;
    V = u.slice(1);
    const Q = [S * lamS, ...V.slice(0, -1).map((v, i) => v * lam[i]!)].map((q) => q / 3600); // kW
    const A = Q.map((q, i) => (q * 1000) / (spec.U[i]! * dT[i]!));
    const Abar = A.reduce((a, c) => a + c, 0) / N;
    const Lnew: number[] = [];
    rem = F;
    for (let i = 0; i < N; i++) {
      rem -= V[i]!;
      Lnew.push(rem);
    }
    result = {
      ok: true,
      S,
      Ts,
      V: Vtot,
      P: F - Vtot,
      economy: Vtot / S,
      A: Abar,
      effects: T.map((t, i) => ({
        T: t, Tsat: Tsat[i]!, P: psatWater(Tsat[i]!), dT: dT[i]!, bpe: B[i]!, V: V[i]!, L: Lnew[i]!, w: (F * wF) / Lnew[i]!, Q: Q[i]!, A: A[i]!,
      })),
    };
    const spread = Math.max(...A.map((a) => Math.abs(a - Abar))) / Abar;
    if (spread < 1e-6) break;
    // redistribute the driving forces towards equal areas
    const nd = dT.map((d, i) => (d * A[i]!) / Abar);
    const s = nd.reduce((a, c) => a + c, 0);
    frac = nd.map((d) => d / s);
    if (V.some((v) => !(v > 0))) return fail('An effect produces no vapour — use fewer effects or a larger temperature difference.');
  }
  return result!;
}

export interface MVRSpec {
  /** vapour, kg/h, at the evaporator's saturation temperature T1 (°C) */
  V: number;
  T1: number;
  /** temperature lift the compressor must give (heating-side ΔT incl. BPE), K */
  lift: number;
  /** isentropic efficiency */
  eta: number;
}

/** Mechanical vapour recompression: isentropic ideal-gas compression of steam. */
export function mvr(s: MVRSpec) {
  const k = 1.3;
  const R = 8.314 / 0.018015; // J/(kg·K)
  const P1 = psatWater(s.T1);
  const P2 = psatWater(s.T1 + s.lift);
  const T1 = s.T1 + 273.15;
  const w = (k / (k - 1)) * R * T1 * ((P2 / P1) ** ((k - 1) / k) - 1) / s.eta; // J/kg
  const power = (w * s.V) / 3600 / 1000; // kW
  const heat = (s.V * latentWater(s.T1)) / 3600; // kW recovered as heating
  return { P1, P2, ratio: P2 / P1, power, specific: w / 3.6e6 * 1000, COP: heat / power };
}
