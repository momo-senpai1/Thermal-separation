import type { NodeTypes } from '@xyflow/react';
import { BatchNode } from './BatchNode';
import { DistillationNode } from './DistillationNode';
import { FlashNode } from './FlashNode';
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
} satisfies NodeTypes;
