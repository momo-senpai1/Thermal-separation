/**
 * Hand-calculation style solver for balance problems.
 *
 * Equations: total and component balances around every unit and around groups
 * of connected units (envelopes, so recycles are handled like on paper),
 * Σx = 1 for every stream, equal compositions across splitters and heat
 * exchangers, and the exchanger energy balance ṅ·(q_out − q_in)·Δh_v = Q̇.
 *
 * The solver repeatedly looks for the smallest set of equations that is linear
 * in the remaining unknowns and determines them: first single equations with
 * one unknown, then 2×2 and 3×3 systems. Each such move is recorded as a step.
 */

import { PASS_THROUGH, THERMAL, type BalanceResult, type BProblem, type BStream, type BUnit, type Check, type Equation, type Step, type Term, type VarKey } from './types';

export const nKey = (s: string) => `n:${s}`;
export const xKey = (s: string, i: number) => `x:${s}:${i}`;
export const qKey = (s: string) => `q:${s}`;
export const QKey = (u: string) => `Q:${u}`;
export const HKey = (u: string) => `H:${u}`;

const KIND_ORDER = { identity: 0, total: 1, comp: 2, energy: 3, sum: 4 } as const;
const MAX_ENVELOPE = 4;

const isProcess = (u: BUnit) => u.kind !== 'source' && u.kind !== 'sink';

