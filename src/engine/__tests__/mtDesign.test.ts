/**
 * Reference values from the McCabe–Thiele workbench specification
 * (α = 2, v = 3, x_F = 0.5, q = 0.5, x_D = 0.95, x_B = 0.05 unless stated).
 */
import { describe, expect, it } from 'vitest';
import { fenske, gillilandN, solveDesign, underwood, type DesignSpec } from '../mtDesign';
import { alphaSystem, getSystem } from '../vle/systems';

const sys = alphaSystem(2);
const D: DesignSpec = { y: sys.y, alpha: 2, v: 3, xF: 0.5, xD: 0.95, xB: 0.05, q: 0.5 };
const N = (p: Partial<DesignSpec> = {}) => solveDesign({ ...D, ...p });

describe('stage construction — defaults', () => {
  it('q-line meets the rectifying line at x = 0.436; stage 8 is the feed stage', () => {
    const r = N();
    expect(r.ok).toBe(true);
    expect(r.intersection.x).toBeCloseTo(0.436, 3);
    expect(r.stages[6]!.x).toBeCloseTo(0.465, 3);
    expect(r.stages[7]!.x).toBeCloseTo(0.414, 3);
    expect(r.feedStage).toBe(8);
  });
  it('needs N = 15.01 stages (fractional last stage)', () => {
    expect(N().N).toBeCloseTo(15.01, 2);
  });
});

describe('shortcut methods', () => {
  it('Fenske N_min = 8.50', () => expect(fenske(2, 0.95, 0.05)).toBeCloseTo(8.5, 2));
  it('Underwood v_min = 2.123 (q = 0.5), 2.700 (q = 0), 1.700 (q = 1), 4.205 (q = −1)', () => {
    expect(underwood(2, 0.5, 0.5, 0.95)).toBeCloseTo(2.123, 3);
    expect(underwood(2, 0.5, 0, 0.95)).toBeCloseTo(2.7, 3);
    expect(underwood(2, 0.5, 1, 0.95)).toBeCloseTo(1.7, 3);
    expect(underwood(2, 0.5, -1, 0.95)).toBeCloseTo(4.205, 3);
  });
  it('Gilliland (Liddle) gives 15.62 at the defaults', () => {
    const r = N();
    expect(r.shortcut!.gilliland).toBeCloseTo(15.62, 2);
    expect(r.shortcut!.vmin).toBeCloseTo(2.123, 3);
    expect(3 / r.shortcut!.vmin).toBeCloseTo(1.41, 2);
  });
  it('Gilliland vs staircase: 16.45 vs 16.12 at v = 2.8; 25.77 vs 26.59 at v = 2.2', () => {
    expect(gillilandN(2.8, underwood(2, 0.5, 0.5, 0.95), fenske(2, 0.95, 0.05))).toBeCloseTo(16.45, 2);
    expect(N({ v: 2.8 }).N).toBeCloseTo(16.12, 2);
    expect(gillilandN(2.2, underwood(2, 0.5, 0.5, 0.95), fenske(2, 0.95, 0.05))).toBeCloseTo(25.77, 2);
  });
});

describe('walking towards the limits', () => {
  it('18.67 at v = 2.5, 26.59 at v = 2.2, none at v = 2.1', () => {
    expect(N({ v: 2.5 }).N).toBeCloseTo(18.67, 2);
    expect(N({ v: 2.2 }).N).toBeCloseTo(26.59, 2);
    expect(N({ v: 2.1 }).ok).toBe(false);
  });
  it('total reflux: 8.68 stages at v = 100 (Fenske limit 8.50)', () => {
    expect(N({ v: 100 }).N).toBeCloseTo(8.68, 2);
  });
  it('feed condition: 19.53 (q = 0), 13.54 (q = 1), 12.70 (q = 1.5)', () => {
    expect(N({ q: 0 }).N).toBeCloseTo(19.53, 2);
    expect(N({ q: 1 }).N).toBeCloseTo(13.54, 2);
    expect(N({ q: 1.5 }).N).toBeCloseTo(12.7, 2);
  });
  it('q = −1 at v = 3 no longer works (v_min = 4.205)', () => {
    expect(N({ q: -1 }).ok).toBe(false);
  });
  it('q = −v: the q-line is parallel to the rectifying line', () => {
    expect(N({ q: -3 }).error?.code).toBe('parallel');
  });
});

describe('Murphree efficiency', () => {
  it('E_M = 0.8 → 18.87, 0.7 → 21.64, 0.5 → 30.39', () => {
    expect(N({ EM: 0.8 }).N).toBeCloseTo(18.87, 2);
    expect(N({ EM: 0.7 }).N).toBeCloseTo(21.64, 2);
    expect(N({ EM: 0.5 }).N).toBeCloseTo(30.39, 2);
  });
  it('near total reflux: 10.88 (E_M = 0.8) vs 8.68', () => {
    expect(N({ v: 100, EM: 0.8 }).N).toBeCloseTo(10.88, 2);
  });
  it('efficiency costs stages, not reflux: v = 2.15 → 40.14 (E_M = 0.8) vs 32.06', () => {
    expect(N({ v: 2.15, EM: 0.8 }).N).toBeCloseTo(40.14, 2);
    expect(N({ v: 2.15 }).N).toBeCloseTo(32.06, 2);
  });
  it('Gilliland switches off with E_M < 1, Underwood stays', () => {
    const r = N({ EM: 0.8 });
    expect(r.shortcut!.gilliland).toBeNull();
    expect(r.shortcut!.vmin).toBeCloseTo(2.123, 3);
    expect(r.pseudo.length).toBeGreaterThan(10);
  });
});

