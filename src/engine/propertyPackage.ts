/**
 * Property packages for the flowsheet: which two components can be combined,
 * and with which liquid model.
 *
 *   ideal   — Raoult's law, for chemically similar hydrocarbons (and methanol/ethanol)
 *   wilson  — modified Raoult's law with Wilson activity coefficients,
 *             Λ fitted to the literature azeotrope (ethanol/water, acetone/methanol,
 *             benzene/cyclohexane) or to tabulated VLE (methanol/water, Perry's)
 *   refused — liquids that split into two phases (water + hydrocarbons) or pairs
 *             without validated parameters; the reason is shown to the user.
 */

import { COMPONENTS, type BinarySystem, type ComponentId } from './components';
import { brent } from './numerics';
import { fitWilsonToAzeotrope } from './ternary/model';
import type { Comps } from './thermodynamics';
import { ETHANOL_WATER } from './data/ethanolWater';
import { METHANOL_WATER } from './data/methanolWater';

type PairModel =
  | { kind: 'ideal'; note: string }
  | { kind: 'wilson'; first: ComponentId; fit: { azeotrope: { x1: number; T: number } } | { data: [number, number, number][] }; note: string }
  | { kind: 'refused'; reason: string };

const key = (a: ComponentId, b: ComponentId) => [a, b].sort().join('|');

const HC: ComponentId[] = ['benzene', 'toluene', 'n-hexane', 'n-heptane', 'cyclohexane', 'p-xylene'];
const IDEAL_PAIRS: [ComponentId, ComponentId][] = [
  ['benzene', 'toluene'],
  ['benzene', 'p-xylene'],
  ['toluene', 'p-xylene'],
  ['n-hexane', 'n-heptane'],
  ['n-hexane', 'cyclohexane'],
  ['cyclohexane', 'n-heptane'],
  ['cyclohexane', 'toluene'],
  ['n-hexane', 'toluene'],
  ['n-heptane', 'p-xylene'],
  ['methanol', 'ethanol'],
];

const PAIRS = new Map<string, PairModel>();
for (const [a, b] of IDEAL_PAIRS) PAIRS.set(key(a, b), { kind: 'ideal', note: "Ideal mixture — Raoult's law." });
PAIRS.set(key('ethanol', 'water'), {
  kind: 'wilson',
  first: 'ethanol',
  fit: { data: ETHANOL_WATER },
  note: "Wilson, fitted to Perry's ethanol/water VLE at 1 atm (azeotrope x ≈ 0.89).",
});
PAIRS.set(key('acetone', 'methanol'), {
  kind: 'wilson',
  first: 'acetone',
  fit: { azeotrope: { x1: 0.802, T: 55.5 } },
  note: 'Wilson, fitted to the acetone/methanol azeotrope (x = 0.802, 55.5 °C).',
});
PAIRS.set(key('benzene', 'cyclohexane'), {
  kind: 'wilson',
  first: 'benzene',
  fit: { azeotrope: { x1: 0.55, T: 77.6 } },
  note: 'Wilson, fitted to the benzene/cyclohexane azeotrope (x ≈ 0.55, 77.6 °C).',
});
PAIRS.set(key('methanol', 'water'), {
  kind: 'wilson',
  first: 'methanol',
  fit: { data: METHANOL_WATER },
  note: "Wilson, fitted to Perry's methanol/water VLE at 1 atm.",
});

export function pairModel(a: ComponentId, b: ComponentId): PairModel {
  if (a === b) return { kind: 'refused', reason: 'Choose two different components.' };
  const hit = PAIRS.get(key(a, b));
  if (hit) return hit;
  const water = a === 'water' || b === 'water';
  const other = a === 'water' ? b : a;
  if (water && HC.includes(other)) {
    return { kind: 'refused', reason: `Water and ${COMPONENTS[other].name} hardly dissolve in each other — two liquid phases (a heterogeneous azeotrope). Use the Extraction module.` };
  }
  return { kind: 'refused', reason: `${COMPONENTS[a].name} / ${COMPONENTS[b].name} is strongly non-ideal (azeotrope or liquid split) and has no validated parameters in this package yet.` };
}

// ---------------------------------------------------------------------------
// Wilson
// ---------------------------------------------------------------------------

/** Binary Wilson ln γ for (Λ12, Λ21) at x1. */
export function wilsonLnGamma(L12: number, L21: number, x1: number): [number, number] {
  const x2 = 1 - x1;
  const a = x1 + L12 * x2;
  const b = x2 + L21 * x1;
  const t = L12 / a - L21 / b;
  return [-Math.log(a) + x2 * t, -Math.log(b) - x1 * t];
}

const MMHG_TO_BAR = 0.00133322368;
const psatBar = (c: ComponentId, Tc: number) => MMHG_TO_BAR * 10 ** (COMPONENTS[c].antoine.A - COMPONENTS[c].antoine.B / (COMPONENTS[c].antoine.C + Tc));

