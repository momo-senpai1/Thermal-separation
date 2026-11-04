import { useReactFlow } from '@xyflow/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useFlowsheet } from '@/store/flowsheetStore';

// charts (Tremor + Recharts) load on first column selection
const ColumnAnalysisPanel = lazy(() => import('./ColumnAnalysisPanel'));

/**
 * Docks the McCabe–Thiele panel beside the canvas whenever a column is
 * selected. Closing hides it until the column is selected again.
 */
export function AnalysisDock() {
  const column = useFlowsheet((s) => s.nodes.find((n) => n.selected && n.type === 'distillation'));
  const [dismissed, setDismissed] = useState<string | null>(null);
  const { fitView } = useReactFlow();
  const open = !!column && dismissed !== column.id;

  // re-arm when the selection moves away from the dismissed column
  useEffect(() => {
    if (!column) setDismissed(null);
  }, [column]);

  // the canvas width changes when the dock opens/closes — keep the flowsheet in view
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: 0.12, duration: 250 }), 60);
    return () => window.clearTimeout(id);
  }, [open, fitView]);

  if (!open || !column) return null;
  return (
    <Suspense fallback={<div className="glass w-[500px] shrink-0 animate-pulse" aria-busy="true" />}>
      <ColumnAnalysisPanel node={column} onClose={() => setDismissed(column.id)} />
    </Suspense>
  );
}
