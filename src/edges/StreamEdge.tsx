import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { cn, fmt, kToC } from '@/lib/utils';
import type { StreamEdge as StreamEdgeT } from '@/store/flowsheetStore';

/** Colour the pipe by thermal condition: liquid (q ≥ 1) teal, two-phase blend, vapour (q ≤ 0) amber. */
function phaseColor(q: number, resolved: boolean) {
  if (!resolved) return '#3a4b60';
  if (q >= 1) return '#2dd4bf';
  if (q <= 0) return '#fbbf24';
  return '#a3e635'; // two-phase
}

export function StreamEdge(props: EdgeProps<StreamEdgeT>) {
  const { id, data, selected } = props;
  const [path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 10, offset: 24 });
  const resolved = data?.resolved ?? false;
  const color = phaseColor(data?.vaporFraction ?? 1, resolved);

  return (
    <>
      <g style={{ color }} className="stream-pipe">
        {/* pipe wall */}
        <BaseEdge id={id} path={path} style={{ fill: 'none', stroke: color, strokeOpacity: 0.28, strokeWidth: 6 }} />
        {/* core + animated flow */}
        <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeOpacity={resolved ? 0.9 : 0.5} />
        {resolved && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.6}
            strokeDasharray="4 8"
            strokeLinecap="round"
            className="animate-flow"
          />
        )}
      </g>
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          className={cn(
            'nodrag nopan pointer-events-auto absolute rounded border bg-plant-950/90 px-1.5 py-0.5 font-mono text-[9px] leading-[13px] backdrop-blur',
            selected ? 'border-signal-liquid/60' : 'border-white/[0.07]',
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color }} />
            <span className="font-semibold text-plant-200">{data?.tag}</span>
          </div>
          {resolved && data ? (
            <div className="readout text-plant-300">
              {fmt(data.flowRate, 0)}
              <span className="text-plant-500"> kmol/h · </span>
              {fmt(kToC(data.temperature), 0)}
              <span className="text-plant-500">°C · x</span>
              {fmt(data.molarFractions.compA, 2)}
            </div>
          ) : (
            <div className="text-plant-500">unresolved</div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { stream: StreamEdge };