describe('fixed feed stage', () => {
  const table: [number, number][] = [[6, 20.01], [7, 15.47], [8, 15.01], [9, 15.27], [11, 16.49], [14, 19.06], [30, 34.92]];
  it.each(table)('feed stage %i → N = %f', (f, n) => {
    expect(N({ feedStage: f }).N).toBeCloseTo(n, 2);
  });
  it('stage 5 or earlier pinches', () => {
    expect(N({ feedStage: 5 }).error?.code).toBe('feed-pinch');
  });
  it('a feed stage below the last stage the column needs is refused', () => {
    // near total reflux the column is done in ~9 stages, before stage 12 is reached
    expect(N({ v: 100, feedStage: 12 }).error?.code).toBe('feed-beyond');
    expect(N({ feedStage: 40 }).ok).toBe(true); // a late feed only creeps towards a pinch: taller, not refused
  });
  it('q moves the optimum: q = 1 stage 8 → 13.77 (opt. stage 7, 13.54); q = 1.5 → 13.22 (opt. 6, 12.70)', () => {
    expect(N({ q: 1, feedStage: 8 }).N).toBeCloseTo(13.77, 2);
    expect(N({ q: 1 }).feedStage).toBe(7);
    expect(N({ q: 1.5, feedStage: 8 }).N).toBeCloseTo(13.22, 2);
    expect(N({ q: 1.5 }).feedStage).toBe(6);
  });
  it('q = 0: optimum stage 11 (19.53); stage 8 pinches', () => {
    expect(N({ q: 0 }).feedStage).toBe(11);
    expect(N({ q: 0, feedStage: 8 }).ok).toBe(false);
  });
  it('with E_M = 0.8: optimum stage 10 (18.87), stage 8 → 20.63, stage 7 pinches', () => {
    expect(N({ EM: 0.8 }).feedStage).toBe(10);
    expect(N({ EM: 0.8, feedStage: 8 }).N).toBeCloseTo(20.63, 2);
    expect(N({ EM: 0.8, feedStage: 7 }).ok).toBe(false);
  });
});

describe('concentration targets (the construction read backwards)', () => {
  it('bottoms target: N = 10 → 0.2699, 15 → 0.0502, 20 → 0.0065', () => {
    expect(N({ target: 'bottoms', N: 10 }).xB).toBeCloseTo(0.2699, 4);
    expect(N({ target: 'bottoms', N: 15 }).xB).toBeCloseTo(0.0502, 4);
    expect(N({ target: 'bottoms', N: 20 }).xB).toBeCloseTo(0.0065, 4);
  });
  it('distillate target inverts the stage count', () => {
    const r = N({ target: 'distillate', N: 15.01 });
    expect(r.ok).toBe(true);
    expect(r.xD).toBeCloseTo(0.95, 3);
    expect(r.N).toBeCloseTo(15.01, 6);
  });
  it('feed stage at most N − 1', () => {
    expect(N({ target: 'bottoms', N: 10, feedStage: 10 }).error?.code).toBe('feed-too-low');
  });
});

describe('azeotropic systems', () => {
  const ipa = getSystem('isopropanol-water');
  const eth = getSystem('ethanol-water');
  it('Van Laar models reproduce the known azeotropes (IPA ≈ 0.68 / 80.4 °C, EtOH ≈ 0.89 / 78.2 °C)', () => {
    expect(ipa.azeotrope!).toBeGreaterThan(0.64);
    expect(ipa.azeotrope!).toBeLessThan(0.7);
    expect(ipa.T!(ipa.azeotrope!)).toBeCloseTo(80.5, 0);
    expect(eth.azeotrope!).toBeGreaterThan(0.87);
    expect(eth.azeotrope!).toBeLessThan(0.93);
  });
  it('ethanol / water: x_D = 0.95 is above the azeotrope → refused', () => {
    const r = solveDesign({ y: eth.y, azeotrope: eth.azeotrope, v: 3, xF: 0.5, xD: 0.95, xB: 0.05, q: 0.5 });
    expect(r.error?.code).toBe('azeotrope');
  });
  it('ethanol / water at x_D = 0.80 works and gets harder towards the azeotrope', () => {
    const s = { y: eth.y, azeotrope: eth.azeotrope, v: 3, xF: 0.5, xB: 0.05, q: 0.5 };
    const a = solveDesign({ ...s, xD: 0.8 });
    const b = solveDesign({ ...s, xD: 0.85 });
    expect(a.ok && b.ok).toBe(true);
    expect(b.N).toBeGreaterThan(a.N);
  });
  it('the other side of the azeotrope: mirrored column under the diagonal', () => {
    const r = solveDesign({ y: ipa.y, azeotrope: ipa.azeotrope, v: 3, xF: 0.85, xD: 0.72, xB: 0.97, q: 1 });
    expect(r.ok).toBe(true);
    expect(r.mirrored).toBe(true);
    for (const s of r.stages.filter((p) => !p.partial)) expect(s.y).toBeLessThan(s.x); // below the diagonal
    expect(r.staircase[0]).toEqual({ x: 0.72, y: 0.72 });
    // easier further from the azeotrope, harder at low reflux
    const far = solveDesign({ y: ipa.y, azeotrope: ipa.azeotrope, v: 3, xF: 0.85, xD: 0.8, xB: 0.97, q: 1 });
    expect(far.N).toBeLessThan(r.N);
    expect(solveDesign({ y: ipa.y, azeotrope: ipa.azeotrope, v: 5, xF: 0.85, xD: 0.72, xB: 0.97, q: 1 }).N).toBeLessThan(r.N);
  });
  it('rejects compositions in the wrong order', () => {
    expect(N({ xD: 0.4 }).error?.code).toBe('order');
  });
});
