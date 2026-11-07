/**
 * Task mode of the flowsheet ("Bilanzaufgabe"): the user draws the process of
 * an exercise, enters what is given, and the balance solver works out the rest
 * step by step. Kept apart from the simulator store so neither schema leaks
 * into the other. Persisted in localStorage (failures are ignored).
 */

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { analyseColumns, type ColumnAnalysis } from '@/engine/balance/columns';
import { thfPressureSwing } from '@/engine/balance/examples';
import { solveBalance } from '@/engine/balance/solver';
import type { BalanceResult, BPort, BProblem, BUnitKind, ColumnSettings } from '@/engine/balance/types';
import { t } from '@/i18n';

export type BNodeData = {
  kind: BUnitKind;
  name: string;
  Q?: number | null;
  dHv?: number | null;
  column?: ColumnSettings;
};
export type BEdgeData = {
  name: string;
  n: number | null;
  x: (number | null)[];
  q: number | null;
};
export type BNode = Node<BNodeData, 'balance'>;
export type BEdge = Edge<BEdgeData, 'bstream'>;

export type FlowsheetMode = 'sim' | 'task';

interface BalanceState {
  mode: FlowsheetMode;
  components: string[];
  nodes: BNode[];
  edges: BEdge[];
  setMode: (m: FlowsheetMode) => void;
  onNodesChange: (c: NodeChange<BNode>[]) => void;
  onEdgesChange: (c: EdgeChange<BEdge>[]) => void;
  onConnect: (c: Connection) => void;
  isValidConnection: (c: Connection | BEdge) => boolean;
  addUnit: (kind: BUnitKind, position: { x: number; y: number }) => void;
  updateUnit: (id: string, patch: Partial<BNodeData>) => void;
  updateColumn: (id: string, patch: Partial<ColumnSettings>) => void;
  updateStream: (id: string, patch: Partial<BEdgeData>) => void;
  setComponentName: (i: number, name: string) => void;
  addComponent: () => void;
  removeComponent: (i: number) => void;
  loadExample: () => void;
  clear: () => void;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const DEFAULT_COLUMN: ColumnSettings = { mt: false, v: 2, condenser: 'total', key: 0, curve: { kind: 'alpha', alpha: 2.5 } };

function example(): Pick<BalanceState, 'components' | 'nodes' | 'edges'> {
  const { problem, pos } = thfPressureSwing();
  return {
    components: problem.components,
    nodes: problem.units.map((u) => ({
      id: u.id,
      type: 'balance',
      position: pos[u.id]!,
      data: { kind: u.kind, name: u.name, Q: u.Q, dHv: u.dHv, column: u.column },
    })),
    edges: problem.streams.map((s) => ({
      id: s.id,
      type: 'bstream',
      source: s.from,
      sourceHandle: s.fromPort,
      target: s.to,
      targetHandle: 'in',
      data: { name: s.name, n: s.n, x: s.x, q: s.q },
    })),
  };
}

const PREFIX: Record<BUnitKind, string> = {
  source: 'Feed',
  sink: 'Product',
  column: 'Column',
  mixer: 'Mixer',
  splitter: 'Splitter',
  exchanger: 'Heat exchanger',
  unit: 'Unit',
};

const freeName = (taken: string[], base: string) => {
  for (let i = 1; ; i++) if (!taken.includes(`${base}${i}`)) return `${base}${i}`;
};

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useBalance = create<BalanceState>()(
  persist(
    (set, get) => ({
      mode: 'sim',
      ...example(),
      setMode: (mode) => set({ mode }),
      onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) }),
      onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
      isValidConnection: (c) => {
        if (c.source === c.target) return false;
        const src = get().nodes.find((n) => n.id === c.source);
        const tgt = get().nodes.find((n) => n.id === c.target);
        if (!src || !tgt) return false;
        if (src.data.kind === 'sink' || tgt.data.kind === 'source') return false;
        return true;
      },
      onConnect: (c) => {
        if (!get().isValidConnection(c)) return;
        const port = (c.sourceHandle ?? 'out') as BPort;
        const names = get().edges.map((e) => e.data?.name ?? '');
        const name = freeName(names, port === 'top' ? 'D' : port === 'bottom' ? 'B' : 'S');
        const edge: BEdge = {
          id: uid('s'),
          type: 'bstream',
          source: c.source,
          sourceHandle: port,
          target: c.target,
          targetHandle: 'in',
          data: { name, n: null, x: get().components.map(() => null), q: null },
        };
        set({ edges: addEdge(edge, get().edges) as BEdge[] });
      },
      addUnit: (kind, position) => {
        const names = get().nodes.map((n) => n.data.name);
        const name = freeName(names, `${t(PREFIX[kind])} `);
        const data: BNodeData = { kind, name };
        if (kind === 'column') data.column = { ...DEFAULT_COLUMN };
        if (kind === 'exchanger') {
          data.Q = null;
          data.dHv = null;
        }
        set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), { id: uid('u'), type: 'balance', position, data, selected: true }] });
      },
      updateUnit: (id, patch) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }),
      updateColumn: (id, patch) =>
        set({
          nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, column: { ...(n.data.column ?? DEFAULT_COLUMN), ...patch } } } : n)),
        }),
      updateStream: (id, patch) => set({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...e.data!, ...patch } } : e)) }),
      setComponentName: (i, name) => set({ components: get().components.map((c, j) => (j === i ? name : c)) }),
      addComponent: () => {
        const comps = [...get().components, freeName(get().components, 'K')];
        set({ components: comps, edges: get().edges.map((e) => ({ ...e, data: { ...e.data!, x: [...e.data!.x, null] } })) });
      },
      removeComponent: (i) => {
        if (get().components.length <= 2) return;
        set({
          components: get().components.filter((_, j) => j !== i),
          edges: get().edges.map((e) => ({ ...e, data: { ...e.data!, x: e.data!.x.filter((_, j) => j !== i) } })),
          nodes: get().nodes.map((n) =>
            n.data.column && n.data.column.key >= get().components.length - 1 ? { ...n, data: { ...n.data, column: { ...n.data.column, key: 0 } } } : n,
          ),
        });
      },
      loadExample: () => set(example()),
      clear: () => set({ nodes: [], edges: [] }),
    }),
    {
      name: 'ts-balance',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        mode: s.mode,
        components: s.components,
        nodes: s.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: s.edges.map(({ id, type, source, sourceHandle, target, targetHandle, data }) => ({ id, type, source, sourceHandle, target, targetHandle, data })),
      }),
    },
  ),
);

