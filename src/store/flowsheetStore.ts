import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import {
  outletSlot,
  type StreamConditions,
  type StreamEdgeData,
  type StreamPayload,
  type UnitNodeData,
  type UnitOperationPayload,
  type UnitParams,
  type UnitType,
} from '@/types/process';

export type UnitNode = Node<UnitNodeData, UnitType>;
export type StreamEdge = Edge<StreamEdgeData, 'stream'>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const TAG_SERIES: Record<UnitType, { prefix: string; base: number; label: string }> = {
  feed: { prefix: 'F', base: 100, label: 'Feed' },
  mixer: { prefix: 'M', base: 200, label: 'Mixer' },
  heater: { prefix: 'E', base: 300, label: 'Heater' },
  distillation: { prefix: 'T', base: 400, label: 'Distillation Column' },
};

const DEFAULT_PARAMS: Record<UnitType, UnitParams> = {
  feed: { theoreticalStages: 0, refluxRatio: 0, heatDuty: 0 },
  mixer: { theoreticalStages: 0, refluxRatio: 0, heatDuty: 0 },
  heater: { theoreticalStages: 0, refluxRatio: 0, heatDuty: 250 },
  distillation: { theoreticalStages: 12, refluxRatio: 2.5, heatDuty: 0, condenserType: 'total' },
};

/** Equimolar saturated-liquid feed at 1 atm (≈ benzene/toluene bubble point). */
export const DEFAULT_FEED: StreamConditions = {
  flowRate: 100,
  temperature: 365.15,
  pressure: 101.325,
  vaporFraction: 1,
  molarFractions: { compA: 0.5, compB: 0.5 },
};

const EMPTY_STREAM: StreamConditions = {
  flowRate: 0,
  temperature: 0,
  pressure: 0,
  vaporFraction: 0,
  molarFractions: { compA: 0, compB: 0 },
};

let idSeq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

