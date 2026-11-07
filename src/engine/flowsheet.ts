/**
 * Sequential-modular flowsheet solver.
 *
 * Units are evaluated in topological order (Kahn's algorithm), so every unit
 * sees fully solved inlet streams and every downstream node reacts to an
 * upstream change in a single pass. Recycle loops are detected and reported
 * (tear-stream convergence is out of scope for now).
 */

import {
  isBlock,
  outletSlot,
  type BlockType,
  type BatchResults,
  type ColumnResults,
  type Diagnostics,
  type StreamConditions,
  type UnitNodeData,
  type UnitState,
  type UnitType,
} from '@/types/process';
import { DEFAULT_SYSTEM, type BinarySystem } from './components';
import { batchAt, simulateBatch } from './batch';
import { BLOCKS } from './blocks';
import { brent } from './numerics';
import { rateColumn } from './mccabeThiele';
import { alphaSystem } from './vle/systems';
import {
  averageRelativeVolatility,
  binaryComponents,
  binaryEquilibrium,
  type Comps,
  bubbleTemperature,
  dewTemperature,
  enthalpyTP,
  evaluateStream,
  flashTP,
  fromPH,
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
  batch?: BatchResults | null;
  block?: { rows: [string, string, string][] } | null;
  extra?: [string, string, string][] | null;
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

/**
 * Flash drum: heat the inlet by Q (kW) and let it down to the drum pressure
 * (PH flash), then split into saturated vapour (top) and liquid (bottom).
 */
function solveFlash(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const P = data.params.flashPressure ?? inlet.pressure;
  const out = heatStream(comps, toMaterial(inlet), data.params.heatDuty, inlet.pressure - P);
  const V = out.F * out.beta;
  const warnings = validityWarnings(comps, out.T);
  if (out.phase !== 'two-phase') warnings.push(out.phase === 'liquid' ? 'Single phase: all liquid — raise Q or lower P.' : 'Single phase: all vapour — lower Q or raise P.');
  return {
    state: {
      topProduct: { flowRate: V, temperature: out.T, pressure: P, vaporFraction: 0, molarFractions: toBinary(out.y) },
      bottomProduct: { flowRate: out.F - V, temperature: out.T, pressure: P, vaporFraction: 1, molarFractions: toBinary(out.x) },
    },
    diag: withWarnings(warnings),
    column: null,
  };
}

const molarMass = (comps: Comps, z: number[]) => comps.reduce((m, c, i) => m + c.mw * (z[i] ?? 0), 0);
/** liquid molar volume, m³/kmol: (kg/kmol) / (kg/m³) */
const molarVolumeL = (comps: Comps, z: number[]) => comps.reduce((v, c, i) => v + ((z[i] ?? 0) * c.mw) / c.rhoL, 0);

/** Cooler / condenser: the heater balance with (usually) negative duty. */
function solveCooler(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const sol = solveHeater(comps, data, inlet);
  return { ...sol, extra: [['Duty removed', (-data.params.heatDuty).toFixed(0), 'kW']] };
}

/**
 * Pump: raises the pressure of a liquid. Shaft work W = V̇·Δp/η goes into the
 * liquid's enthalpy (PH flash at the outlet pressure).
 */
function solvePump(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const Pout = data.params.outletPressure ?? inlet.pressure + 200;
  const eta = data.params.efficiency ?? 0.7;
  const z = toVector(inlet.molarFractions);
  const Vdot = (inlet.flowRate * molarVolumeL(comps, z)) / 3600; // m³/s
  const dP = (Pout - inlet.pressure) * 1000; // Pa
  const W = (Vdot * dP) / eta / 1000; // kW
  const Hin = enthalpyTP(comps, z, inlet.temperature, inlet.pressure);
  const out = fromPH(comps, inlet.flowRate, z, Pout, Hin + (3600 * W) / inlet.flowRate);
  const warnings = validityWarnings(comps, out.T);
  if (inlet.vaporFraction < 1 - 1e-6) warnings.push('Vapour at the pump suction — cavitation risk (cool the feed or raise the suction pressure).');
  if (Pout < inlet.pressure) warnings.push('Outlet pressure below inlet — use a valve to let down.');
  return {
    state: { topProduct: toConditions(out), bottomProduct: null },
    diag: withWarnings(warnings),
    column: null,
    extra: [
      ['Shaft power', W.toFixed(2), 'kW'],
      ['Volume flow', (Vdot * 3600).toFixed(2), 'm³/h'],
      ['Head Δp', (Pout - inlet.pressure).toFixed(0), 'kPa'],
    ],
  };
}

/** Valve: isenthalpic let-down to the outlet pressure — a liquid near its bubble point flashes. */
function solveValve(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const Pout = Math.min(data.params.outletPressure ?? inlet.pressure / 2, inlet.pressure);
  const z = toVector(inlet.molarFractions);
  const Hin = enthalpyTP(comps, z, inlet.temperature, inlet.pressure);
  const out = fromPH(comps, inlet.flowRate, z, Pout, Hin);
  return {
    state: { topProduct: toConditions(out), bottomProduct: null },
    diag: withWarnings(validityWarnings(comps, out.T)),
    column: null,
    extra: [
      ['Pressure drop', (inlet.pressure - Pout).toFixed(1), 'kPa'],
      ['Flashed V/F', out.beta.toFixed(3), ''],
    ],
  };
}

/** Splitter: one stream into two of identical conditions. */
function solveSplitter(data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const fr = Math.min(1, Math.max(0, data.params.splitFraction ?? 0.5));
  return {
    state: {
      topProduct: { ...inlet, flowRate: inlet.flowRate * fr },
      bottomProduct: { ...inlet, flowRate: inlet.flowRate * (1 - fr) },
    },
    diag: withWarnings([]),
    column: null,
  };
}

/**
 * Evaporator (single stage): vaporize a set fraction V/F of the feed at the
 * drum pressure; the required heat duty is the result.
 */
function solveEvaporatorUnit(comps: Comps, data: UnitNodeData, inlet: StreamConditions): UnitSolution {
  const P = data.params.flashPressure ?? inlet.pressure;
  const beta = Math.min(0.999, Math.max(0.001, data.params.targetVF ?? 0.5));
  const z = toVector(inlet.molarFractions);
  const Tb = bubbleTemperature(comps, z, P).T;
  const Td = dewTemperature(comps, z, P).T;
  const T = brent((t) => flashTP(comps, z, t, P).beta - beta, Tb + 1e-9, Td - 1e-9, { tol: 1e-10 });
  const f = flashTP(comps, z, T, P);
  const Hout = (1 - f.beta) * liquidEnthalpy(comps, f.x, T) + f.beta * vaporEnthalpy(comps, f.y, T);
  const Hin = enthalpyTP(comps, z, inlet.temperature, inlet.pressure);
  const Q = (inlet.flowRate * (Hout - Hin)) / 3600;
  const V = inlet.flowRate * f.beta;
  return {
    state: {
      topProduct: { flowRate: V, temperature: T, pressure: P, vaporFraction: 0, molarFractions: toBinary(f.y) },
      bottomProduct: { flowRate: inlet.flowRate - V, temperature: T, pressure: P, vaporFraction: 1, molarFractions: toBinary(f.x) },
    },
    diag: withWarnings(validityWarnings(comps, T)),
    column: null,
    extra: [
      ['Heat duty', Q.toFixed(1), 'kW'],
      ['Temperature', (T - 273.15).toFixed(1), '°C'],
      ['Vapour', V.toFixed(2), 'kmol/h'],
      ['Vapour mass', ((V * molarMass(comps, f.y)) / 1000).toFixed(3), 't/h'],
    ],
  };
}

/** Process block: self-contained, solved with its own specification. */
function solveBlock(type: BlockType, data: UnitNodeData): UnitSolution {
  const def = BLOCKS[type];
  const r = def.solve({ ...def.defaults, ...(data.params.block ?? {}) });
  return {
    state: { topProduct: null, bottomProduct: null },
    diag: r.ok ? { status: 'ok', messages: [] } : { status: 'error', messages: [r.error ?? 'No solution'] },
    column: null,
    block: { rows: r.rows },
  };
}

/** Equilibrium curve per (package, pressure), cached — the grid costs a few hundred bubble points. */
const eqCache = new Map<string, ReturnType<typeof binaryEquilibrium>>();
function equilibriumFor(comps: Comps, P: number) {
  const k = `${comps.map((c) => c.id).join('|')}@${P.toFixed(3)}`;
  let e = eqCache.get(k);
  if (!e) {
    if (eqCache.size > 64) eqCache.clear();
    e = binaryEquilibrium(comps, P);
    eqCache.set(k, e);
  }
  return e;
}

/** Relative volatility at a composition, from the package. */
function alphaAt(comps: Comps, x: number, P: number) {
  const y = bubbleTemperature(comps, [x, 1 - x], P).y[0]!;
  return (y / x) / ((1 - y) / (1 - x));
}

function solveColumn(comps: Comps, data: UnitNodeData, feed: StreamConditions): UnitSolution {
  const [light, heavy] = comps as unknown as [Comps[number], Comps[number]];
  const P = feed.pressure;
  const zF = feed.molarFractions.compA;
  const q = feed.vaporFraction;
  const partial = (data.params.condenserType ?? 'total') === 'partial';
  // ideal packages keep the constant-α construction; activity models use the real curve
  const eq = comps.gamma ? equilibriumFor(comps, P) : undefined;
  const alpha = eq ? alphaAt(comps, Math.min(Math.max(zF, 1e-3), 1 - 1e-3), P) : averageRelativeVolatility(light, heavy, P);

  const mt = rateColumn({
    eq,
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
      // the equilibrium curve the stages were stepped on (for the McCabe–Thiele chart)
      curve: eq
        ? { x: eq.grid.x.filter((_, i) => i % 4 === 0), y: eq.grid.y.filter((_, i) => i % 4 === 0) }
        : null,
    },
  };
}

/**
 * Batch still with an optional column on top. The inlet is the charge (its
 * flow is read as kmol per batch cycle); the outlets are the receiver contents
 * (distillate) and the pot residue at the chosen cut D/L₀, at their bubble points.
 */
function solveBatchStill(comps: Comps, data: UnitNodeData, charge: StreamConditions): UnitSolution {
  const [light, heavy] = comps as unknown as [Comps[number], Comps[number]];
  const P = charge.pressure;
  const eq = comps.gamma ? equilibriumFor(comps, P) : undefined;
  const alpha = eq ? alphaAt(comps, Math.min(Math.max(charge.molarFractions.compA, 1e-3), 1 - 1e-3), P) : averageRelativeVolatility(light, heavy, P);
  const mode = data.params.batchMode ?? 'constant-reflux';
  const sim = simulateBatch({
    y: eq ? eq.y : alphaSystem(alpha).y,
    xMax: eq?.xMax,
    x0: charge.molarFractions.compA,
    mode,
    N: data.params.theoreticalStages,
    v: data.params.refluxRatio,
  });
  if (!sim.ok) throw new Error(sim.error ?? 'Batch simulation failed');
  const dEnd = sim.points.at(-1)!.d;
  const cut = Math.min(data.params.distilledFraction ?? 0.5, dEnd - 1e-6);
  const p = batchAt(sim.points, cut, mode);
  const xD = [p.xDavg, 1 - p.xDavg];
  const xW = [p.xW, 1 - p.xW];
  const warnings: string[] = [];
  if ((data.params.distilledFraction ?? 0.5) > dEnd) warnings.push(`Cut limited to D/L₀ = ${dEnd.toFixed(3)}.`);
  return {
    state: {
      topProduct: {
        flowRate: charge.flowRate * cut,
        temperature: bubbleTemperature(comps, xD, P).T,
        pressure: P,
        vaporFraction: 1,
        molarFractions: toBinary(xD),
      },
      bottomProduct: {
        flowRate: charge.flowRate * (1 - cut),
        temperature: bubbleTemperature(comps, xW, P).T,
        pressure: P,
        vaporFraction: 1,
        molarFractions: toBinary(xW),
      },
    },
    diag: withWarnings(warnings),
    column: null,
    batch: { alpha, xW: p.xW, xDavg: p.xDavg, recovery: p.recovery, boilup: p.boilup * charge.flowRate, dEnd },
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
      } else if (isBlock(type)) {
        sol = solveBlock(type, node.data);
      } else if (inEdges.length === 0) {
        sol = idle('No inlet stream connected');
      } else if (inlets.some((s) => s === null)) {
        sol = idle('Waiting for upstream units');
      } else {
        const ins = inlets as StreamConditions[];
        if (type === 'mixer') sol = solveMixer(comps, ins);
        else if (type === 'heater') sol = solveHeater(comps, node.data, ins[0]!);
        else if (type === 'batch') sol = solveBatchStill(comps, node.data, ins[0]!);
        else if (type === 'flash') sol = solveFlash(comps, node.data, ins[0]!);
        else if (type === 'cooler') sol = solveCooler(comps, node.data, ins[0]!);
        else if (type === 'pump') sol = solvePump(comps, node.data, ins[0]!);
        else if (type === 'valve') sol = solveValve(comps, node.data, ins[0]!);
        else if (type === 'splitter') sol = solveSplitter(node.data, ins[0]!);
        else if (type === 'evaporator') sol = solveEvaporatorUnit(comps, node.data, ins[0]!);
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
