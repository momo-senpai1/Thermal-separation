import { describe, expect, it } from 'vitest';
import { analyseColumns } from '../columns';
import { columnMT } from '../columnMT';
import { thfPressureSwing } from '../examples';
import { nKey, qKey, solveBalance, xKey } from '../solver';
import type { BProblem } from '../types';

describe('balance solver — VR 02 THF pressure-swing example', () => {
  const { problem } = thfPressureSwing();
  const r = solveBalance(problem);
  const v = (k: string) => r.values.get(k)!;

  it('solves every unknown and all balances close', () => {
    expect(r.missing).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.checks.length).toBeGreaterThan(10);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
  it('column 1 removes all butanediol (part b)', () => {
    expect(v(nKey('B1'))).toBeCloseTo(100, 9);
    expect(v(nKey('D1'))).toBeCloseTo(900, 9);
    expect(v(xKey('D1', 0))).toBeCloseTo(5 / 6, 9);
  });
  it('pressure-swing flows (part c)', () => {
    expect(v(nKey('B2'))).toBeCloseTo(74100 / 97, 6);
    expect(v(nKey('B3'))).toBeCloseTo(900 - 74100 / 97, 6);
    expect(v(nKey('D3'))).toBeCloseTo(222.268, 2);
    expect(v(nKey('D2'))).toBeCloseTo(358.351, 2);
    expect(v(xKey('B3', 0))).toBeCloseTo(0.01, 12);
  });
  it('heat loss condenses part of the vapour (part e): q = Q/(Δh·ṅ)', () => {
    expect(v(qKey('F3'))).toBeCloseTo(16500 / 90 / v(nKey('D2')), 9);
  });
  it('takes the envelope around columns 2 and 3 for the recycle, like on paper', () => {
    const sys = r.steps.find((s) => s.solved.some((x) => x.key === nKey('B2')))!;
    expect(sys.how).toBe('system');
    expect(sys.eqs.every((e) => e.scope.length === 3)).toBe(true);
  });
  it('runs McCabe–Thiele for both pressure columns', () => {
    const cols = analyseColumns(problem, r.values);
    expect(cols.map((c) => c.name)).toEqual(['Kolonne 2 (20 bar)', 'Kolonne 3 (10 bar)']);
    const [k2, k3] = cols.map((c) => c.result!);
    expect(k2!.ok).toBe(true);
    expect(k2!.mirrored).toBe(true);
    expect(k2!.N).toBeGreaterThan(3);
    expect(k2!.N).toBeLessThan(6);
    expect(k3!.ok).toBe(true);
    expect(k3!.mirrored).toBe(false);
    expect(k3!.N).toBeGreaterThan(1.5);
    expect(k3!.N).toBeLessThan(3);
  });
});

describe('balance solver — general behaviour', () => {
  const simple = (n: number | null, xB: number | null): BProblem => ({
    components: ['A', 'B'],
    units: [
      { id: 's', kind: 'source', name: 'S', order: 0 },
      { id: 'c', kind: 'column', name: 'C', order: 1 },
      { id: 'd', kind: 'sink', name: 'D', order: 2 },
      { id: 'b', kind: 'sink', name: 'B', order: 2 },
    ],
    streams: [
      { id: 'F', name: 'F', from: 's', fromPort: 'out', to: 'c', n, x: [0.4, null], q: 1 },
      { id: 'D', name: 'D', from: 'c', fromPort: 'top', to: 'd', n: null, x: [0.95, null], q: null },
      { id: 'B', name: 'B', from: 'c', fromPort: 'bottom', to: 'b', n: null, x: [xB, null], q: null },
    ],
  });
  it('lever rule for a simple column', () => {
    const r = solveBalance(simple(100, 0.05));
    expect(r.values.get(nKey('D'))).toBeCloseTo((100 * (0.4 - 0.05)) / 0.9, 9);
    expect(r.missing).toEqual([]);
  });
  it('reports what is missing when underspecified', () => {
    const r = solveBalance(simple(100, null));
    expect(r.missing).toContain(nKey('D'));
    expect(r.missing).toContain(xKey('B', 0));
  });
  it('flags contradictory specifications', () => {
    const p = simple(100, 0.05);
    p.streams[1]!.n = 50; // wrong: lever rule gives 38.9
    const r = solveBalance(p);
    expect(r.warnings).toContain('inconsistent');
  });
});

describe('McCabe–Thiele with constant α', () => {
  it('single saturated-liquid feed, total condenser', () => {
    const a = 2.5;
    const r = columnMT({ curve: (x) => (a * x) / (1 + (a - 1) * x), v: 2, condenser: 'total', D: 40, xD: 0.95, B: 60, xB: 0.05, feeds: [{ name: 'F', n: 100, z: 0.42, q: 1 }] });
    expect(r.ok).toBe(true);
    expect(r.N).toBeGreaterThan(9);
    expect(r.N).toBeLessThan(14);
    expect(r.feedStages[0]!.stage).toBeGreaterThan(3);
  });
  it('a partial condenser saves one stage', () => {
    const a = 2.5;
    const base = { curve: (x: number) => (a * x) / (1 + (a - 1) * x), v: 2, D: 40, xD: 0.95, B: 60, xB: 0.05, feeds: [{ name: 'F', n: 100, z: 0.42, q: 1 }] };
    const t = columnMT({ ...base, condenser: 'total' });
    const pc = columnMT({ ...base, condenser: 'partial' });
    expect(Math.abs(t.N - pc.N)).toBeLessThan(1);
  });
});