export function toProblem(components: string[], nodes: BNode[], edges: BEdge[]): BProblem {
  return {
    components,
    units: nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      name: n.data.name,
      Q: n.data.Q,
      dHv: n.data.dHv,
      column: n.data.column,
      order: Math.round(n.position.x),
    })),
    streams: edges.map((e) => ({
      id: e.id,
      name: e.data?.name ?? e.id,
      from: e.source,
      fromPort: (e.sourceHandle ?? 'out') as BPort,
      to: e.target,
      n: e.data?.n ?? null,
      x: components.map((_, i) => e.data?.x[i] ?? null),
      q: e.data?.q ?? null,
    })),
  };
}

export interface BalanceSolution {
  problem: BProblem;
  result: BalanceResult;
  columns: ColumnAnalysis[];
}

let memo: { key: string; sol: BalanceSolution } | null = null;

/** Solve the current task (memoised on the problem content). */
export function useBalanceSolution(): BalanceSolution {
  const components = useBalance((s) => s.components);
  const nodes = useBalance((s) => s.nodes);
  const edges = useBalance((s) => s.edges);
  return useMemo(() => {
    const problem = toProblem(components, nodes, edges);
    const key = JSON.stringify(problem);
    if (memo?.key === key) return memo.sol;
    const result = solveBalance(problem);
    const sol = { problem, result, columns: analyseColumns(problem, result.values) };
    memo = { key, sol };
    return sol;
  }, [components, nodes, edges]);
}
