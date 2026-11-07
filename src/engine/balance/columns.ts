/** Build the McCabe–Thiele input for a column from the solved balance. */

import { columnMT, curveFn, type MTResult } from './columnMT';
import { nKey, qKey, xKey } from './solver';
import type { BProblem, VarKey } from './types';

export interface ColumnAnalysis {
  unitId: string;
  name: string;
  result: MTResult | null;
  /** reason why the construction could not run (missing data) */
  missing?: { code: string; detail?: string };
}

export function analyseColumns(p: BProblem, values: Map<VarKey, number>): ColumnAnalysis[] {
  const out: ColumnAnalysis[] = [];
  for (const u of p.units) {
    if (u.kind !== 'column' || !u.column?.mt) continue;
    const cs = u.column;
    const k = Math.min(cs.key, p.components.length - 1);
    const name = u.name;
    const val = (key: VarKey) => values.get(key);
    const tops = p.streams.filter((s) => s.from === u.id && s.fromPort === 'top');
    const bots = p.streams.filter((s) => s.from === u.id && s.fromPort === 'bottom');
    const ins = p.streams.filter((s) => s.to === u.id);
    if (tops.length !== 1 || bots.length !== 1) {
      out.push({ unitId: u.id, name, result: null, missing: { code: 'ports' } });
      continue;
    }
    const D = val(nKey(tops[0]!.id));
    const xD = val(xKey(tops[0]!.id, k));
    const B = val(nKey(bots[0]!.id));
    const xB = val(xKey(bots[0]!.id, k));
    const lack: string[] = [];
    if (D === undefined || xD === undefined) lack.push(tops[0]!.name);
    if (B === undefined || xB === undefined) lack.push(bots[0]!.name);
    const feeds = ins.map((s) => ({
      name: s.name,
      n: val(nKey(s.id)),
      z: val(xKey(s.id, k)),
      q: val(qKey(s.id)) ?? s.q ?? undefined,
    }));
    for (const f of feeds) if (f.n === undefined || f.z === undefined) lack.push(f.name);
    if (lack.length) {
      out.push({ unitId: u.id, name, result: null, missing: { code: 'flows', detail: lack.join(', ') } });
      continue;
    }
    const noQ = feeds.filter((f) => f.q === undefined || f.q === null).map((f) => f.name);
    if (noQ.length) {
      out.push({ unitId: u.id, name, result: null, missing: { code: 'q', detail: noQ.join(', ') } });
      continue;
    }
    const curve = curveFn(cs.curve);
    if (!curve) {
      out.push({ unitId: u.id, name, result: null, missing: { code: 'curve' } });
      continue;
    }
    const result = columnMT({
      curve,
      v: cs.v,
      condenser: cs.condenser,
      D: D!,
      xD: xD!,
      B: B!,
      xB: xB!,
      feeds: feeds.map((f) => ({ name: f.name, n: f.n!, z: f.z!, q: f.q! })),
    });
    out.push({ unitId: u.id, name, result });
  }
  return out;
}
