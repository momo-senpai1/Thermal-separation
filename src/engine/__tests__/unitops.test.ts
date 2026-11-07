import { describe, expect, it } from 'vitest';
import { colburnNOG, equilibrium, GASES, henry, solveAbsorber, solveStripper } from '../absorption';
import { crystallizationYield, msmpr, SALTS, solubility } from '../crystallization';
import { airState, batchDrying, continuousDryer, psat, wetBulb } from '../drying';
import { bpe, latentWater, mvr, psatWater, solveEvaporator, SOLUTES, tsatWater } from '../evaporation';

describe('absorption', () => {
  const nh3 = GASES.find((g) => g.id === 'nh3')!;
  it('Henry constant rises with temperature (gases less soluble when warm)', () => {
    expect(henry(nh3, 25)).toBeCloseTo(nh3.H298, 9);
    expect(henry(nh3, 40)).toBeGreaterThan(henry(nh3, 25));
  });
  it('loading equilibrium reduces to y = m·x when dilute and inverts exactly', () => {
    const e = equilibrium(1.2);
    expect(e.Ystar(1e-6)).toBeCloseTo(1.2e-6, 12);
    expect(e.Xstar(e.Ystar(0.05))).toBeCloseTo(0.05, 12);
  });
  it('dilute absorber: stage stepping agrees with Kremser, packed NTU with Colburn', () => {
    const r = solveAbsorber({ m: 1.5, yIn: 0.002, recovery: 0.95, xIn: 0, factor: 1.4 });
    expect(r.ok).toBe(true);
    expect(r.N).toBeCloseTo(r.Nkremser, 1);
    expect(r.NTU).toBeCloseTo(colburnNOG(r.A, r.Yin, r.Yout, 0), 1);
    // minimum L/G for dilute straight lines: m·recovery (pinch at the rich end)
    expect(r.LGmin).toBeCloseTo(1.5 * 0.95, 2);
  });
  it('closes the solute balance: G·(Y_in − Y_out) = L·(X_out − X_in)', () => {
    const r = solveAbsorber({ m: 0.9, yIn: 0.05, recovery: 0.98, xIn: 0, factor: 1.5 });
    expect(r.Yin - r.Yout).toBeCloseTo(r.LG * (r.Xout - r.Xin), 12);
  });
  it('refuses a lean solvent that is already too rich', () => {
    expect(solveAbsorber({ m: 1, yIn: 0.01, recovery: 0.99, xIn: 0.005, factor: 1.5 }).ok).toBe(false);
  });
  it('stripper: more gas → fewer stages; stripping factor S = m·G/L', () => {
    const a = solveStripper({ m: 300, xIn: 1e-5, recovery: 0.99, yIn: 0, factor: 1.5 });
    const b = solveStripper({ m: 300, xIn: 1e-5, recovery: 0.99, yIn: 0, factor: 3 });
    expect(a.ok && b.ok).toBe(true);
    expect(b.N).toBeLessThan(a.N);
    expect(a.S).toBeCloseTo(300 * a.GL, 9);
    expect(a.N).toBeCloseTo(a.Nkremser, 1);
  });
});

describe('evaporation', () => {
  const sugar = SOLUTES[0]!;
  it('water properties: 100 °C at 1.013 bar, latent heat 2257 kJ/kg at 100 °C', () => {
    expect(psatWater(100)).toBeCloseTo(1.01325, 2);
    expect(tsatWater(1.01325)).toBeCloseTo(100, 1);
    expect(tsatWater(3)).toBeCloseTo(133.5, 0);
    expect(latentWater(100)).toBeCloseTo(2257, 0);
  });
  it('boiling-point elevation: ~0.51 K per mol/kg for sucrose, twice that per mol for NaCl', () => {
    const w = 0.3423 / 1.3423; // 1 mol sucrose per kg water
    expect(bpe(sugar, w)).toBeCloseTo(0.512, 3);
  });
  it('single effect: energy balance closes and economy < 1', () => {
    const r = solveEvaporator({ solute: sugar, F: 10000, wF: 0.1, wP: 0.5, TF: 20, Ps: 2, Plast: 0.2, U: [2000] });
    expect(r.ok).toBe(true);
    expect(r.V).toBeCloseTo(8000, 6);
    expect(r.economy).toBeLessThan(1);
    expect(r.economy).toBeGreaterThan(0.7);
  });
  it('multiple effects: equal areas, economy grows with the number of effects', () => {
    const econ = [1, 2, 3, 4].map((n) => solveEvaporator({ solute: sugar, F: 10000, wF: 0.1, wP: 0.5, TF: 60, Ps: 3, Plast: 0.15, U: [3000, 2500, 2000, 1500].slice(0, n) }));
    for (const r of econ) {
      expect(r.ok).toBe(true);
      for (const e of r.effects) expect(e.A).toBeCloseTo(r.A, 3);
      expect(r.effects.reduce((s, e) => s + e.V, 0)).toBeCloseTo(r.V, 6);
    }
    for (let i = 1; i < econ.length; i++) expect(econ[i]!.economy).toBeGreaterThan(econ[i - 1]!.economy);
    expect(econ[2]!.economy).toBeGreaterThan(2.1); // triple effect: 2.2–2.7 typical
  });
  it('MVR: a 8 K lift costs ~15–35 kWh per tonne of vapour (COP > 15)', () => {
    const r = mvr({ V: 1000, T1: 60, lift: 8, eta: 0.75 });
    expect(r.specific).toBeGreaterThan(10);
    expect(r.specific).toBeLessThan(40);
    expect(r.COP).toBeGreaterThan(15);
  });
});

