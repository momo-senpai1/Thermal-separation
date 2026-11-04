import { describe, expect, it } from 'vitest';
import {
  fenskeMinimumStages,
  minimumReflux,
  qLinePinch,
  rateColumn,
  type ColumnSpec,
} from '../mccabeThiele';
import { yFromAlpha } from '../thermodynamics';

const base: ColumnSpec = { alpha: 2.5, F: 100, zF: 0.5, q: 1, N: 12, R: 2.5, DF: 0.5, condenser: 'total' };

describe('shortcut relations', () => {
  it('Rmin for saturated-liquid feed (textbook: α = 2.5, z = 0.5, x_D = 0.95 → 1.10)', () => {
    expect(minimumReflux(2.5, 0.5, 1, 0.95)).toBeCloseTo(1.1, 2);
  });
  it('Fenske N_min (α = 2.5, 0.95/0.05 → 6.43)', () => {
    expect(fenskeMinimumStages(2.5, 0.95, 0.05)).toBeCloseTo(6.43, 2);
  });
  it('q-line pinch lies on the equilibrium curve and the q-line', () => {
    for (const q of [1.2, 1, 0.5, 0, -0.2]) {
      const p = qLinePinch(2.5, 0.4, q);
      expect(p.y).toBeCloseTo(yFromAlpha(2.5, p.x), 12);
      expect(q * p.x + (1 - q) * p.y).toBeCloseTo(0.4, 10);
    }
  });
});

describe('rating solve', () => {
  it('closes the material balance and steps exactly N stages', () => {
    const r = rateColumn(base);
    expect(r.D * r.xD + r.B * r.xB).toBeCloseTo(base.F * base.zF, 9);
    expect(r.steps.filter((s) => s.stage > 0)).toHaveLength(base.N);
    expect(r.steps.at(-1)!.x).toBeCloseTo(r.xB, 8);
    expect(r.xD).toBeGreaterThan(0.95);
    expect(base.R).toBeGreaterThan(r.Rmin);
  });

  it('each step lies on the equilibrium curve', () => {
    for (const s of rateColumn(base).steps) expect(s.y).toBeCloseTo(yFromAlpha(base.alpha, s.x), 9);
  });

  it('operating lines intersect on the q-line', () => {
    for (const q of [1.3, 1, 0.6, 0]) {
      const r = rateColumn({ ...base, q });
      expect(q * r.intersection.x + (1 - q) * r.intersection.y).toBeCloseTo(base.zF, 8);
    }
  });

  it('more stages or more reflux → sharper split', () => {
    const r0 = rateColumn(base);
    expect(rateColumn({ ...base, N: 20 }).xD).toBeGreaterThan(r0.xD);
    expect(rateColumn({ ...base, R: 5 }).xD).toBeGreaterThan(r0.xD);
  });

  it('total reflux reproduces Fenske: separation factor = α^N', () => {
    const r = rateColumn({ ...base, R: 1e6, N: 8 });
    expect(fenskeMinimumStages(2.5, r.xD, r.xB)).toBeCloseTo(8, 3);
  });

  it('partial condenser adds one equilibrium stage', () => {
    const t = rateColumn({ ...base, R: 1e6, N: 8 });
    const p = rateColumn({ ...base, R: 1e6, N: 8, condenser: 'partial' });
    expect(fenskeMinimumStages(2.5, p.xD, p.xB)).toBeCloseTo(9, 3);
    expect(p.xD).toBeGreaterThan(t.xD);
    expect(p.steps[0]!.section).toBe('condenser');
  });

  it('rejects a feed so vaporised that V′ ≤ 0', () => {
    expect(() => rateColumn({ ...base, q: -3, R: 0.2 })).toThrow(/stripping vapour/);
  });
});
