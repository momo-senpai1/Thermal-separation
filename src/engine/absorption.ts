/**
 * Gas absorption and stripping in counter-current columns (dilute solute,
 * Henry's law, isothermal).
 *
 *   y = m·x,  m = H(T)/P,   H(T) = H₂₉₈·exp(−C·(1/T − 1/298.15))
 *
 * Loadings (mole ratios) keep the operating line straight for any concentration:
 *   X = x/(1−x) solute per mole solute-free liquid,  Y = y/(1−y) per mole inert gas
 *   Y*(X) = m·x / (1 − m·x),  x = X/(1+X)
 * Absorber operating line (top = lean end):  Y = Y_out + (L/G)(X − X_in)
 * Stripper operating line (top = rich liquid in): Y = Y_in + (L/G)(X − X_out)
 *
 * Henry constants on the mole-fraction basis, dilute aqueous solution,
 * converted from the Sander (2015) compilation; C = d ln k_H / d(1/T).
 */

import { brent } from './numerics';

export interface Gas {
  id: string;
  name: string;
  /** H at 25 °C, bar (y·P = H·x) */
  H298: number;
  /** temperature coefficient, K */
  C: number;
  role: 'absorb' | 'strip';
}

export const GASES: Gas[] = [
  { id: 'nh3', name: 'Ammonia (NH₃) from air', H298: 0.94, C: 4100, role: 'absorb' },
  { id: 'acetone', name: 'Acetone vapour from air', H298: 1.85, C: 4600, role: 'absorb' },
  { id: 'so2', name: 'Sulphur dioxide (SO₂) from flue gas', H298: 46, C: 2900, role: 'absorb' },
  { id: 'h2s', name: 'Hydrogen sulphide (H₂S)', H298: 555, C: 2100, role: 'absorb' },
  { id: 'co2', name: 'Carbon dioxide (CO₂), physical', H298: 1632, C: 2400, role: 'absorb' },
  { id: 'benzene', name: 'Benzene from water (air stripping)', H298: 308, C: 4000, role: 'strip' },
  { id: 'toluene', name: 'Toluene from water (air stripping)', H298: 370, C: 4000, role: 'strip' },
  { id: 'o2', name: 'Oxygen from water (deaeration)', H298: 42700, C: 1700, role: 'strip' },
];

export const henry = (g: Gas, Tc: number) => g.H298 * Math.exp(-g.C * (1 / (Tc + 273.15) - 1 / 298.15));

export interface Equilibrium {
  m: number;
  Ystar: (X: number) => number;
  Xstar: (Y: number) => number;
  /** largest X for which Y*(X) is finite (m·x < 1) */
  Xcap: number;
}

export function equilibrium(m: number): Equilibrium {
  const Ystar = (X: number) => {
    const x = X / (1 + X);
    return (m * x) / (1 - m * x);
  };
  const Xstar = (Y: number) => {
    const y = Y / (1 + Y);
    const x = y / m;
    return x / (1 - x);
  };
  const xcap = Math.min(0.999, 1 / m) * 0.999;
  return { m, Ystar, Xstar, Xcap: xcap / (1 - xcap) };
}

export interface ColumnStage {
  stage: number;
  X: number;
  Y: number;
}

export interface AbsorberResult {
  ok: boolean;
  error?: string;
  m: number;
  /** L/G used and its minimum */
  LG: number;
  LGmin: number;
  /** absorption factor A = (L/G)/m (stripping factor S = 1/A) */
  A: number;
  Yin: number;
  Yout: number;
  Xin: number;
  Xout: number;
  /** theoretical stages (fractional) */
  N: number;
  /** Kremser stages for the dilute limit (straight equilibrium line) */
  Nkremser: number;
  /** overall gas-phase transfer units (packed column) */
  NTU: number;
  stages: ColumnStage[];
}

/** Kremser: N = ln[((Y_rich − m X_lean)/(Y_lean − m X_lean))(1 − 1/A) + 1/A] / ln A. */
export function kremserAbsorber(A: number, yIn: number, yOut: number, mXin: number) {
  const r = (yIn - mXin) / (yOut - mXin);
  if (Math.abs(A - 1) < 1e-9) return r - 1;
  return Math.log(r * (1 - 1 / A) + 1 / A) / Math.log(A);
}

