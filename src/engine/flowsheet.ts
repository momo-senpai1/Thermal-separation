/**
 * Sequential-modular flowsheet solver.
 *
 * Units are evaluated in topological order (Kahn's algorithm), so every unit
 * sees fully solved inlet streams and every downstream node reacts to an
 * upstream change in a single pass. Recycle loops are detected and reported
 * (tear-stream convergence is out of scope for now).
 */

import {
  outletSlot,
  type ColumnResults,
  type Diagnostics,
  type StreamConditions,
  type UnitNodeData,
  type UnitState,
  type UnitType,
} from '@/types/process';
import { DEFAULT_SYSTEM, type BinarySystem } from './components';
import { rateColumn } from './mccabeThiele';
import {
  averageRelativeVolatility,
  binaryComponents,
  bubbleTemperature,
  dewTemperature,
  enthalpyTP,
  evaluateStream,
  heatStream,
  liquidEnthalpy,
  mixStreams,
  stateFromThermalCondition,
  toBinary,
  toVector,
  validityWarnings,
  vaporEnthalpy,
  type MaterialStream,
  type StreamState,
} from './thermodynamics';

export interface SolverNode {
  id: string;
  type?: string;
  data: UnitNodeData;
}

export interface SolverEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface UnitSolution {
  state: UnitState;
  diag: Diagnostics;
  column: ColumnResults | null;
}

export interface FlowsheetSolution {
  units: Map<string, UnitSolution>;
  /** null = stream not resolvable (upstream idle / error) */
  streams: Map<string, StreamConditions | null>;
  elapsedMs: number;
}

const toMaterial = (s: StreamConditions): MaterialStream => ({
  F: s.flowRate,
  T: s.temperature,
  P: s.pressure,
  z: toVector(s.molarFractions),
});

const toConditions = (s: StreamState): StreamConditions => ({
  flowRate: s.F,
  temperature: s.T,
  pressure: s.P,
  vaporFraction: s.q,
  molarFractions: toBinary(s.z),
});

const idle = (message: string): UnitSolution => ({
  state: { topProduct: null, bottomProduct: null },
  diag: { status: 'idle', messages: [message] },
  column: null,
});

const withWarnings = (messages: string[]): Diagnostics => ({
  status: messages.length ? 'warning' : 'ok',
  messages,
});

// ---------------------------------------------------------------------------
// Unit models
// ---------------------------------------------------------------------------

type Comps = ReturnType<typeof binaryComponents>;

function solveFeed(comps: Comps, data: UnitNodeData): UnitSolution {
  const spec = data.state.topProduct;
  if (!spec) return idle('Feed has no specification');
  const z = toVector(spec.molarFractions);
  let out: StreamConditions;
  if ((data.params.feedSpec ?? 'T') === 'q') {
    const f = stateFromThermalCondition(comps, z, spec.pressure, spec.vaporFraction);
    out = { ...spec, temperature: f.T };
  } else {
    const s = evaluateStream(comps, toMaterial(spec));
    out = { ...spec, vaporFraction: s.q };
  }
  return {
    state: { topProduct: out, bottomProduct: null },
    diag: withWarnings(validityWarnings(comps, out.temperature)),
    column: null,
  };
}

function solveMixer(comps: Comps, inlets: StreamConditions[]): UnitSolution {
  const out = mixStreams(comps, inlets.map(toMaterial));
  return {
    state: { topProduct: toConditions(out), bottomProduct: null },
    diag: withWarnings(validityWarnings(comps, out.T)),
    column: null,
  };
}

function solveHeater(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const out = heatStream(comps, toMaterial(inlet), data.params.heatDuty);
  return {
    state: { topProduct: toConditions(out), bottomProduct: null },
    diag: withWarnings(validityWarnings(comps, out.T)),
    column: null,
  };
}

