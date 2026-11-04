import { beforeEach, describe, expect, it } from 'vitest';
import { useFlowsheet } from '../flowsheetStore';

const st = () => useFlowsheet.getState();
const byType = (t: string) => st().nodes.filter((n) => n.type === t);
const C = (k: number) => k - 273.15;

beforeEach(() => st().resetDemo());

describe('demo flowsheet — engine connected', () => {
  it('resolves every stream and every unit', () => {
    expect(st().edges.every((e) => e.data?.resolved)).toBe(true);
    for (const n of st().nodes) expect(['ok', 'warning']).toContain(n.data.diag?.status);
  });

  it('column closes the overall and component balances', () => {
    const col = byType('distillation')[0]!;
    const feed = st().edges.find((e) => e.target === col.id)!.data!;
    const { topProduct: D, bottomProduct: B } = col.data.state;
    expect(D!.flowRate + B!.flowRate).toBeCloseTo(feed.flowRate, 9);
    expect(D!.flowRate * D!.molarFractions.compA + B!.flowRate * B!.molarFractions.compA).toBeCloseTo(
      feed.flowRate * feed.molarFractions.compA,
      8,
    );
    expect(D!.molarFractions.compA).toBeGreaterThan(0.9);
    expect(B!.molarFractions.compA).toBeLessThan(0.1);
    expect(col.data.column!.Qr).toBeGreaterThan(0);
    expect(col.data.column!.Qc).toBeLessThan(0);
    expect(C(D!.temperature)).toBeLessThan(C(B!.temperature));
  });
});

describe('reactivity — upstream slider changes reach downstream streams', () => {
  it('raising feed temperature changes its outlet edge, the mixer, heater and column feed', () => {
    const [f1, f2] = byType('feed') as [ReturnType<typeof byType>[number], ReturnType<typeof byType>[number]];
    const snapshot = () => st().edges.map((e) => [e.source, e.data!.temperature] as const);
    const before = snapshot();
    st().updateFeed(f1.id, { temperature: f1.data.state.topProduct!.temperature + 3 });
    snapshot().forEach(([src, t], i) => {
      // F-102's own stream must stay put; every stream fed by F-101 must move
      if (src === f2.id) expect(t).toBeCloseTo(before[i]![1], 12);
      else expect(t).not.toBeCloseTo(before[i]![1], 6);
    });
  });

  it('feed q is computed in T-spec mode and T is computed in q-spec mode', () => {
    const f1 = byType('feed')[0]!;
    st().updateFeed(f1.id, { temperature: 330 });
    expect(byType('feed')[0]!.data.state.topProduct!.vaporFraction).toBeGreaterThan(1); // subcooled
    st().updateNodeParams(f1.id, { feedSpec: 'q' });
    st().updateFeed(f1.id, { vaporFraction: 0.5 });
    const T = byType('feed')[0]!.data.state.topProduct!.temperature;
    expect(C(T)).toBeGreaterThan(92); // between bubble (92.1) and dew (98.8) point
    expect(C(T)).toBeLessThan(98.8);
  });

  it('heater duty and column reflux propagate to products', () => {
    const col = () => byType('distillation')[0]!;
    const xD0 = col().data.state.topProduct!.molarFractions.compA;
    st().updateNodeParams(col().id, { refluxRatio: 5 });
    expect(col().data.state.topProduct!.molarFractions.compA).toBeGreaterThan(xD0);

    const h = byType('heater')[0]!;
    const q0 = col().data.column!.q;
    st().updateNodeParams(h.id, { heatDuty: 0 });
    expect(col().data.column!.q).toBeGreaterThan(q0);
  });

  it('deleting a stream idles everything downstream', () => {
    const h = byType('heater')[0]!;
    const e = st().edges.find((x) => x.target === h.id)!;
    st().onEdgesChange([{ type: 'remove', id: e.id }]);
    expect(byType('heater')[0]!.data.diag?.status).toBe('idle');
    expect(byType('distillation')[0]!.data.diag?.status).toBe('idle');
    expect(st().edges.filter((x) => !x.data?.resolved)).toHaveLength(1);
  });

  it('serialises to the strict payload schema', () => {
    const s = st().getStreamPayloads()[0]!;
    expect(Object.keys(s).sort()).toEqual(
      ['flowRate', 'id', 'molarFractions', 'pressure', 'source', 'target', 'temperature', 'vaporFraction'].sort(),
    );
    const u = st().getUnitPayloads()[0]!;
    expect(Object.keys(u).sort()).toEqual(['id', 'params', 'state', 'type']);
  });
});
