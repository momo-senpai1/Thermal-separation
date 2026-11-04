import { describe, expect, it } from 'vitest';
import { borderLines, columnAtTotalReflux, defaultDistillate, field, lineThrough, productRegions, singularPoints, trace, vertexT } from '../lines';
import { ACM_AZEOTROPES, bubble, dew, TERNARY_SYSTEMS, type Vec3 } from '../model';

const P = 1.01325;
const hch = TERNARY_SYSTEMS.find((s) => s.id === 'hch')!.get();
const acm = TERNARY_SYSTEMS.find((s) => s.id === 'acm')!.get();
const sum = (v: number[]) => v[0]! + v[1]! + v[2]!;

describe('equilibrium', () => {
  it('pure boiling points: n-hexane 68.7 °C, cyclohexane 80.7 °C, n-heptane 98.4 °C at 1.013 bar', () => {
    const T = vertexT(hch, P);
    expect(T[0]).toBeCloseTo(68.7, 0);
    expect(T[1]).toBeCloseTo(80.7, 0);
    expect(T[2]).toBeCloseTo(98.4, 0);
  });
  it('dew point inverts the bubble point (ideal and Wilson)', () => {
    for (const sys of [hch, acm]) {
      const x: Vec3 = [0.2, 0.5, 0.3];
      const b = bubble(sys, x, P);
      const d = dew(sys, b.y, P);
      expect(d.T).toBeCloseTo(b.T, 6);
      d.x.forEach((xi, i) => expect(xi).toBeCloseTo(x[i]!, 6));
      expect(sum(b.y)).toBeCloseTo(1, 12);
    }
  });
});

describe('zeotropic reference (ideal)', () => {
  const pts = singularPoints(hch, P);
  it('three pure singular points, no azeotropes: hexane light node, heptane heavy node, cyclohexane saddle', () => {
    expect(pts).toHaveLength(3);
    expect(pts.find((p) => p.label === 'n-Hexane')!.kind).toBe('light-node');
    expect(pts.find((p) => p.label === 'n-Heptane')!.kind).toBe('heavy-node');
    expect(pts.find((p) => p.label === 'Cyclohexane')!.kind).toBe('saddle');
  });
  it('no border lines; every field line runs from heptane up to hexane', () => {
    expect(borderLines(hch, P, pts)).toHaveLength(0);
    const f = field(hch, P, pts);
    expect(f.length).toBeGreaterThan(8);
    for (const l of f) expect(l.pts.at(-1)![0]).toBeGreaterThan(0.99);
  });
  it('temperature falls monotonically up a distillation line', () => {
    const l = lineThrough(hch, P, [0.3, 0.3, 0.4]);
    for (let i = 1; i < l.T.length; i++) expect(l.T[i]!).toBeLessThan(l.T[i - 1]! + 1e-9);
  });
  it('column at total reflux: snapping D puts it on the line through a balanced B', () => {
    const F: Vec3 = [0.35, 0.3, 0.35];
    const c1 = columnAtTotalReflux(hch, P, F, [0.8, 0.15, 0.05])!;
    const c2 = columnAtTotalReflux(hch, P, F, c1.snap)!;
    expect(c2.feasible).toBe(true);
    expect(c2.gap).toBeLessThan(1e-3);
    // lever rule: F = δ·D + (1 − δ)·B
    const D = c1.snap;
    F.forEach((f, i) => expect(c2.DF * D[i]! + (1 - c2.DF) * c2.B[i]!).toBeCloseTo(f, 3));
    expect(c2.N).toBeGreaterThan(1);
  });
  it('product regions: bounded by the line through F and the direct / indirect splits', () => {
    const F: Vec3 = [0.35, 0.3, 0.35];
    const r = productRegions(hch, P, F);
    expect(r.distillate[0]).toEqual(F);
    // indirect split: heptane → F → hexane–cyclohexane edge at (0.538, 0.462, 0)
    const ind = r.distillate.at(-1)!;
    expect(ind[2]).toBeCloseTo(0, 6);
    expect(ind[0]).toBeCloseTo(0.35 / 0.65, 3);
    // direct split: hexane → F → cyclohexane–heptane edge at (0, 0.462, 0.538)
    const dir = r.bottoms.at(-1)!;
    expect(dir[0]).toBeCloseTo(0, 6);
    expect(dir[1]).toBeCloseTo(0.3 / 0.65, 3);
    // the regions pass through the light and heavy ends
    expect(r.distillate.some((p) => p[0] > 0.99)).toBe(true);
    expect(r.bottoms.some((p) => p[2] > 0.99)).toBe(true);
  });
});