/** Connected groups of process units (size 1 … MAX_ENVELOPE). */
function envelopes(units: BUnit[], streams: BStream[]): string[][] {
  const proc = units.filter(isProcess).map((u) => u.id);
  const set = new Set(proc);
  const adj = new Map<string, Set<string>>(proc.map((id) => [id, new Set()]));
  for (const s of streams) {
    if (set.has(s.from) && set.has(s.to) && s.from !== s.to) {
      adj.get(s.from)!.add(s.to);
      adj.get(s.to)!.add(s.from);
    }
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  const grow = (group: string[]) => {
    const key = [...group].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push([...group]);
    if (group.length >= MAX_ENVELOPE || out.length > 400) return;
    for (const g of group) for (const nb of adj.get(g)!) if (!group.includes(nb)) grow([...group, nb]);
  };
  for (const id of proc) grow([id]);
  return out;
}

export function buildEquations(p: BProblem): Equation[] {
  const C = p.components.length;
  const rank = new Map([...p.units].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((u, i) => [u.id, i]));
  const eqs: Equation[] = [];
  const pr = (scope: string[], kind: keyof typeof KIND_ORDER) =>
    (scope.length - 1) * 10000 + Math.min(...scope.map((u) => rank.get(u) ?? 0)) * 10 + KIND_ORDER[kind];

  for (const scope of envelopes(p.units, p.streams)) {
    const inside = new Set(scope);
    const cross = p.streams.filter((s) => inside.has(s.from) !== inside.has(s.to));
    if (cross.length < 2) continue;
    const sign = (s: BStream) => (inside.has(s.to) ? 1 : -1);
    const id = scope.join('+');
    eqs.push({ id: `T:${id}`, kind: 'total', scope, terms: cross.map((s) => ({ c: sign(s), f: [nKey(s.id)] })), k: 0, priority: pr(scope, 'total') });
    for (let i = 0; i < C; i++) {
      eqs.push({
        id: `C${i}:${id}`,
        kind: 'comp',
        scope,
        comp: i,
        terms: cross.map((s) => ({ c: sign(s), f: [nKey(s.id), xKey(s.id, i)] })),
        k: 0,
        priority: pr(scope, 'comp'),
      });
    }
  }

  for (const s of p.streams) {
    const from = p.units.find((u) => u.id === s.from);
    const scope = [from && isProcess(from) ? s.from : s.to];
    eqs.push({
      id: `S:${s.id}`,
      kind: 'sum',
      scope,
      stream: s.id,
      terms: p.components.map((_, i) => ({ c: 1, f: [xKey(s.id, i)] })),
      k: -1,
      priority: pr(scope, 'sum'),
    });
  }

  for (const u of p.units) {
    if (u.kind !== 'splitter' && !PASS_THROUGH.includes(u.kind)) continue;
    const ins = p.streams.filter((s) => s.to === u.id);
    const outs = p.streams.filter((s) => s.from === u.id);
    if (ins.length !== 1) continue;
    const a = ins[0]!;
    for (const b of outs) {
      for (let i = 0; i < C; i++) {
        eqs.push({
          id: `I${i}:${a.id}:${b.id}`,
          kind: 'identity',
          scope: [u.id],
          comp: i,
          terms: [
            { c: 1, f: [xKey(b.id, i)] },
            { c: -1, f: [xKey(a.id, i)] },
          ],
          k: 0,
          priority: pr([u.id], 'identity'),
        });
      }
    }
    if (THERMAL.includes(u.kind) && outs.length === 1) {
      const b = outs[0]!;
      // cooler: ṅ·q_out·Δh_v = ṅ·q_in·Δh_v + Q̇ (heat removed → liquid formed)
      // heater: ṅ·q_in·Δh_v = ṅ·q_out·Δh_v + Q̇ (heat supplied → vapour formed)
      const s = u.kind === 'heater' ? -1 : 1;
      eqs.push({
        id: `E:${u.id}`,
        kind: 'energy',
        scope: [u.id],
        terms: [
          { c: s, f: [nKey(a.id), qKey(b.id), HKey(u.id)] },
          { c: -s, f: [nKey(a.id), qKey(a.id), HKey(u.id)] },
          { c: -1, f: [QKey(u.id)] },
        ],
        k: 0,
        priority: pr([u.id], 'energy'),
      });
    }
  }
  return eqs;
}

/** Variables that appear in the problem with their given values (null = unknown). */
export function givenValues(p: BProblem): Map<VarKey, number | null> {
  const m = new Map<VarKey, number | null>();
  for (const s of p.streams) {
    m.set(nKey(s.id), s.n);
    p.components.forEach((_, i) => m.set(xKey(s.id, i), s.x[i] ?? null));
  }
  // q and Q only matter where an energy balance uses them
  for (const u of p.units) {
    if (!THERMAL.includes(u.kind)) continue;
    m.set(QKey(u.id), u.Q ?? null);
    m.set(HKey(u.id), u.dHv ?? null);
    for (const s of p.streams) if (s.from === u.id || s.to === u.id) m.set(qKey(s.id), s.q);
  }
  return m;
}

interface Lin {
  coef: Map<VarKey, number>;
  c: number;
}

/** Substitute known values; null if a term still has two unknown factors. */
export function linearize(eq: Equation, known: Map<VarKey, number>): Lin | null {
  const coef = new Map<VarKey, number>();
  let c = eq.k;
  for (const t of eq.terms) {
    let val = t.c;
    const unk: VarKey[] = [];
    for (const f of t.f) {
      const v = known.get(f);
      if (v === undefined) unk.push(f);
      else val *= v;
    }
    if (val === 0) continue;
    if (unk.length === 0) c += val;
    else if (unk.length === 1) coef.set(unk[0]!, (coef.get(unk[0]!) ?? 0) + val);
    else return null;
  }
  for (const [k, v] of coef) if (Math.abs(v) < 1e-12) coef.delete(k);
  return { coef, c };
}

function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  const scale = Math.max(...A.flat().map(Math.abs), 1e-300);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-9 * scale) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}

function* combos<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i < arr.length; i++) yield* combos(arr, k, i + 1, [...acc, arr[i]!]);
}