describe('crystallization', () => {
  const kno3 = SALTS.find((s) => s.id === 'kno3')!;
  it('solubility passes through the tabulated points', () => {
    expect(solubility(kno3, 20)).toBeCloseTo(0.316, 6);
    expect(solubility(kno3, 45)).toBeGreaterThan(0.639);
    expect(solubility(kno3, 45)).toBeLessThan(0.855);
  });
  it('cooling KNO₃ from saturated 60 °C to 20 °C crystallizes (110 − 31.6)/110 = 71 %', () => {
    const c0 = solubility(kno3, 60);
    const r = crystallizationYield({ salt: kno3, F: 1000, c0, T1: 60, T2: 20, e: 0 });
    expect(r.yield).toBeCloseTo((1.1 - 0.316) / 1.1, 4);
    expect(r.crystals + r.W0 * 0.316).toBeCloseTo(r.solute, 6);
  });
  it('NaCl hardly crystallizes on cooling; evaporation does it', () => {
    const nacl = SALTS.find((s) => s.id === 'nacl')!;
    const c0 = solubility(nacl, 80);
    expect(crystallizationYield({ salt: nacl, F: 1000, c0, T1: 80, T2: 20, e: 0 }).yield).toBeLessThan(0.07);
    expect(crystallizationYield({ salt: nacl, F: 1000, c0, T1: 80, T2: 80, e: 0.5 }).yield).toBeCloseTo(0.5, 6);
  });
  it('MSMPR: the distribution carries exactly M_T, dominant size 3Gτ, half the mass below 3.67Gτ', () => {
    const r = msmpr({ G: 1, tau: 60, MT: 100, rho: 2000, kv: 1 });
    // ∫ m(L) dL = M_T
    const h = r.Gt / 200;
    let s = 0;
    for (let L = 0; L < 40 * r.Gt; L += h) s += r.mass(L + h / 2) * h;
    expect(s).toBeCloseTo(100, 3);
    let best = 0;
    for (let L = 0; L < 10 * r.Gt; L += r.Gt / 1000) if (r.mass(L) > r.mass(best)) best = L;
    expect(best / r.Gt).toBeCloseTo(3, 2);
    expect(r.undersize(3.672 * r.Gt)).toBeCloseTo(0.5, 3);
  });
});

describe('drying', () => {
  it('psychrometrics at 25 °C / 50 %: Y ≈ 0.0099, wet bulb ≈ 17.9 °C, dew point ≈ 13.9 °C', () => {
    const a = airState(25, 0.5);
    expect(a.Y).toBeCloseTo(0.0099, 3);
    expect(a.Tw).toBeCloseTo(17.9, 0);
    expect(a.Tdew).toBeCloseTo(13.9, 0);
    expect(psat(100)).toBeCloseTo(101.3, 0);
  });
  it('wet bulb of saturated air equals the dry bulb', () => {
    const a = airState(30, 1);
    expect(a.Tw).toBeCloseTo(30, 3);
    expect(wetBulb(30, a.Y)).toBeCloseTo(30, 3);
  });
  it('batch drying: X(t) is continuous and reaches X₂ at the total time', () => {
    const r = batchDrying({ T: 70, RH: 0.05, h: 30, load: 20, X1: 0.6, Xc: 0.25, Xeq: 0.03, X2: 0.06 });
    expect(r.ok).toBe(true);
    expect(r.Xat(r.tI)).toBeCloseTo(0.25, 9);
    expect(r.Xat(r.total)).toBeCloseTo(0.06, 9);
    expect(r.rate(0.25)).toBeCloseTo(r.Rc, 12);
  });
  it('continuous dryer: air balance and efficiency below 1', () => {
    const r = continuousDryer({ solids: 1000, X1: 0.4, X2: 0.05, T0: 20, RH0: 0.6, Tin: 150, Tout: 60 });
    expect(r.air * (r.out.Y - r.amb.Y)).toBeCloseTo(r.water, 6);
    expect(r.efficiency).toBeGreaterThan(0.4);
    expect(r.efficiency).toBeLessThan(1);
    expect(r.saturated).toBe(false);
  });
});
