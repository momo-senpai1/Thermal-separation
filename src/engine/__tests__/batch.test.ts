import { describe, expect, it } from 'vitest';
import { batchAt, simulateBatch, stepDown } from '../batch';
import { alphaSystem, getSystem } from '../vle/systems';

const a5 = alphaSystem(5);
const a2 = alphaSystem(2);

/** Analytic Rayleigh for constant α. */
const rayleighLnS = (alpha: number, x0: number, x: number) =>
  (Math.log(x / x0) + alpha * Math.log((1 - x0) / (1 - x))) / (alpha - 1);

describe('open distillation (Rayleigh)', () => {
  const r = simulateBatch({ y: a5.y, x0: 0.5, mode: 'rayleigh' });
  it('matches the analytic constant-α solution', () => {
    expect(r.ok).toBe(true);
    for (const p of r.points.filter((q, i) => i % 40 === 0 && i > 0 && q.xW > 0)) {
      expect(Math.log(p.s)).toBeCloseTo(rayleighLnS(5, 0.5, p.xW), 3);
    }
  });
  it('vapour is the instantaneous distillate; the first drop is y*(x₀)', () => {
    expect(r.points[0]!.xD).toBeCloseTo(a5.y(0.5), 12); // 0.833
    expect(r.points[0]!.xDavg).toBeCloseTo(a5.y(0.5), 12);
  });
  it('closes the light-key balance at every instant: s·x_W + d·x̄_D = x₀', () => {
    for (const p of r.points) expect(p.s * p.xW + p.d * p.xDavg).toBeCloseTo(0.5, 9);
  });
  it('boiled to dryness the collected distillate returns to the charge', () => {
    expect(r.points.at(-1)!.xDavg).toBeCloseTo(0.5, 3);
  });
  it('interpolates along the trajectory', () => {
    const p = batchAt(r.points, 0.5);
    expect(p.d).toBe(0.5);
    expect(p.xW).toBeLessThan(0.5);
    expect(p.xDavg).toBeGreaterThan(0.5);
  });
});

describe('batch rectification, constant reflux', () => {
  it('N = 1 with v = 0 is open distillation', () => {
    const ray = simulateBatch({ y: a2.y, x0: 0.5, mode: 'rayleigh' });
    const col = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-reflux', N: 1, v: 0 });
    expect(batchAt(col.points, 0.4).xW).toBeCloseTo(batchAt(ray.points, 0.4).xW, 4);
  });
  it('more stages and more reflux give a purer distillate', () => {
    const base = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-reflux', N: 4, v: 3 });
    const tall = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-reflux', N: 8, v: 3 });
    const wet = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-reflux', N: 4, v: 8 });
    expect(tall.points[0]!.xD).toBeGreaterThan(base.points[0]!.xD);
    expect(wet.points[0]!.xD).toBeGreaterThan(base.points[0]!.xD);
  });
  it('closes the balance and counts boil-up as (v+1)·D', () => {
    const r = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-reflux', N: 5, v: 3 });
    for (const p of r.points) expect(p.s * p.xW + p.d * p.xDavg).toBeCloseTo(0.5, 9);
    const p = batchAt(r.points, 0.3);
    expect(p.boilup).toBeCloseTo(4 * 0.3, 6);
  });
  it('total reflux obeys Fenske: x_D/(1−x_D) = α^N · x_W/(1−x_W)', () => {
    const xW = stepDown(a2.y, 0.9, 1e9, 4);
    expect(Math.log((0.9 / 0.1) * ((1 - xW) / xW)) / Math.log(2)).toBeCloseTo(4, 4);
  });
});

describe('batch rectification, constant purity', () => {
  const r = simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-purity', N: 6, xD: 0.95 });
  it('holds x_D, so the collected distillate has x_D too', () => {
    expect(r.ok).toBe(true);
    for (const p of r.points) expect(p.xDavg).toBeCloseTo(0.95, 9);
  });
  it('reflux must rise as the still is stripped, until the purity can no longer be held', () => {
    for (let i = 1; i < r.points.length; i++) expect(r.points[i]!.v).toBeGreaterThanOrEqual(r.points[i - 1]!.v - 1e-9);
    expect(r.endReason).toMatch(/can no longer be held/);
  });
  it('interpolated states keep x̄_D = x_D exactly', () => {
    for (const d of [0.1, 0.27, 0.4]) expect(batchAt(r.points, d, 'constant-purity').xDavg).toBeCloseTo(0.95, 12);
  });
  it('L/L₀ = (x_D − x₀)/(x_D − x_W)', () => {
    const p = r.points[Math.floor(r.points.length / 2)]!;
    expect(p.s).toBeCloseTo((0.95 - 0.5) / (0.95 - p.xW), 12);
  });
  it('refuses a purity below the vapour over the charge', () => {
    expect(simulateBatch({ y: a2.y, x0: 0.5, mode: 'constant-purity', N: 6, xD: 0.6 }).ok).toBe(false);
  });
});

describe('real systems', () => {
  it('ethanol / water: the distillate cannot pass the azeotrope', () => {
    const eth = getSystem('ethanol-water');
    const r = simulateBatch({ y: eth.y, x0: 0.2, mode: 'constant-reflux', N: 10, v: 20, xMax: eth.azeotrope! });
    for (const p of r.points) expect(p.xD).toBeLessThanOrEqual(eth.azeotrope! + 1e-9);
  });
});