export function solveBalance(p: BProblem): BalanceResult {
  const eqs = buildEquations(p);
  const given = givenValues(p);
  const known = new Map<VarKey, number>();
  for (const [k, v] of given) if (v !== null && Number.isFinite(v)) known.set(k, v);
  const unknown = () => [...given.keys()].filter((k) => !known.has(k));
  const steps: Step[] = [];
  const warnings: string[] = [];

  const relevant = (e: Equation) => e.terms.some((t) => t.f.some((f) => given.has(f)));
  const pool = eqs.filter(relevant);

  for (let iter = 0; iter < 500 && unknown().length; iter++) {
    const lins = pool
      .map((e) => ({ e, l: linearize(e, known) }))
      .filter((o): o is { e: Equation; l: Lin } => o.l !== null && o.l.coef.size > 0)
      .sort((a, b) => a.e.priority - b.e.priority);

    // 1) one equation, one unknown
    const one = lins.find((o) => o.l.coef.size === 1);
    if (one) {
      const [k, a] = [...one.l.coef][0]!;
      const value = -one.l.c / a;
      steps.push({ how: 'single', eqs: [one.e], known: new Map(known), solved: [{ key: k, value: clean(value) }] });
      known.set(k, clean(value));
      continue;
    }
    // 2) Σx = 1 with all remaining fractions summing to zero → all zero (x ≥ 0)
    const zero = lins.find((o) => o.e.kind === 'sum' && Math.abs(o.l.c) < 1e-9 && [...o.l.coef.values()].every((v) => v > 0));
    if (zero) {
      const solved = [...zero.l.coef.keys()].map((key) => ({ key, value: 0 }));
      steps.push({ how: 'zero', eqs: [zero.e], known: new Map(known), solved });
      for (const s of solved) known.set(s.key, 0);
      continue;
    }
    // 3) smallest square linear systems (2×2, then 3×3)
    let done = false;
    for (const size of [2, 3]) {
      const cand = lins.filter((o) => o.l.coef.size <= size);
      const groups = new Map<string, typeof cand>();
      for (const o of cand) {
        if (o.l.coef.size !== size) continue;
        const key = [...o.l.coef.keys()].sort().join('|');
        if (!groups.has(key)) groups.set(key, cand.filter((c2) => [...c2.l.coef.keys()].every((v) => key.split('|').includes(v))));
      }
      let best: { pick: typeof cand; vars: string[]; sol: number[]; pr: number } | null = null;
      for (const [key, members] of groups) {
        const vars = key.split('|');
        let tried = 0;
        for (const pick of combos(members, size)) {
          if (++tried > 400) break;
          const A = pick.map((o) => vars.map((v) => o.l.coef.get(v) ?? 0));
          const b = pick.map((o) => -o.l.c);
          const sol = solveDense(A, b);
          if (!sol) continue;
          const prSum = pick.reduce((s, o) => s + o.e.priority, 0);
          if (!best || prSum < best.pr) best = { pick, vars, sol, pr: prSum };
          break;
        }
      }
      if (best) {
        const solved = best.vars.map((key, i) => ({ key, value: clean(best!.sol[i]!) }));
        steps.push({ how: 'system', eqs: best.pick.map((o) => o.e), known: new Map(known), solved });
        for (const s of solved) known.set(s.key, s.value);
        done = true;
        break;
      }
    }
    if (!done) break;
  }

  // checks: single-unit balances and stream sums that are now fully known
  const checks: Check[] = [];
  for (const e of pool) {
    if (e.scope.length !== 1 && e.kind !== 'sum') continue;
    const l = linearize(e, known);
    if (!l || l.coef.size) continue;
    const scale = Math.max(1e-9, ...e.terms.map((t) => Math.abs(t.f.reduce((v, f) => v * (known.get(f) ?? 0), t.c))), Math.abs(e.k));
    checks.push({ eq: e, residual: l.c, scale, ok: Math.abs(l.c) <= 1e-6 * scale + 1e-9 });
  }
  if (checks.some((c) => !c.ok)) warnings.push('inconsistent');
  for (const [k, v] of known) {
    if (k.startsWith('n:') && v < -1e-9) warnings.push(`negative:${k}`);
    if (k.startsWith('x:') && (v < -1e-6 || v > 1 + 1e-6)) warnings.push(`range:${k}`);
  }
  return { steps, values: known, missing: unknown(), checks, warnings };
}

/** Round off floating-point noise (1e-12 relative). */
function clean(v: number): number {
  if (!Number.isFinite(v)) return v;
  const r = Number(v.toPrecision(12));
  return Math.abs(r) < 1e-12 ? 0 : r;
}

export type { Term };