/** Simpson integral of f on [a, b]. */
function simpson(f: (x: number) => number, a: number, b: number, n = 400) {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

export interface AbsorberSpec {
  m: number;
  /** inlet gas mole fraction */
  yIn: number;
  /** fraction of the solute absorbed */
  recovery: number;
  /** inlet liquid mole fraction */
  xIn: number;
  /** L/G as a multiple of the minimum */
  factor: number;
}

export function solveAbsorber(spec: AbsorberSpec): AbsorberResult {
  const eq = equilibrium(spec.m);
  const Yin = spec.yIn / (1 - spec.yIn);
  const Yout = Yin * (1 - spec.recovery);
  const Xin = spec.xIn / (1 - spec.xIn);
  const base = { m: spec.m, Yin, Yout, Xin };
  const fail = (error: string): AbsorberResult => ({
    ok: false, error, ...base, LG: NaN, LGmin: NaN, A: NaN, Xout: NaN, N: NaN, Nkremser: NaN, NTU: NaN, stages: [],
  });
  if (!(Yout > eq.Ystar(Xin))) return fail('The lean solvent already holds too much solute: the gas cannot be cleaned to this purity (Y_out ≤ Y*(X_in)).');
  // minimum L/G: operating line from (X_in, Y_out) touches the curve between the ends
  let LGmin = 0;
  for (let i = 1; i <= 400; i++) {
    const Y = Yout + ((Yin - Yout) * i) / 400;
    const X = eq.Xstar(Y);
    if (!(X > Xin)) return fail('Equilibrium does not allow this separation.');
    LGmin = Math.max(LGmin, (Y - Yout) / (X - Xin));
  }
  const LG = LGmin * spec.factor;
  const Xout = Xin + (Yin - Yout) / LG;
  const op = (X: number) => Yout + LG * (X - Xin);
  // step from the top (lean end): gas Y_k leaves stage k, liquid X_k = X*(Y_k)
  const stages: ColumnStage[] = [];
  let Y = Yout;
  let Xprev = Xin;
  let N = NaN;
  for (let k = 1; k <= 300; k++) {
    const X = eq.Xstar(Y);
    stages.push({ stage: k, X, Y });
    if (X >= Xout) {
      N = k - 1 + (Xout - Xprev) / (X - Xprev);
      break;
    }
    if (!(X > Xprev + 1e-15)) break;
    Xprev = X;
    Y = op(X);
  }
  if (!Number.isFinite(N)) return fail('More than 300 stages — raise L/G.');
  const A = LG / spec.m;
  const NTU = simpson((Yv) => 1 / (Yv - eq.Ystar(Xin + (Yv - Yout) / LG)), Yout, Yin);
  return { ok: true, ...base, LG, LGmin, A, Xout, N, Nkremser: kremserAbsorber(A, Yin, Yout, spec.m * Xin), NTU, stages };
}

export interface StripperSpec {
  m: number;
  /** inlet liquid mole fraction */
  xIn: number;
  /** fraction of the solute stripped */
  recovery: number;
  /** inlet gas mole fraction (clean air ≈ 0) */
  yIn: number;
  /** G/L as a multiple of the minimum */
  factor: number;
}

export interface StripperResult extends AbsorberResult {
  GL: number;
  GLmin: number;
  /** stripping factor S = m·G/L */
  S: number;
}

export function solveStripper(spec: StripperSpec): StripperResult {
  const eq = equilibrium(spec.m);
  const Xin = spec.xIn / (1 - spec.xIn);
  const Xout = Xin * (1 - spec.recovery);
  const Yin = spec.yIn / (1 - spec.yIn);
  const fail = (error: string): StripperResult => ({
    ok: false, error, m: spec.m, Yin, Yout: NaN, Xin, Xout, LG: NaN, LGmin: NaN, A: NaN, N: NaN, Nkremser: NaN, NTU: NaN, stages: [], GL: NaN, GLmin: NaN, S: NaN,
  });
  if (!(eq.Ystar(Xout) > Yin)) return fail('The stripping gas is not clean enough to reach this liquid purity (Y*(X_out) ≤ Y_in).');
  // maximum gas loading → minimum G/L: line from (X_out, Y_in) touches the curve
  let LGmax = Infinity;
  for (let i = 1; i <= 400; i++) {
    const X = Xout + ((Xin - Xout) * i) / 400;
    LGmax = Math.min(LGmax, (eq.Ystar(X) - Yin) / (X - Xout));
  }
  const GLmin = 1 / LGmax;
  const GL = GLmin * spec.factor;
  const LG = 1 / GL;
  const Yout = Yin + LG * (Xin - Xout);
  const opX = (Y: number) => Xout + (Y - Yin) / LG;
  // step from the bottom (lean liquid end): liquid X_k leaves, gas Y_k = Y*(X_k)
  const stages: ColumnStage[] = [];
  let X = Xout;
  let Yprev = Yin;
  let N = NaN;
  for (let k = 1; k <= 300; k++) {
    const Y = eq.Ystar(X);
    stages.push({ stage: k, X, Y });
    if (Y >= Yout) {
      N = k - 1 + (Yout - Yprev) / (Y - Yprev);
      break;
    }
    if (!(Y > Yprev + 1e-15)) break;
    Yprev = Y;
    X = opX(Y);
  }
  if (!Number.isFinite(N)) return fail('More than 300 stages — raise G/L.');
  const S = spec.m * GL;
  // liquid-phase transfer units
  const NTU = simpson((Xv) => 1 / (Xv - eq.Xstar(Yin + LG * (Xv - Xout))), Xout, Xin);
  // Kremser for stripping: same formula with S and liquid compositions
  const Nk = kremserAbsorber(S, Xin, Xout, Yin / spec.m);
  return { ok: true, m: spec.m, Yin, Yout, Xin, Xout, LG, LGmin: 1 / GLmin, A: 1 / S, N, Nkremser: Nk, NTU, stages, GL, GLmin, S };
}

/** Colburn: N_OG for a dilute absorber with straight lines. */
export function colburnNOG(A: number, yIn: number, yOut: number, mXin: number) {
  const r = (yIn - mXin) / (yOut - mXin);
  return Math.log(r * (1 - 1 / A) + 1 / A) / (1 - 1 / A);
}

/** Temperature at which H reaches a value (for the UI's "too warm" hints). */
export const tempForHenry = (g: Gas, H: number) => brent((t) => henry(g, t) - H, -20, 150);
