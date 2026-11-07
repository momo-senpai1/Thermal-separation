/**
 * Crystallization from aqueous solution.
 *
 * Solubility: tabulated (g anhydrous solute per 100 g water, CRC Handbook),
 * interpolated with a monotone cubic.
 *
 * Yield (anhydrous crystals, feed F kg of solution at c₀ kg/kg water, a fraction e
 * of the water evaporated, mother liquor saturated at T₂):
 *   W₀ = F/(1 + c₀),   C = W₀·(c₀ − c*(T₂)·(1 − e))
 *
 * MSMPR crystallizer (mixed suspension, mixed product removal, size-independent
 * growth G, residence time τ):
 *   n(L) = n₀·exp(−L/(Gτ)),  n₀ = M_T / (6·k_v·ρ_c·(Gτ)⁴)
 *   dominant (mass) size L_D = 3Gτ, mass-weighted mean L₄,₃ = 4Gτ, CV ≈ 50 %.
 */

export interface Salt {
  id: string;
  name: string;
  /** g per 100 g water at 0, 10, …, 100 °C */
  sol: number[];
  /** crystal density, kg/m³ */
  rho: number;
  /** enthalpy of solution (heat released on crystallization), kJ/kg */
  dHsol: number;
}

export const SALTS: Salt[] = [
  { id: 'kno3', name: 'Potassium nitrate KNO₃', sol: [13.3, 20.9, 31.6, 45.8, 63.9, 85.5, 110, 138, 169, 202, 246], rho: 2109, dHsol: 345 },
  { id: 'nh4cl', name: 'Ammonium chloride NH₄Cl', sol: [29.4, 33.3, 37.2, 41.4, 45.8, 50.4, 55.3, 60.2, 65.6, 71.3, 77.3], rho: 1527, dHsol: 277 },
  { id: 'kcl', name: 'Potassium chloride KCl', sol: [27.6, 31.0, 34.0, 37.0, 40.0, 42.6, 45.5, 48.3, 51.1, 54.0, 56.7], rho: 1984, dHsol: 231 },
  { id: 'sucrose', name: 'Sucrose', sol: [179.2, 190.5, 203.9, 219.5, 238.1, 260.4, 287.3, 320.5, 362.1, 415.7, 487.2], rho: 1587, dHsol: 16 },
  { id: 'nacl', name: 'Sodium chloride NaCl', sol: [35.7, 35.8, 36.0, 36.3, 36.6, 37.0, 37.3, 37.8, 38.4, 39.0, 39.8], rho: 2165, dHsol: 67 },
];

/** Solubility c*(T) in kg solute per kg water (monotone cubic through the table). */
export function solubility(s: Salt, T: number): number {
  const xs = s.sol.map((_, i) => i * 10);
  const ys = s.sol.map((v) => v / 100);
  const n = xs.length;
  const t = Math.min(100, Math.max(0, T));
  const d = ys.slice(0, -1).map((y, i) => (ys[i + 1]! - y) / 10);
  const m = ys.map((_, i) => (i === 0 ? d[0]! : i === n - 1 ? d[n - 2]! : d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2));
  const i = Math.min(n - 2, Math.floor(t / 10));
  const u = (t - xs[i]!) / 10;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return h00 * ys[i]! + h10 * 10 * m[i]! + h01 * ys[i + 1]! + h11 * 10 * m[i + 1]!;
}

export interface YieldSpec {
  salt: Salt;
  /** feed solution, kg */
  F: number;
  /** feed concentration, kg/kg water */
  c0: number;
  /** final temperature, °C */
  T2: number;
  /** fraction of the feed water evaporated */
  e: number;
  /** feed temperature (for the cooling duty), °C */
  T1: number;
}

export function crystallizationYield(spec: YieldSpec) {
  const W0 = spec.F / (1 + spec.c0);
  const solute = W0 * spec.c0;
  const c2 = solubility(spec.salt, spec.T2);
  const W2 = W0 * (1 - spec.e);
  const C = Math.max(0, solute - W2 * c2);
  const motherLiquor = W2 * (1 + Math.min(c2, solute / Math.max(W2, 1e-12)));
  const cp = 4.19 / (1 + spec.c0) + (1.0 * spec.c0) / (1 + spec.c0); // kJ/(kg·K), mass-weighted
  const evapDuty = (W0 * spec.e * 2300) / 1000; // MJ
  const coolDuty = (spec.F * cp * (spec.T1 - spec.T2) + C * spec.salt.dHsol) / 1000; // MJ removed
  return {
    W0,
    solute,
    c2,
    crystals: C,
    yield: C / solute,
    motherLiquor,
    /** supersaturation ratio at T₂ before crystallization */
    S: spec.c0 / (W2 > 0 ? (c2 * W2) / W0 : c2),
    evapDuty,
    coolDuty,
  };
}

export interface MSMPRSpec {
  /** growth rate, µm/min */
  G: number;
  /** residence time, min */
  tau: number;
  /** suspension density, kg crystals per m³ */
  MT: number;
  /** crystal density, kg/m³ */
  rho: number;
  /** volume shape factor (cube 1, sphere π/6) */
  kv: number;
}

export function msmpr(s: MSMPRSpec) {
  const Gt = s.G * s.tau * 1e-6; // m
  const n0 = s.MT / (6 * s.kv * s.rho * Gt ** 4); // #/m⁴
  const LD = 3 * Gt;
  const L43 = 4 * Gt;
  /** number density n(L), L in m */
  const n = (L: number) => n0 * Math.exp(-L / Gt);
  /** mass density m(L) = k_v·ρ·L³·n(L), kg/(m³·m) */
  const mass = (L: number) => s.kv * s.rho * L ** 3 * n(L);
  /** cumulative mass fraction below L */
  const undersize = (L: number) => {
    const z = L / Gt;
    return 1 - Math.exp(-z) * (1 + z + z ** 2 / 2 + z ** 3 / 6);
  };
  /** nucleation rate B⁰ = n₀·G, #/(m³·s) */
  const B0 = n0 * (s.G * 1e-6) / 60;
  return { Gt, n0, LD, L43, n, mass, undersize, B0 };
}