/** Least-squares Wilson fit to isobaric x–y data (first component = x). */
function fitWilsonToData(c1: ComponentId, c2: ComponentId, rows: [number, number, number][], P = 1.01325): [number, number] {
  const pts = rows.filter((r) => r[0] > 0 && r[0] < 1);
  const sse = (u: number[]) => {
    const L12 = Math.exp(u[0]!);
    const L21 = Math.exp(u[1]!);
    let s = 0;
    for (const [x, y] of pts) {
      const [g1, g2] = wilsonLnGamma(L12, L21, x).map(Math.exp) as [number, number];
      const f = (T: number) => x * g1 * psatBar(c1, T) + (1 - x) * g2 * psatBar(c2, T) - P;
      let T: number;
      try {
        T = brent(f, 0, 160, { tol: 1e-9 });
      } catch {
        return Infinity;
      }
      s += ((x * g1 * psatBar(c1, T)) / P - y) ** 2;
    }
    return s;
  };
  // coarse grid, then Nelder–Mead
  let best = [0, 0];
  let bv = Infinity;
  for (let a = -3; a <= 2; a += 0.25)
    for (let b = -3; b <= 2; b += 0.25) {
      const v = sse([a, b]);
      if (v < bv) {
        bv = v;
        best = [a, b];
      }
    }
  let simplex = [best, [best[0]! + 0.2, best[1]!], [best[0]!, best[1]! + 0.2]].map((p) => ({ p, v: sse(p) }));
  for (let it = 0; it < 300; it++) {
    simplex.sort((u, w) => u.v - w.v);
    const [b0, b1, w] = simplex as [{ p: number[]; v: number }, { p: number[]; v: number }, { p: number[]; v: number }];
    const c = [(b0.p[0]! + b1.p[0]!) / 2, (b0.p[1]! + b1.p[1]!) / 2];
    const r = [2 * c[0]! - w.p[0]!, 2 * c[1]! - w.p[1]!];
    const vr = sse(r);
    if (vr < b0.v) {
      const e = [3 * c[0]! - 2 * w.p[0]!, 3 * c[1]! - 2 * w.p[1]!];
      const ve = sse(e);
      simplex = [b0, b1, ve < vr ? { p: e, v: ve } : { p: r, v: vr }];
    } else if (vr < b1.v) simplex = [b0, b1, { p: r, v: vr }];
    else {
      const k = [(c[0]! + w.p[0]!) / 2, (c[1]! + w.p[1]!) / 2];
      const vk = sse(k);
      if (vk < w.v) simplex = [b0, b1, { p: k, v: vk }];
      else simplex = simplex.map((q, i) => (i === 0 ? q : { p: [(q.p[0]! + b0.p[0]!) / 2, (q.p[1]! + b0.p[1]!) / 2], v: sse([(q.p[0]! + b0.p[0]!) / 2, (q.p[1]! + b0.p[1]!) / 2]) }));
    }
    if (Math.abs(simplex[2]!.v - simplex[0]!.v) < 1e-14) break;
  }
  simplex.sort((u, w) => u.v - w.v);
  return [Math.exp(simplex[0]!.p[0]!), Math.exp(simplex[0]!.p[1]!)];
}

const lambdaCache = new Map<string, [number, number]>();

/** Fitted Wilson Λ for the pair, oriented as (Λ_first,second, Λ_second,first). */
function wilsonFor(m: Extract<PairModel, { kind: 'wilson' }>, a: ComponentId, b: ComponentId): [number, number] {
  const second = m.first === a ? b : a;
  const k = key(a, b);
  let L = lambdaCache.get(k);
  if (!L) {
    L =
      'azeotrope' in m.fit
        ? fitWilsonToAzeotrope(COMPONENTS[m.first].antoine, COMPONENTS[second].antoine, m.fit.azeotrope.x1, m.fit.azeotrope.T)
        : fitWilsonToData(m.first, second, m.fit.data);
    lambdaCache.set(k, L);
  }
  return L;
}

/** Order a pair so that A is the more volatile (lower normal boiling point). */
export const orderPair = (a: ComponentId, b: ComponentId): BinarySystem => (COMPONENTS[a].Tb <= COMPONENTS[b].Tb ? { A: a, B: b } : { A: b, B: a });

/** The property package (components + activity model) for a binary system. */
export function binaryPackage(sys: BinarySystem): Comps {
  const comps = [COMPONENTS[sys.A], COMPONENTS[sys.B]] as PureComponentPair;
  const m = pairModel(sys.A, sys.B);
  if (m.kind !== 'wilson') return comps;
  const [Lf, Ls] = wilsonFor(m, sys.A, sys.B);
  // orient Λ to (A, B)
  const [L12, L21] = m.first === sys.A ? [Lf, Ls] : [Ls, Lf];
  return Object.assign(comps, { gamma: (x: readonly number[]) => wilsonLnGamma(L12, L21, x[0]!).map(Math.exp) });
}
type PureComponentPair = (typeof COMPONENTS)[ComponentId][];

export const PACKAGE_COMPONENTS: ComponentId[] = ['water', 'methanol', 'ethanol', 'acetone', 'benzene', 'toluene', 'p-xylene', 'n-hexane', 'n-heptane', 'cyclohexane'];

export function packageNote(sys: BinarySystem): string {
  const m = pairModel(sys.A, sys.B);
  return m.kind === 'refused' ? m.reason : m.note;
}
