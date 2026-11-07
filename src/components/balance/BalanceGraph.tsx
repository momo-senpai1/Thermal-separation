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
import { THERMAL, TWO_OUTLETS, type BUnitKind } from '@/engine/balance/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useBalance, useBalanceSolution, type BEdge, type BNode } from '@/store/balanceStore';
import { UNIT_ICONS } from '@/components/unitIcons';
import { num } from './texFormat';

export const BALANCE_DND = 'application/x-balance-unit';

export const KIND_ICON: Record<BUnitKind, JSX.Element> = {
  source: UNIT_ICONS.feed,
  sink: UNIT_ICONS.product,
  mixer: UNIT_ICONS.mixer,
  splitter: UNIT_ICONS.splitter,
  heater: UNIT_ICONS.heater,
  cooler: UNIT_ICONS.cooler,
  exchanger: UNIT_ICONS.cooler,
  pump: UNIT_ICONS.pump,
  valve: UNIT_ICONS.valve,
  column: UNIT_ICONS.distillation,
  flash: UNIT_ICONS.flash,
  evaporator: UNIT_ICONS.evaporator,
  absorber: UNIT_ICONS.absorber,
  extractor: UNIT_ICONS.extractor,
  crystallizer: UNIT_ICONS.crystallizer,
  dryer: UNIT_ICONS.dryer,
  unit: UNIT_ICONS.unit,
};

const KIND_LABEL: Record<BUnitKind, string> = {
  source: 'Feed',
  sink: 'Product',
  mixer: 'Mixer',
  splitter: 'Splitter',
  heater: 'Heater',
  cooler: 'Cooler / condenser',
  exchanger: 'Cooler / condenser',
  pump: 'Pump',
  valve: 'Valve',
  column: 'Column',
  flash: 'Flash drum',
  evaporator: 'Evaporator',
  absorber: 'Absorber / stripper',
  extractor: 'Extraction column',
  crystallizer: 'Crystallizer',
  dryer: 'Dryer',
  unit: 'Apparatus (black box)',
};

/** Names of the top / bottom outlets per unit. */
export const PORT_LABELS: Partial<Record<BUnitKind, [string, string]>> = {
  column: ['distillate', 'bottoms'],
  flash: ['vapour', 'liquid'],
  evaporator: ['vapour', 'concentrate'],
  absorber: ['gas out', 'liquid out'],
  extractor: ['extract', 'raffinate'],
  crystallizer: ['mother liquor', 'crystals'],
  dryer: ['exhaust air', 'dry solid'],
};
export const kindLabel = (k: BUnitKind) => t(KIND_LABEL[k]);

function BalanceNodeView({ id, data, selected }: NodeProps<BNode>) {
  const { columns } = useBalanceSolution();
  const col = columns.find((c) => c.unitId === id);
  const k = data.kind;
  const two = TWO_OUTLETS.includes(k);
  const tall = k === 'column';
  const ports = PORT_LABELS[k];
  return (
    <div
      className={cn(
        'glass relative flex min-w-[130px] flex-col items-center gap-1 px-3 py-2 text-center transition-shadow',
        tall ? 'min-h-[150px] justify-center' : two && 'min-h-[110px] justify-center',
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
      {THERMAL.includes(k) && (
        <span className="font-mono text-[10px] text-signal-heat">Q̇ = {data.Q === null || data.Q === undefined ? '?' : `${num(data.Q, 0)} kJ/h`}</span>
      )}
      {k !== 'source' && <Handle type="target" position={Position.Left} id="in" />}
      {two ? (
        <>
          <Handle type="source" position={Position.Right} id="top" style={{ top: '18%' }} />
          <Handle type="source" position={Position.Right} id="bottom" style={{ top: '82%' }} />
          <span className="pointer-events-none absolute right-2 top-[6%] font-mono text-[8px] text-plant-500">{t(ports?.[0] ?? 'top')}</span>
          <span className="pointer-events-none absolute bottom-[6%] right-2 font-mono text-[8px] text-plant-500">{t(ports?.[1] ?? 'bottom')}</span>
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

const KINDS: readonly string[] = Object.keys(KIND_LABEL);

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
