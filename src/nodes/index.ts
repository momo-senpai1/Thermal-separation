import type { NodeTypes } from '@xyflow/react';
import { BatchNode } from './BatchNode';
import { DistillationNode } from './DistillationNode';
import { FlashNode } from './FlashNode';
import { BlockNode, CoolerNode, EvaporatorNode, PumpNode, SplitterNode, ValveNode } from './ProcessNodes';
import { FeedNode } from './FeedNode';
import { HeaterNode } from './HeaterNode';
import { MixerNode } from './MixerNode';

export const nodeTypes = {
  feed: FeedNode,
  mixer: MixerNode,
  heater: HeaterNode,
  distillation: DistillationNode,
  batch: BatchNode,
  flash: FlashNode,
  cooler: CoolerNode,
  pump: PumpNode,
  valve: ValveNode,
  splitter: SplitterNode,
  evaporator: EvaporatorNode,
  absorber: BlockNode,
  extractor: BlockNode,
  evaptrain: BlockNode,
  crystallizer: BlockNode,
  dryer: BlockNode,
} satisfies NodeTypes;
