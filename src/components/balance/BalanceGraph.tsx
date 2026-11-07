/** Canvas pieces for task mode: unit node, stream edge, canvas. */

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { nKey, xKey } from '@/engine/balance/solver';
import type { BUnitKind } from '@/engine/balance/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useBalance, useBalanceSolution, type BEdge, type BNode } from '@/store/balanceStore';
import { num } from './texFormat';

export const BALANCE_DND = 'application/x-balance-unit';

export const KIND_ICON: Record<BUnitKind, JSX.Element> = {
  source: <path d="M3 6h11l6 6-6 6H3z" />,
  sink: <path d="M4 6h11l6 6-6 6H4zM9 12h6" />,
  column: (
    <>
      <rect x="8" y="2" width="8" height="20" rx="4" />
      <path d="M8 8h5M16 12h-5M8 16h5" />
    </>
  ),
  mixer: <path d="M3 5l9 7-9 7M12 12h9" />,
  splitter: <path d="M2 12h9l9-7M11 12l9 7" />,
  exchanger: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h3l2-4 3 8 3-8 2 4h3" />
    </>
  ),
  unit: <rect x="4" y="5" width="16" height="14" rx="2" />,
};

const KIND_LABEL: Record<BUnitKind, string> = {
  source: 'Feed',
  sink: 'Product',
  column: 'Column',
  mixer: 'Mixer',
  splitter: 'Splitter',
  exchanger: 'Heat exchanger',
  unit: 'Apparatus (black box)',
};
export const kindLabel = (k: BUnitKind) => t(KIND_LABEL[k]);

function BalanceNodeView({ id, data, selected }: NodeProps<BNode>) {
  const { columns } = useBalanceSolution();
  const col = columns.find((c) => c.unitId === id);
  const k = data.kind;
  const tall = k === 'column';
  return (
    <div
      className={cn(
        'glass relative flex min-w-[130px] flex-col items-center gap-1 px-3 py-2 text-center transition-shadow',
        tall && 'min-h-[150px] justify-center',
        selected && 'shadow-glow',
      )}
    >
      <svg viewBox="0 0 24 24" className={cn('fill-none stroke-signal-liquid stroke-[1.4]', tall ? 'h-12 w-12' : 'h-7 w-7')} aria-hidden>
        {KIND_ICON[k]}
      </svg>
      <span className="max-w-[150px] text-[11px] font-medium leading-tight text-plant-100">{data.name}</span>
      <span className="tag text-[8px] text-plant-500">{kindLabel(k)}</span>
      {k === 'column' && data.column?.mt && (
        <span className="font-mono text-[10px] text-signal-liquid">
          {col?.result?.ok ? `N = ${num(col.result.N, 2)}` : 'N = ?'} · v = {num(data.column.v, 2)}
        </span>
      )}
      {k === 'exchanger' && (
        <span className="font-mono text-[10px] text-signal-heat">Q̇ = {data.Q === null || data.Q === undefined ? '?' : `${num(data.Q, 0)} kJ/h`}</span>
      )}
      {k !== 'source' && <Handle type="target" position={Position.Left} id="in" />}
      {k === 'column' ? (
        <>
          <Handle type="source" position={Position.Right} id="top" style={{ top: '18%' }} />
          <Handle type="source" position={Position.Right} id="bottom" style={{ top: '82%' }} />
          <span className="pointer-events-none absolute right-2 top-[11%] font-mono text-[8px] text-plant-500">{t('top')}</span>
          <span className="pointer-events-none absolute bottom-[11%] right-2 font-mono text-[8px] text-plant-500">{t('bottom')}</span>
        </>
      ) : (
        k !== 'sink' && <Handle type="source" position={Position.Right} id="out" />
      )}
    </div>
  );
}

function BalanceEdgeView(props: EdgeProps<BEdge>) {
  const { id, data, selected } = props;
  const { problem, result } = useBalanceSolution();
  const [path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 10, offset: 24 });
  const n = result.values.get(nKey(id));
  const solved = n !== undefined;
  const color = solved ? 'rgb(var(--sig-liquid))' : 'rgb(var(--plant-500))';
  const given = data?.n !== null && data?.n !== undefined;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ fill: 'none', stroke: color, strokeOpacity: 0.25, strokeWidth: 6 }} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} markerEnd="url(#bal-arrow)" />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          className={cn(
            'nodrag nopan pointer-events-auto absolute rounded border bg-plant-950/90 px-1.5 py-0.5 font-mono text-[9px] leading-[13px] backdrop-blur',
            selected ? 'border-signal-liquid/60' : 'border-white/[0.07]',
          )}
        >
          <div className="font-semibold text-plant-200">{data?.name}</div>
          <div className={given ? 'text-plant-300' : solved ? 'text-signal-liquid' : 'text-plant-500'}>
            ṅ {solved ? num(n, 1) : '?'}
          </div>
          {problem.components.map((c, i) => {
            const v = result.values.get(xKey(id, i));
            const g = data?.x[i] !== null && data?.x[i] !== undefined;
            return (
              <div key={i} className={g ? 'text-plant-400' : v !== undefined ? 'text-signal-liquid/90' : 'text-plant-600'}>
                {c} {v !== undefined ? num(v, 3) : '?'}
              </div>
            );
          })}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const balanceNodeTypes = { balance: BalanceNodeView };
export const balanceEdgeTypes = { bstream: BalanceEdgeView };

const KINDS: readonly string[] = ['source', 'sink', 'column', 'mixer', 'splitter', 'exchanger', 'unit'];

export function BalanceCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, isValidConnection, addUnit } = useBalance(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      isValidConnection: s.isValidConnection,
      addUnit: s.addUnit,
    })),
  );
  const { screenToFlowPosition } = useReactFlow();
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(BALANCE_DND);
      if (!KINDS.includes(kind)) return;
      addUnit(kind as BUnitKind, screenToFlowPosition({ x: e.clientX - 60, y: e.clientY - 40 }));
    },
    [addUnit, screenToFlowPosition],
  );
  return (
    <div className="glass relative min-h-0 flex-1 overflow-hidden">
      <svg width="0" height="0" className="absolute">
        <defs>
          <marker id="bal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="rgb(var(--sig-liquid))" />
          </marker>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={balanceNodeTypes}
        edgeTypes={balanceEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        defaultEdgeOptions={{ type: 'bstream' }}
        connectionLineStyle={{ stroke: 'rgb(var(--sig-liquid))', strokeWidth: 1.5, strokeDasharray: '4 4' }}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background id="minor" variant={BackgroundVariant.Lines} gap={20} color="rgba(148,163,184,0.035)" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={100} color="rgba(148,163,184,0.07)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[9px] tracking-[0.2em] text-plant-500">{t('BALANCE TASK')}</div>
    </div>
  );
}
