import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM } from '@/engine/components';
import { useFlowsheet } from '@/store/flowsheetStore';
import { yFromAlpha } from '@/engine/thermodynamics';
import { buildMcCabeThiele, buildStageTable, buildTxy } from '../chartData';

const column = () => {
  useFlowsheet.getState().resetDemo();
  return useFlowsheet.getState().nodes.find((n) => n.type === 'distillation')!.data.column!;
};

describe('McCabe–Thiele series', () => {
  it('staircase alternates horizontal/vertical moves and ends on the diagonal at x_B', () => {
    const c = column();
    const s = buildMcCabeThiele(c);
    expect(s.staircase[0]).toEqual({ x: c.xD, y: c.xD });
    for (let i = 1; i < s.staircase.length; i++) {
      const a = s.staircase[i - 1]!;
      const b = s.staircase[i]!;
      const horizontal = Math.abs(a.y - b.y) < 1e-12;
      const vertical = Math.abs(a.x - b.x) < 1e-12;
      expect(horizontal || vertical).toBe(true);
    }
    const end = s.staircase.at(-1)!;
    expect(end.x).toBeCloseTo(c.xB, 8);
    expect(end.y).toBeCloseTo(c.xB, 8);
  });

  it('stage corners sit on the equilibrium curve; exactly one is the feed stage', () => {
    const c = column();
    const s = buildMcCabeThiele(c);
    for (const p of s.corners) expect(p.y).toBeCloseTo(yFromAlpha(c.alpha, p.x), 9);
    expect(s.corners.filter((p) => p.isFeed)).toHaveLength(1);
  });

  it('operating lines meet at the intersection, and the q-line passes through it', () => {
    const c = column();
    const s = buildMcCabeThiele(c);
    expect(s.rectifying[1]).toEqual(s.stripping[0]);
    const [a, b] = s.qLine as [{ x: number; y: number }, { x: number; y: number }];
    const I = c.intersection;
    // collinear: cross product ≈ 0
    expect((b.x - a.x) * (I.y - a.y) - (b.y - a.y) * (I.x - a.x)).toBeCloseTo(0, 8);
  });
});

describe('T–x–y and stage table', () => {
  it('dew curve lies above the bubble curve between the pure-component points', () => {
    const rows = buildTxy(DEFAULT_SYSTEM, 101.325, 21);
    expect(rows[0]!.bubble).toBeCloseTo(rows[0]!.dew, 6);
    expect(rows.at(-1)!.bubble).toBeCloseTo(rows.at(-1)!.dew, 6);
    for (const r of rows.slice(1, -1)) expect(r.dew).toBeGreaterThan(r.bubble);
  });

  it('stage temperatures rise monotonically down the column', () => {
    const t = buildStageTable(column(), DEFAULT_SYSTEM, 101.325);
    for (let i = 1; i < t.length; i++) expect(t[i]!.T).toBeGreaterThan(t[i - 1]!.T);
    expect(t.at(-1)!.section).toBe('Reboiler');
  });
});
