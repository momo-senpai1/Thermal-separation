import { describe, expect, it } from 'vitest';
import { kremserCounter, solveCounter, solveCross, type CascadeSpec } from '../cascade';
import { solveHunterNash } from '../hunterNash';
import { equilibriumCurve, getLLE, LLE_OPTIONS, type LLESystem } from '../lle';
import { COMPONENTS_LLE as UC, unifac } from '../unifac';

const linear = (K: number): LLESystem => ({
  id: 'lin', name: 'linear', solute: 'A', carrier: 'C', solvent: 'S', T: 25, source: 'data', note: '', tieLines: null, plait: null,
  loading: { X: [0, 0.25, 0.5, 1], Y: [0, 0.25 * K, 0.5 * K, K] },
});
const K = 2;
const lin = equilibriumCurve(linear(K));
const base: CascadeSpec = { curve: lin, X0: 0.2, Y0: 0.002, XN: 0.01, r: 0.8, target: 'stages', N: 3 };

describe('cross-current (constant K)', () => {
  it('each stage follows X_i = (X_{i−1} + r·Y₀)/(1 + K·r)', () => {
    const r = solveCross(base);
    let x = 0.2;
    for (const s of r.stages) {
      x = (x + 0.8 * 0.002) / (1 + K * 0.8);
      expect(s.X).toBeCloseTo(x, 10);
      expect(s.lambda).toBeCloseTo(K * 0.8, 4);
    }
    expect(r.stages.at(-1)!.X).toBeLessThanOrEqual(0.01);
    expect(r.stages.at(-2)!.X).toBeGreaterThan(0.01); // whole stages: the last one overshoots
  });
  it('closes the solute balance with the pooled extract', () => {
    const r = solveCross(base);
    expect(r.solventTotal * (r.Yout - 0.002)).toBeCloseTo(0.2 - r.Xout, 12);
  });
  it('solvent target: the solved ratio lands exactly on X_N with N stages', () => {
    const r = solveCross({ ...base, target: 'solvent', N: 4 });
    expect(r.ok).toBe(true);
    expect(r.Xout).toBeCloseTo(0.01, 10);
  });
  it('refuses X_N below X*(Y₀)', () => {
    expect(solveCross({ ...base, XN: 0.0005 }).ok).toBe(false);
  });
});