describe('snapping to a feasible split', () => {
  it.each([
    ['hch', [0.35, 0.3, 0.35]],
    ['acm', [0.4, 0.08, 0.52]],
  ] as const)('%s: a distillate inside the region snaps to a real split (on one line, collinear)', (id, F) => {
    const sys = TERNARY_SYSTEMS.find((s) => s.id === id)!.get();
    const D = defaultDistillate(sys, P, [...F] as Vec3, borderLines(sys, P, singularPoints(sys, P)));
    const c = columnAtTotalReflux(sys, P, [...F] as Vec3, D)!;
    expect(c.feasible).toBe(true);
    expect(c.gap).toBeLessThan(1e-3);
    expect(c.DF).toBeGreaterThan(0.1);
    expect(c.DF).toBeLessThan(0.9);
    F.forEach((f, i) => expect(c.DF * D[i]! + (1 - c.DF) * c.B[i]!).toBeCloseTo(f, 3));
  });
});

describe('acetone / chloroform / methanol (Wilson fitted to the binary azeotropes)', () => {
  const pts = singularPoints(acm, P);
  const find = (label: string) => pts.find((p) => p.label === label)!;

  it('reproduces the three binary azeotropes', () => {
    const ac = find('Ace–Chl az.');
    const am = find('Ace–MeOH az.');
    const cm = find('Chl–MeOH az.');
    expect(ac.x[0]).toBeCloseTo(ACM_AZEOTROPES['acetone-chloroform'].x1, 3);
    expect(ac.T).toBeCloseTo(64.4, 2);
    expect(am.x[0]).toBeCloseTo(ACM_AZEOTROPES['acetone-methanol'].x1, 3);
    expect(am.T).toBeCloseTo(55.5, 2);
    expect(cm.x[1]).toBeCloseTo(ACM_AZEOTROPES['chloroform-methanol'].x1, 3);
    expect(cm.T).toBeCloseTo(53.5, 2);
  });

  it('predicts the ternary saddle azeotrope near the literature 57.5 °C', () => {
    const t = pts.filter((p) => p.order === 'ternary');
    expect(t).toHaveLength(1);
    expect(t[0]!.kind).toBe('saddle');
    expect(t[0]!.T).toBeGreaterThan(56);
    expect(t[0]!.T).toBeLessThan(59);
  });

  it('classifies the topology: 2 light nodes, 2 heavy nodes, 3 saddles', () => {
    expect(find('Ace–MeOH az.').kind).toBe('light-node');
    expect(find('Chl–MeOH az.').kind).toBe('light-node');
    expect(find('Methanol').kind).toBe('heavy-node');
    expect(find('Ace–Chl az.').kind).toBe('heavy-node');
    expect(find('Acetone').kind).toBe('saddle');
    expect(find('Chloroform').kind).toBe('saddle');
  });

  it('four border-line branches from the ternary saddle split four distillation regions', () => {
    const b = borderLines(acm, P, pts);
    expect(b).toHaveLength(4);
    const ends = b.map((l) => l.pts.at(-1)!);
    const near = (x: Vec3, label: string) => Math.hypot(...x.map((v, i) => v - find(label).x[i]!)) < 0.03;
    expect(ends.some((e) => near(e, 'Ace–MeOH az.'))).toBe(true);
    expect(ends.some((e) => near(e, 'Chl–MeOH az.'))).toBe(true);
    expect(ends.some((e) => near(e, 'Methanol'))).toBe(true);
    expect(ends.some((e) => near(e, 'Ace–Chl az.'))).toBe(true);
  });

  it('a distillation line cannot cross a border line: two feeds either side end at different light nodes', () => {
    const up1 = trace(acm, P, [0.6, 0.1, 0.3], 'up', 500).pts.at(-1)!;
    const up2 = trace(acm, P, [0.1, 0.6, 0.3], 'up', 500).pts.at(-1)!;
    expect(Math.hypot(up1[0] - up2[0], up1[1] - up2[1])).toBeGreaterThan(0.3);
  });
});
