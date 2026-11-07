/**
 * Convective drying with humid air.
 *
 * Psychrometrics (total pressure P, kPa):
 *   Y = 0.622·p_w/(P − p_w)  kg water/kg dry air,   p_w = φ·p_sat(T)
 *   h = 1.006·T + Y·(2501 + 1.86·T)  kJ/kg dry air
 * Wet-bulb (= adiabatic saturation temperature for air–water, Lewis number ≈ 1):
 *   (1.006 + 1.86·Y)(T − T_w) = (Y_sat(T_w) − Y)·λ(T_w)
 *
 * Batch drying with constant drying conditions:
 *   constant-rate period   R_c = h·(T − T_w)/λ(T_w)
 *   falling-rate period    R = R_c·(X − X*)/(X_c − X*)  (linear)
 *   t = (m_s/A)/R_c·[(X₁ − X_c) + (X_c − X*)·ln((X_c − X*)/(X₂ − X*))]
 */

import { brent } from './numerics';

/** Water vapour pressure, kPa, at T °C. */
export function psat(T: number) {
  const [A, B, C] = T <= 100 ? [8.07131, 1730.63, 233.426] : [8.14019, 1810.94, 244.485];
  return 0.133322368 * 10 ** (A - B / (C + T));
}
export const latent = (T: number) => 2501 - 2.361 * T; // kJ/kg
export const humidity = (pw: number, P = 101.325) => (0.622 * pw) / (P - pw);
export const satHumidity = (T: number, P = 101.325) => humidity(psat(T), P);
export const enthalpy = (T: number, Y: number) => 1.006 * T + Y * (2501 + 1.86 * T);

export interface AirState {
  T: number;
  RH: number;
  Y: number;
  h: number;
  Tw: number;
  Tdew: number;
  pw: number;
}

export function airState(T: number, RH: number, P = 101.325): AirState {
  const pw = RH * psat(T);
  const Y = humidity(pw, P);
  const Tw = wetBulb(T, Y, P);
  const Tdew = pw > 0 ? brent((t) => psat(t) - pw, -40, T + 1e-9) : -Infinity;
  return { T, RH, Y, h: enthalpy(T, Y), Tw, Tdew, pw };
}

/** Boiling point of water at P (kPa): the wet bulb can never exceed it. */
const boiling = (P: number) => brent((t) => psat(t) - P, 0, 250);

export function wetBulb(T: number, Y: number, P = 101.325) {
  const hi = Math.min(T, boiling(P) - 1e-3);
  return brent((tw) => (1.006 + 1.86 * Y) * (T - tw) - (satHumidity(tw, P) - Y) * latent(tw), -40, hi, { tol: 1e-9 });
}

/** State with humidity Y at T (for air heated or cooled without moisture change). */
export const stateFromY = (T: number, Y: number, P = 101.325) => {
  const pw = (Y * P) / (0.622 + Y);
  return airState(T, pw / psat(T), P);
};

export interface DryingSpec {
  /** drying air, °C and relative humidity (0–1) */
  T: number;
  RH: number;
  /** heat-transfer coefficient air → wet surface, W/(m²·K) */
  h: number;
  /** dry solid per exposed area, kg/m² */
  load: number;
  /** moisture, kg water / kg dry solid */
  X1: number;
  Xc: number;
  Xeq: number;
  X2: number;
}

export function batchDrying(s: DryingSpec) {
  const air = airState(s.T, s.RH);
  const lam = latent(air.Tw) * 1000; // J/kg
  const Rc = (s.h * (s.T - air.Tw)) / lam; // kg/(m²·s)
  const ok = s.X1 > s.X2 && s.X2 > s.Xeq && s.Xc > s.Xeq && Rc > 0;
  const tI = s.X1 > s.Xc ? (s.load * (s.X1 - Math.max(s.Xc, s.X2))) / Rc : 0;
  const tII = s.X2 < s.Xc ? ((s.load * (s.Xc - s.Xeq)) / Rc) * Math.log((Math.min(s.Xc, s.X1) - s.Xeq) / (s.X2 - s.Xeq)) : 0;
  /** moisture after time t (s) */
  const Xat = (t: number) => {
    if (t <= tI) return s.X1 - (Rc * t) / s.load;
    const X0 = Math.min(s.Xc, s.X1);
    return s.Xeq + (X0 - s.Xeq) * Math.exp((-Rc * (t - tI)) / (s.load * (s.Xc - s.Xeq)));
  };
  /** drying rate at moisture X */
  const rate = (X: number) => (X >= s.Xc ? Rc : (Rc * (X - s.Xeq)) / (s.Xc - s.Xeq));
  return { ok, air, Rc, tI, tII, total: tI + tII, Xat, rate };
}

export interface ContinuousSpec {
  /** dry solid, kg/h */
  solids: number;
  X1: number;
  X2: number;
  /** ambient air, °C / RH, heated to Tin, leaving at Tout */
  T0: number;
  RH0: number;
  Tin: number;
  Tout: number;
}

/** Adiabatic continuous dryer: air heated at constant Y, then along the adiabatic-saturation line. */
export function continuousDryer(s: ContinuousSpec) {
  const amb = airState(s.T0, s.RH0);
  const hot = stateFromY(s.Tin, amb.Y);
  const Tw = hot.Tw;
  // along the adiabatic line: (1.006 + 1.86 Y)(Tin − T) = (Y − Y_in)·λ(Tw)
  const Yout = brent((Y) => (1.006 + 1.86 * Y) * (s.Tin - s.Tout) - (Y - amb.Y) * latent(Tw), amb.Y, amb.Y + 1);
  const out = stateFromY(s.Tout, Yout);
  const water = s.solids * (s.X1 - s.X2); // kg/h
  const air = water / (Yout - amb.Y); // kg dry air/h
  const heat = (air * (1.006 + 1.86 * amb.Y) * (s.Tin - s.T0)) / 3600; // kW
  const efficiency = (water * latent(Tw)) / 3600 / heat;
  return { amb, hot, out, water, air, heat, efficiency, saturated: out.RH >= 1 };
}
