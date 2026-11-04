import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { edgeTypes } from '@/edges/StreamEdge';
import { nodeTypes } from '@/nodes';
import { useFlowsheet } from '@/store/flowsheetStore';
import type { UnitType } from '@/types/process';
import { DND_MIME } from './Palette';

const UNIT_TYPES: readonly string[] = ['feed', 'mixer', 'heater', 'distillation'];

const MINIMAP_COLOR: Record<string, string> = {
  feed: '#2dd4bf',
  mixer: '#5c7089',
  heater: '#f97316',
  distillation: '#2dd4bf',
};

export function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, isValidConnection, addUnit } = useFlowsheet(
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
      const type = e.dataTransfer.getData(DND_MIME);
      if (!UNIT_TYPES.includes(type)) return;
      addUnit(type as UnitType, screenToFlowPosition({ x: e.clientX - 80, y: e.clientY - 40 }));
    },
    [addUnit, screenToFlowPosition],
  );

  return (
    <div className="glass relative h-full flex-1 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        defaultEdgeOptions={{ type: 'stream' }}
        connectionLineStyle={{ stroke: '#2dd4bf', strokeWidth: 1.5, strokeDasharray: '4 4' }}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background id="minor" variant={BackgroundVariant.Lines} gap={20} color="rgba(148,163,184,0.035)" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={100} color="rgba(148,163,184,0.07)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          bgColor="rgba(6,9,13,0.85)"
          maskColor="rgba(6,9,13,0.6)"
          nodeColor={(n) => MINIMAP_COLOR[n.type ?? ''] ?? '#5c7089'}
          nodeBorderRadius={2}
          style={{ width: 160, height: 100 }}
        />
      </ReactFlow>
      {/* corner registration marks */}
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[9px] tracking-[0.2em] text-plant-500">
        FLOWSHEET · PFD-001
      </div>
    </div>
  );
}
