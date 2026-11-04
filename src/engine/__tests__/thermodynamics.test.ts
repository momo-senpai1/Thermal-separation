import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../components';
import { brent, sum } from '../numerics';
import {
  averageRelativeVolatility,
  binaryComponents,
  bubblePressure,
  bubbleTemperature,
  dewPressure,
  dewTemperature,
  enthalpyTP,
  flashPH,
  flashTP,
  heatStream,
  latentHeat,
  mixStreams,
  relativeVolatility,
  saturationTemperature,
  stateFromThermalCondition,
  thermalCondition,
  txyDiagram,
  validityWarnings,
  vaporPressure,
  xFromAlpha,
  yFromAlpha,
} from '../thermodynamics';

const ATM = 101.325;
const bz = COMPONENTS.benzene;
const tol = COMPONENTS.toluene;
const BT = binaryComponents(); // benzene / toluene
const z50 = [0.5, 0.5];

describe('numerics', () => {
  it('brent finds √2', () => {
    expect(brent((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 10);
  });
  it('brent rejects an unbracketed root', () => {
    expect(() => brent((x) => x * x + 1, -1, 1)).toThrow(/not bracketed/);
  });
});

describe('Antoine vapour pressure', () => {
  it('reproduces normal boiling points (P° = 1 atm at Tb)', () => {
    for (const c of Object.values(COMPONENTS)) {
      expect(vaporPressure(c, c.Tb)).toBeCloseTo(ATM, -0.3); // ±~1 kPa
      expect(saturationTemperature(c, ATM)).toBeCloseTo(c.Tb, 0);
    }
  });
  it('T^sat is the exact inverse of P°', () => {
    expect(vaporPressure(tol, saturationTemperature(tol, 55))).toBeCloseTo(55, 10);
  });
});

describe('Raoult / Dalton VLE — benzene/toluene at 1 atm', () => {
  it('equimolar bubble point ≈ 92 °C (textbook 92.1 °C)', () => {
    const bp = bubbleTemperature(BT, z50, ATM);
    expect(bp.T - 273.15).toBeGreaterThan(91.5);
    expect(bp.T - 273.15).toBeLessThan(92.8);
    expect(sum(bp.y)).toBeCloseTo(1, 10);
    expect(bp.y[0]).toBeGreaterThan(0.7); // vapour enriched in benzene (~0.71)
  });

  it('dew point of the bubble vapour returns the bubble temperature', () => {
    const bp = bubbleTemperature(BT, [0.3, 0.7], ATM);
    const dp = dewTemperature(BT, bp.y, ATM);
    expect(dp.T).toBeCloseTo(bp.T, 6);
    expect(dp.x[0]).toBeCloseTo(0.3, 6);
  });

  it('bubble/dew pressure are consistent with bubble/dew temperature', () => {
    const T = bubbleTemperature(BT, z50, ATM).T;
    expect(bubblePressure(BT, z50, T).P).toBeCloseTo(ATM, 6);
    const Td = dewTemperature(BT, z50, ATM).T;
    expect(dewPressure(BT, z50, Td).P).toBeCloseTo(ATM, 6);
    expect(Td).toBeGreaterThan(T);
  });

  it('relative volatility ≈ 2.4–2.6', () => {
    expect(relativeVolatility(bz, tol, 365)).toBeGreaterThan(2.3);
    expect(relativeVolatility(bz, tol, 365)).toBeLessThan(2.7);
    const a = averageRelativeVolatility(bz, tol, ATM);
    expect(a).toBeGreaterThan(2.3);
    expect(a).toBeLessThan(2.7);
  });

  it('T-x-y diagram spans the pure boiling points and y ≥ x', () => {
    const d = txyDiagram({ A: 'benzene', B: 'toluene' }, ATM, 21);
    expect(d[0]!.T).toBeCloseTo(saturationTemperature(tol, ATM), 4);
    expect(d.at(-1)!.T).toBeCloseTo(saturationTemperature(bz, ATM), 4);
    for (const p of d) expect(p.y).toBeGreaterThanOrEqual(p.x - 1e-12);
    for (let i = 1; i < d.length; i++) expect(d[i]!.T).toBeLessThan(d[i - 1]!.T);
  });

  it('constant-α curve and its inverse round-trip', () => {
    for (const x of [0, 0.1, 0.5, 0.93, 1]) expect(xFromAlpha(2.45, yFromAlpha(2.45, x))).toBeCloseTo(x, 12);
  });
});

describe('TP flash (Rachford–Rice)', () => {
  it('classifies phases around the bubble and dew points', () => {
    const Tb = bubbleTemperature(BT, z50, ATM).T;
    const Td = dewTemperature(BT, z50, ATM).T;
    expect(flashTP(BT, z50, Tb - 5, ATM).phase).toBe('liquid');
    expect(flashTP(BT, z50, Td + 5, ATM).phase).toBe('vapor');
    expect(flashTP(BT, z50, (Tb + Td) / 2, ATM).phase).toBe('two-phase');
  });

  it('closes the component balance z = (1−β)x + βy and Σx = Σy = 1', () => {
    const f = flashTP(BT, [0.4, 0.6], 370, ATM);
    expect(f.beta).toBeGreaterThan(0);
    expect(f.beta).toBeLessThan(1);
    f.x.forEach((xi, i) => expect((1 - f.beta) * xi + f.beta * f.y[i]!).toBeCloseTo([0.4, 0.6][i]!, 12));
    expect(sum(f.x)).toBeCloseTo(1, 12);
    expect(sum(f.y)).toBeCloseTo(1, 12);
    f.x.forEach((xi, i) => expect(f.y[i]! / xi).toBeCloseTo(f.K[i]!, 10));
  });
});

describe('enthalpy & PH flash', () => {
  it('latent heat at Tb equals the tabulated value', () => {
    expect(latentHeat(bz, bz.Tb)).toBeCloseTo(bz.dHvap, 6);
  });

  it('PH flash inverts the TP enthalpy in every phase region', () => {
    for (const T of [330, 366, 368, 380, 420]) {
      const H = enthalpyTP(BT, z50, T, ATM);
      expect(flashPH(BT, z50, ATM, H).T).toBeCloseTo(T, 6);
    }
  });
});

describe('feed thermal condition q', () => {
  const Tb = bubbleTemperature(BT, z50, ATM).T;
  const Td = dewTemperature(BT, z50, ATM).T;
  const q = (T: number) => thermalCondition(BT, z50, ATM, enthalpyTP(BT, z50, T, ATM));

  it('q = 1 at the bubble point and q = 0 at the dew point', () => {
    expect(q(Tb)).toBeCloseTo(1, 8);
    expect(q(Td)).toBeCloseTo(0, 8);
  });
  it('subcooled → q > 1, superheated → q < 0', () => {
    expect(q(Tb - 20)).toBeGreaterThan(1);
    expect(q(Td + 20)).toBeLessThan(0);
  });
  it('stateFromThermalCondition is the inverse of thermalCondition', () => {
    for (const target of [1.2, 1, 0.5, 0, -0.3]) {
      const s = stateFromThermalCondition(BT, z50, ATM, target);
      expect(thermalCondition(BT, z50, ATM, enthalpyTP(BT, z50, s.T, ATM))).toBeCloseTo(target, 6);
    }
    const half = stateFromThermalCondition(BT, z50, ATM, 0.5);
    expect(half.phase).toBe('two-phase');
  });
});

describe('unit balances', () => {
  const s1 = { F: 100, T: 365.15, P: ATM, z: [0.5, 0.5] };
  const s2 = { F: 60, T: 350.15, P: ATM, z: [0.3, 0.7] };

  it('mixer conserves moles, components and enthalpy', () => {
    const m = mixStreams(BT, [s1, s2]);
    expect(m.F).toBeCloseTo(160, 12);
    expect(m.z[0]).toBeCloseTo((100 * 0.5 + 60 * 0.3) / 160, 12);
    const Hin = 100 * enthalpyTP(BT, s1.z, s1.T, s1.P) + 60 * enthalpyTP(BT, s2.z, s2.T, s2.P);
    expect(m.F * m.H).toBeCloseTo(Hin, 4);
    expect(m.F * enthalpyTP(BT, m.z, m.T, m.P)).toBeCloseTo(Hin, 2);
    expect(m.T).toBeGreaterThan(s2.T);
    expect(m.T).toBeLessThan(s1.T);
  });

  it('mixing identical streams leaves the state unchanged', () => {
    const m = mixStreams(BT, [s1, s1]);
    expect(m.T).toBeCloseTo(s1.T, 6);
    expect(m.F).toBe(200);
  });

  it('heater: Q = 0 is a no-op; Q raises H by exactly 3600·Q/F', () => {
    expect(heatStream(BT, s1, 0).T).toBeCloseTo(s1.T, 6);
    const h = heatStream(BT, s1, 250);
    expect(h.H - enthalpyTP(BT, s1.z, s1.T, s1.P)).toBeCloseTo((3600 * 250) / 100, 6);
    expect(h.T).toBeGreaterThan(s1.T);
  });

  it('heater duty for bubble → dew point matches the enthalpy difference', () => {
    const Tb = bubbleTemperature(BT, z50, ATM).T;
    const Td = dewTemperature(BT, z50, ATM).T;
    const sat = { ...s1, T: Tb };
    const Q = (100 * (enthalpyTP(BT, z50, Td, ATM) - enthalpyTP(BT, z50, Tb, ATM))) / 3600; // kW
    expect(Q).toBeGreaterThan(800); // ~ 100 kmol/h × 31.5 MJ/kmol ≈ 880 kW
    expect(Q).toBeLessThan(950);
    const out = heatStream(BT, sat, Q);
    expect(out.T).toBeCloseTo(Td, 5);
    expect(out.q).toBeCloseTo(0, 6);
  });
});

describe('validity warnings', () => {
  it('flags Antoine extrapolation and supercritical temperatures', () => {
    expect(validityWarnings(BT, 360)).toEqual([]);
    expect(validityWarnings(BT, 383)).toEqual([]); // benzene 6.85 K past its fit — within margin
    expect(validityWarnings(BT, 390).some((w) => w.includes('Benzene'))).toBe(true);
    expect(validityWarnings(BT, 600).some((w) => w.includes('above Tc'))).toBe(true);
  });
});
