import type { NodeTypes } from '@xyflow/react';
import { DistillationNode } from './DistillationNode';
import { FeedNode } from './FeedNode';
import { HeaterNode } from './HeaterNode';
import { MixerNode } from './MixerNode';

export const nodeTypes = {
  feed: FeedNode,
  mixer: MixerNode,
  heater: HeaterNode,
  distillation: DistillationNode,
} satisfies NodeTypes;
