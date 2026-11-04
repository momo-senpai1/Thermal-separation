/**
 * UNIFAC activity coefficients (original UNIFAC, VLE parameter table of
 * Hansen, Rasmussen, Fredenslund, Schiller & Gmehling, Ind. Eng. Chem. Res. 30
 * (1991) 2352). Only the groups needed by the extraction systems are included.
 *
 *   ln γ_i = ln γ_i^C (combinatorial) + ln γ_i^R (residual)
 *   ln γ_i^C = 1 − V_i + ln V_i − 5 q_i (1 − V_i/F_i + ln(V_i/F_i))
 *   ln γ_i^R = Σ_k ν_k⁽ⁱ⁾ (ln Γ_k − ln Γ_k⁽ⁱ⁾)
 *   ln Γ_k = Q_k [1 − ln Σ_m θ_m Ψ_mk − Σ_m θ_m Ψ_km / Σ_n θ_n Ψ_nm],  Ψ_mn = exp(−a_mn / T)
 *
 * UNIFAC with VLE parameters is a prediction; for liquid–liquid equilibria it
 * gets the shape of the binodal and the direction of the tie lines right but
 * not every number — the pages say so where it is used.
 */

export type Subgroup = 'CH3' | 'CH2' | 'CH' | 'ACH' | 'ACCH3' | 'OH' | 'H2O' | 'CH3CO';
type Main = 1 | 3 | 4 | 5 | 7 | 9;

const SUB: Record<Subgroup, { main: Main; R: number; Q: number }> = {
  CH3: { main: 1, R: 0.9011, Q: 0.848 },
  CH2: { main: 1, R: 0.6744, Q: 0.54 },
  CH: { main: 1, R: 0.4469, Q: 0.228 },
  ACH: { main: 3, R: 0.5313, Q: 0.4 },
  ACCH3: { main: 4, R: 1.2663, Q: 0.968 },
  OH: { main: 5, R: 1.0, Q: 1.2 },
  H2O: { main: 7, R: 0.92, Q: 1.4 },
  CH3CO: { main: 9, R: 1.6724, Q: 1.488 },
};

/** a_mn in K (main groups: 1 CH2, 3 ACH, 4 ACCH2, 5 OH, 7 H2O, 9 CH2CO). */
const A: Record<Main, Partial<Record<Main, number>>> = {
  1: { 3: 61.13, 4: 76.5, 5: 986.5, 7: 1318, 9: 476.4 },
  3: { 1: -11.12, 4: 167.0, 5: 636.1, 7: 903.8, 9: 25.77 },
  4: { 1: -69.7, 3: -146.8, 5: 803.2, 7: 5695, 9: -52.1 },
  5: { 1: 156.4, 3: 89.6, 4: 25.82, 7: 353.5, 9: 84.0 },
  7: { 1: 300.0, 3: 362.3, 4: 377.6, 5: -229.1, 9: -195.4 },
  9: { 1: 26.76, 3: 140.1, 4: 365.8, 5: 164.5, 7: 472.5 },
};
const a = (m: Main, n: Main) => (m === n ? 0 : (A[m][n] ?? 0));

export interface UnifacComponent {
  name: string;
  /** g/mol */
  mw: number;
  groups: Partial<Record<Subgroup, number>>;
}

export const COMPONENTS_LLE = {
  water: { name: 'Water', mw: 18.015, groups: { H2O: 1 } },
  acetone: { name: 'Acetone', mw: 58.08, groups: { CH3: 1, CH3CO: 1 } },
  ethanol: { name: 'Ethanol', mw: 46.07, groups: { CH3: 1, CH2: 1, OH: 1 } },
  toluene: { name: 'Toluene', mw: 92.14, groups: { ACH: 5, ACCH3: 1 } },
  benzene: { name: 'Benzene', mw: 78.11, groups: { ACH: 6 } },
  mibk: { name: 'MIBK', mw: 100.16, groups: { CH3CO: 1, CH2: 1, CH: 1, CH3: 2 } },
  hexane: { name: 'n-Hexane', mw: 86.18, groups: { CH3: 2, CH2: 4 } },
} satisfies Record<string, UnifacComponent>;

/** Precompiled UNIFAC model for a fixed set of components. */
export function unifac(comps: readonly UnifacComponent[]) {
  const subs = [...new Set(comps.flatMap((c) => Object.keys(c.groups) as Subgroup[]))];
  const nu = comps.map((c) => subs.map((s) => c.groups[s] ?? 0));
  const R = subs.map((s) => SUB[s].R);
  const Q = subs.map((s) => SUB[s].Q);
  const r = nu.map((v) => v.reduce((t, n, k) => t + n * R[k]!, 0));
  const q = nu.map((v) => v.reduce((t, n, k) => t + n * Q[k]!, 0));

  const lnGammaGroups = (X: number[], psi: number[][]) => {
    const qx = X.map((x, k) => Q[k]! * x);
    const sq = qx.reduce((t, v) => t + v, 0);
    const th = qx.map((v) => v / sq);
    const K = subs.length;
    const S = Array.from({ length: K }, (_, k) => th.reduce((t, tm, m) => t + tm * psi[m]![k]!, 0));
    return Array.from({ length: K }, (_, k) => {
      let sum = 0;
      for (let m = 0; m < K; m++) sum += (th[m]! * psi[k]![m]!) / S[m]!;
      return Q[k]! * (1 - Math.log(S[k]!) - sum);
    });
  };

  const cache = new Map<number, { psi: number[][]; pure: number[][] }>();
  const atT = (T: number) => {
    const hit = cache.get(T);
    if (hit) return hit;
    const psi = subs.map((m) => subs.map((n) => Math.exp(-a(SUB[m].main, SUB[n].main) / T)));
    // reference: each pure component
    const pure = comps.map((_, i) => {
      const tot = nu[i]!.reduce((t, v) => t + v, 0);
      const X = nu[i]!.map((v) => v / tot);
      const lg = lnGammaGroups(X, psi);
      return lg.map((v, k) => (nu[i]![k]! > 0 ? v : 0));
    });
    const out = { psi, pure };
    cache.set(T, out);
    return out;
  };

  /** ln γ for mole fractions x at T (K). */
  return function lnGamma(x: readonly number[], T = 298.15): number[] {
    const { psi, pure } = atT(T);
    const sr = x.reduce((t, xi, i) => t + xi * r[i]!, 0);
    const sq = x.reduce((t, xi, i) => t + xi * q[i]!, 0);
    // group mole fractions of the mixture
    const gx = subs.map((_, k) => x.reduce((t, xi, i) => t + xi * nu[i]![k]!, 0));
    const gt = gx.reduce((t, v) => t + v, 0);
    const lg = lnGammaGroups(
      gx.map((v) => v / gt),
      psi,
    );
    return comps.map((_, i) => {
      const V = r[i]! / sr;
      const F = q[i]! / sq;
      const comb = 1 - V + Math.log(V) - 5 * q[i]! * (1 - V / F + Math.log(V / F));
      let res = 0;
      for (let k = 0; k < subs.length; k++) if (nu[i]![k]!) res += nu[i]![k]! * (lg[k]! - pure[i]![k]!);
      return comb + res;
    });
  };
}