function solveColumn(comps: Comps, data: UnitNodeData, feed: StreamConditions): UnitSolution {
  const [light, heavy] = comps as [Comps[number], Comps[number]];
  const P = feed.pressure;
  const zF = feed.molarFractions.compA;
  const q = feed.vaporFraction;
  const partial = (data.params.condenserType ?? 'total') === 'partial';
  const alpha = averageRelativeVolatility(light, heavy, P);

  const mt = rateColumn({
    alpha,
    F: feed.flowRate,
    zF,
    q,
    N: data.params.theoreticalStages,
    R: data.params.refluxRatio,
    DF: data.params.distillateToFeed ?? 0.5,
    condenser: partial ? 'partial' : 'total',
  });

  const xDv = [mt.xD, 1 - mt.xD];
  const xBv = [mt.xB, 1 - mt.xB];
  // distillate: saturated liquid (total) or saturated vapour (partial); bottoms: saturated liquid
  const TD = partial ? dewTemperature(comps, xDv, P).T : bubbleTemperature(comps, xDv, P).T;
  const TB = bubbleTemperature(comps, xBv, P).T;

  // Energy balance around condenser and whole column (CMO flows, rigorous enthalpies)
  const yTop = [mt.yTop, 1 - mt.yTop];
  const xRef = [mt.xReflux, 1 - mt.xReflux];
  const hV1 = vaporEnthalpy(comps, yTop, dewTemperature(comps, yTop, P).T);
  const hReflux = liquidEnthalpy(comps, xRef, bubbleTemperature(comps, xRef, P).T);
  const hD = partial ? vaporEnthalpy(comps, xDv, TD) : liquidEnthalpy(comps, xDv, TD);
  const hB = liquidEnthalpy(comps, xBv, TB);
  const hF = enthalpyTP(comps, toVector(feed.molarFractions), feed.temperature, P);
  const Qc = (mt.L * hReflux + mt.D * hD - mt.V * hV1) / 3600;
  const Qr = (mt.D * hD + mt.B * hB - feed.flowRate * hF) / 3600 - Qc;

  const distillate: StreamConditions = {
    flowRate: mt.D,
    temperature: TD,
    pressure: P,
    vaporFraction: partial ? 0 : 1,
    molarFractions: toBinary(xDv),
  };
  const bottoms: StreamConditions = {
    flowRate: mt.B,
    temperature: TB,
    pressure: P,
    vaporFraction: 1,
    molarFractions: toBinary(xBv),
  };

  const warnings = [...new Set([...validityWarnings(comps, TD), ...validityWarnings(comps, TB)])];
  if (mt.feedStage <= 1 || mt.feedStage >= data.params.theoreticalStages) {
    warnings.push(`Optimal feed stage is at the column end (stage ${mt.feedStage}) — check D/F and R.`);
  }

  return {
    state: { topProduct: distillate, bottomProduct: bottoms },
    diag: withWarnings(warnings),
    column: {
      alpha,
      D: mt.D,
      B: mt.B,
      xD: mt.xD,
      xB: mt.xB,
      feedStage: mt.feedStage,
      Rmin: mt.Rmin,
      Nmin: mt.Nmin,
      Qc,
      Qr,
      zF,
      q,
      steps: mt.steps,
      rectifying: mt.rectifying,
      stripping: mt.stripping,
      intersection: mt.intersection,
      pinch: mt.pinch,
    },
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function topologicalOrder(nodes: SolverNode[], edges: SolverEdge[]): { order: string[]; cyclic: Set<string> } {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    out.get(e.source)!.push(e.target);
  }
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of out.get(id) ?? []) {
      indeg.set(t, (indeg.get(t) ?? 0) - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  const done = new Set(order);
  return { order, cyclic: new Set(nodes.filter((n) => !done.has(n.id)).map((n) => n.id)) };
}

export function solveFlowsheet(
  nodes: SolverNode[],
  edges: SolverEdge[],
  system: BinarySystem = DEFAULT_SYSTEM,
): FlowsheetSolution {
  const t0 = performance.now();
  const comps = binaryComponents(system);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const units = new Map<string, UnitSolution>();
  const streams = new Map<string, StreamConditions | null>();
  const { order, cyclic } = topologicalOrder(nodes, edges);

  const streamOf = (e: SolverEdge): StreamConditions | null =>
    units.get(e.source)?.state[outletSlot(e.sourceHandle)] ?? null;

  for (const id of order) {
    const node = byId.get(id)!;
    const type = node.type as UnitType;
    const inEdges = edges.filter((e) => e.target === id);
    const inlets = inEdges.map(streamOf);

    let sol: UnitSolution;
    try {
      if (type === 'feed') {
        sol = solveFeed(comps, node.data);
      } else if (inEdges.length === 0) {
        sol = idle('No inlet stream connected');
      } else if (inlets.some((s) => s === null)) {
        sol = idle('Waiting for upstream units');
      } else {
        const ins = inlets as StreamConditions[];
        if (type === 'mixer') sol = solveMixer(comps, ins);
        else if (type === 'heater') sol = solveHeater(comps, node.data, ins[0]!);
        else sol = solveColumn(comps, node.data, ins[0]!);
      }
    } catch (err) {
      sol = {
        state: { topProduct: null, bottomProduct: null },
        diag: { status: 'error', messages: [err instanceof Error ? err.message : String(err)] },
        column: null,
      };
    }
    units.set(id, sol);
  }

  for (const id of cyclic) {
    units.set(id, {
      state: { topProduct: null, bottomProduct: null },
      diag: { status: 'error', messages: ['Recycle loop detected — recycles are not supported yet'] },
      column: null,
    });
  }

  for (const e of edges) streams.set(e.id, streamOf(e));

  return { units, streams, elapsedMs: performance.now() - t0 };
}