function nextTag(type: UnitType, nodes: UnitNode[]): string {
  const { prefix, base } = TAG_SERIES[type];
  const used = new Set(nodes.filter((n) => n.type === type).map((n) => n.data.tag));
  let n = base + 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

function nextStreamTag(edges: StreamEdge[]): string {
  const used = new Set(edges.map((e) => e.data?.tag));
  let n = 1;
  while (used.has(`S-${String(n).padStart(2, '0')}`)) n++;
  return `S-${String(n).padStart(2, '0')}`;
}

function makeUnit(type: UnitType, position: XYPosition, nodes: UnitNode[]): UnitNode {
  return {
    id: uid(type),
    type,
    position,
    data: {
      tag: nextTag(type, nodes),
      label: TAG_SERIES[type].label,
      params: { ...DEFAULT_PARAMS[type] },
      state: {
        topProduct: type === 'feed' ? structuredClone(DEFAULT_FEED) : null,
        bottomProduct: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Propagation — maps every unit's outlet state onto its outgoing streams.
// Phase 3 replaces the identity mapping on non-feed units with the
// thermodynamics engine (unit.solve(inlets) → state), evaluated in
// topological order so downstream nodes react to upstream changes.
// ---------------------------------------------------------------------------

function propagate(nodes: UnitNode[], edges: StreamEdge[]): StreamEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => {
    const src = byId.get(e.source);
    const cond = src?.data.state[outletSlot(e.sourceHandle)] ?? null;
    const tag = e.data?.tag ?? 'S-??';
    const data: StreamEdgeData = cond
      ? { ...structuredClone(cond), tag, resolved: true }
      : { ...EMPTY_STREAM, tag, resolved: false };
    return { ...e, data };
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface FlowsheetState {
  nodes: UnitNode[];
  edges: StreamEdge[];

  onNodesChange: (changes: NodeChange<UnitNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StreamEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (c: Connection | StreamEdge) => boolean;

  addUnit: (type: UnitType, position: XYPosition) => void;
  updateNodeParams: (id: string, params: Partial<UnitParams>) => void;
  updateFeed: (id: string, patch: Partial<StreamConditions>) => void;
  resetDemo: () => void;

  /** Strict-schema serialisers */
  getUnitPayloads: () => UnitOperationPayload[];
  getStreamPayloads: () => StreamPayload[];
}

function demoFlowsheet(): { nodes: UnitNode[]; edges: StreamEdge[] } {
  const nodes: UnitNode[] = [];
  const add = (type: UnitType, x: number, y: number) => {
    const n = makeUnit(type, { x, y }, nodes);
    nodes.push(n);
    return n;
  };
  const f1 = add('feed', 40, 80);
  const f2 = add('feed', 40, 340);
  const m = add('mixer', 360, 210);
  const h = add('heater', 680, 210);
  const t = add('distillation', 1010, 90);

  // second feed: toluene-rich, slightly subcooled
  f2.data.state.topProduct = {
    flowRate: 60,
    temperature: 350.15,
    pressure: 101.325,
    vaporFraction: 1.08,
    molarFractions: { compA: 0.3, compB: 0.7 },
  };

  const edges: StreamEdge[] = [];
  const link = (s: UnitNode, sh: string, tg: UnitNode, th: string) =>
    edges.push({
      id: uid('s'),
      type: 'stream',
      source: s.id,
      sourceHandle: sh,
      target: tg.id,
      targetHandle: th,
      data: { ...EMPTY_STREAM, tag: nextStreamTag(edges), resolved: false },
    });
  link(f1, 'out', m, 'in-1');
  link(f2, 'out', m, 'in-2');
  link(m, 'out', h, 'in');
  link(h, 'out', t, 'feed');

  return { nodes, edges: propagate(nodes, edges) };
}

export const useFlowsheet = create<FlowsheetState>()((set, get) => {
  /** Apply a node mutation and re-propagate streams in one atomic update. */
  const commit = (nodes: UnitNode[], edges = get().edges) =>
    set({ nodes, edges: propagate(nodes, edges) });

  const patchNode = (id: string, fn: (d: UnitNodeData) => UnitNodeData) =>
    commit(get().nodes.map((n) => (n.id === id ? { ...n, data: fn(n.data) } : n)));

  return {
    ...demoFlowsheet(),

    onNodesChange: (changes) => {
      const nodes = applyNodeChanges(changes, get().nodes);
      // removing a node orphans its streams — drop them
      const alive = new Set(nodes.map((n) => n.id));
      const edges = get().edges.filter((e) => alive.has(e.source) && alive.has(e.target));
      commit(nodes, edges);
    },

    onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

    onConnect: (connection) => {
      if (!get().isValidConnection(connection)) return;
      const edges = addEdge<StreamEdge>(
        {
          ...connection,
          id: uid('s'),
          type: 'stream',
          data: { ...EMPTY_STREAM, tag: nextStreamTag(get().edges), resolved: false },
        },
        get().edges,
      );
      commit(get().nodes, edges);
    },

    isValidConnection: (c) => {
      if (c.source === c.target) return false;
      // one stream per port — a pipe can't silently split or merge
      return !get().edges.some(
        (e) =>
          (e.target === c.target && e.targetHandle === c.targetHandle) ||
          (e.source === c.source && e.sourceHandle === c.sourceHandle),
      );
    },

    addUnit: (type, position) => commit([...get().nodes, makeUnit(type, position, get().nodes)]),

    updateNodeParams: (id, params) =>
      patchNode(id, (d) => ({ ...d, params: { ...d.params, ...params } })),

    updateFeed: (id, patch) =>
      patchNode(id, (d) => {
        const cur = d.state.topProduct ?? DEFAULT_FEED;
        const next: StreamConditions = {
          ...cur,
          ...patch,
          molarFractions: { ...cur.molarFractions, ...patch.molarFractions },
        };
        // Summation constraint: Σx = 1 for the binary
        if (patch.molarFractions?.compA !== undefined) {
          next.molarFractions.compB = 1 - patch.molarFractions.compA;
        }
        return { ...d, state: { ...d.state, topProduct: next } };
      }),

    resetDemo: () => set(demoFlowsheet()),

    getUnitPayloads: () =>
      get().nodes.map((n) => ({
        id: n.id,
        type: n.type as UnitType,
        params: n.data.params,
        state: n.data.state,
      })),

    getStreamPayloads: () =>
      get().edges.map((e) => {
        const d = e.data ?? { ...EMPTY_STREAM };
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          flowRate: d.flowRate,
          temperature: d.temperature,
          pressure: d.pressure,
          vaporFraction: d.vaporFraction,
          molarFractions: { ...d.molarFractions },
        };
      }),
  };
});