describe('counter-current (constant K)', () => {
  it('agrees with Kremser for a whole number of stages', () => {
    const r = solveCounter({ ...base, target: 'raffinate', N: 3 });
    const E = K * 0.8;
    const frac = (0.2 - r.XN) / (0.2 - 0.002 / K);
    expect(frac).toBeCloseTo(kremserCounter(E, 3), 6);
    expect(r.N).toBeCloseTo(3, 6);
  });
  it('minimum solvent ratio (X₀ − X_N)/(K·X₀ − Y₀) for a straight curve', () => {
    expect(solveCounter(base).rMin).toBeCloseTo((0.2 - 0.01) / (K * 0.2 - 0.002), 3);
  });
  it('one-stage ratio (X₀ − X_N)/(K·X_N − Y₀)', () => {
    const r = solveCounter(base);
    expect(r.rOne).toBeCloseTo((0.2 - 0.01) / (K * 0.01 - 0.002), 9);
    expect(solveCounter({ ...base, r: r.rOne * 1.000001 }).N).toBeLessThanOrEqual(1 + 1e-6);
  });
  it('refuses a ratio below the minimum', () => {
    const r = solveCounter({ ...base, r: 0.3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/minimum/);
  });
  it('needs less solvent than cross-current for the same specification', () => {
    const N = 4;
    const cross = solveCross({ ...base, target: 'solvent', N });
    const cc = solveCounter({ ...base, target: 'solvent', N });
    expect(cc.r).toBeLessThan(cross.solventTotal);
    expect(cc.N).toBeCloseTo(N, 6);
  });
});

describe('LLE systems', () => {
  it.each(LLE_OPTIONS.map((o) => o.id))('%s: loading curve rises monotonically from the origin', (id) => {
    const s = getLLE(id);
    expect(s.loading.X[0]).toBe(0);
    for (let i = 1; i < s.loading.X.length; i++) {
      expect(s.loading.X[i]!).toBeGreaterThan(s.loading.X[i - 1]!);
      expect(s.loading.Y[i]!).toBeGreaterThan(s.loading.Y[i - 1]!);
    }
  });
  it('UNIFAC mutual solubilities near literature (benzene 0.178 %, toluene 0.052 % in water)', () => {
    const bz = getLLE('acetone-benzene').tieLines![0]!;
    const tol = getLLE('acetone-toluene').tieLines![0]!;
    expect(bz.R[2]).toBeGreaterThan(0.0012);
    expect(bz.R[2]).toBeLessThan(0.0025);
    expect(tol.R[2]).toBeGreaterThan(0.0003);
    expect(tol.R[2]).toBeLessThan(0.0008);
  });
  it('UNIFAC tie lines are isoactive: x_R·γ_R = x_E·γ_E for every component', () => {
    const sys = getLLE('acetone-mibk');
    const comps = [UC.acetone, UC.water, UC.mibk];
    const g = unifac(comps);
    const mw = comps.map((c) => c.mw);
    const toX = (w: number[]) => {
      const n = w.map((v, i) => v / mw[i]!);
      const s = n.reduce((a, b) => a + b, 0);
      return n.map((v) => v / s);
    };
    for (const t of sys.tieLines!.filter((_, i) => i % 5 === 2)) {
      const xR = toX(t.R);
      const xE = toX(t.E);
      const gR = g(xR);
      const gE = g(xE);
      xR.forEach((x, i) => expect(Math.log(x) + gR[i]!).toBeCloseTo(Math.log(xE[i]!) + gE[i]!, 4));
    }
  });
  it('acetone prefers MIBK over toluene; ethanol stays in the water', () => {
    const K = (id: string) => getLLE(id).loading.Y[1]! / getLLE(id).loading.X[1]!;
    expect(K('acetone-mibk')).toBeGreaterThan(K('acetone-toluene'));
    expect(K('ethanol-toluene')).toBeLessThan(0.3);
  });
  it('Treybal acetic acid / IPE: dilute distribution K ≈ 0.26', () => {
    const s = getLLE('aa-ipe');
    expect(s.loading.Y[1]! / s.loading.X[1]!).toBeCloseTo(0.26, 1);
  });
});

describe('Hunter–Nash', () => {
  const sys = getLLE('aa-ipe');
  const spec = { sys, wF: 0.3, wS: 0, wRN: 0.02, s: 2.5 };
  const r = solveHunterNash(spec);
  const col = (a: number[], b: number[], c: number[]) => (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
  it('solves the Treybal system and lies within the solvent limits', () => {
    expect(r.ok).toBe(true);
    expect(r.N).toBeGreaterThan(1);
    expect(r.sMin).toBeLessThan(2.5);
    expect(r.sMax).toBeGreaterThan(2.5);
  });
  it('the pole is collinear with F–E₁ and with R_N–S; masses balance', () => {
    expect(col(r.pole!, r.F, r.E1!)).toBeCloseTo(0, 9);
    expect(col(r.pole!, r.RN, r.S)).toBeCloseTo(0, 6);
    expect(r.Emass + r.Rmass).toBeCloseTo(1 + 2.5, 9);
    for (let i = 0; i < 3; i++) expect(r.Emass * r.E1![i]! + r.Rmass * r.RN[i]!).toBeCloseTo(r.F[i]! + 2.5 * r.S[i]!, 9);
  });
  it('more solvent → fewer stages; below S/F_min it pinches; above S/F_max it is single-phase', () => {
    expect(solveHunterNash({ ...spec, s: 4 }).N).toBeLessThan(r.N);
    expect(solveHunterNash({ ...spec, s: r.sMin * 0.9 }).error).toMatch(/minimum|Too little/);
    if (Number.isFinite(r.sMax)) expect(solveHunterNash({ ...spec, s: r.sMax * 1.1 }).error).toMatch(/single-phase|Too much/);
  });
  it('for a nearly immiscible pair it agrees with the loading-diagram cascade', () => {
    const bz = getLLE('acetone-benzene');
    const wF = 0.2;
    const X0 = wF / (1 - wF);
    const hn = solveHunterNash({ sys: bz, wF, wS: 0, wRN: 0.01, s: 1.2 });
    const XN = hn.RN[0] / hn.RN[1];
    const cc = solveCounter({ curve: equilibriumCurve(bz), X0, Y0: 0, XN, r: (1.2 * 1) / (1 - wF), target: 'stages', N: 1 });
    expect(hn.ok && cc.ok).toBe(true);
    expect(Math.abs(hn.N - cc.N)).toBeLessThan(0.6);
  });
});
