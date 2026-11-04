import { ReactFlowProvider } from '@xyflow/react';
import { lazy, Suspense } from 'react';
import { AnalysisDock } from '@/components/analysis/AnalysisDock';
import { AppHeader } from '@/components/AppHeader';
import { FlowCanvas } from '@/components/FlowCanvas';
import { Inspector } from '@/components/Inspector';
import { Palette } from '@/components/Palette';
import { useRoute } from '@/lib/route';

const McCabeThielePage = lazy(() => import('@/pages/McCabeThielePage'));
const BatchPage = lazy(() => import('@/pages/BatchPage'));
const DistillationLinesPage = lazy(() => import('@/pages/DistillationLinesPage'));

export default function App() {
  const { route, params } = useRoute();
  return (
    <ReactFlowProvider>
      <div className="relative flex h-full flex-col gap-2 p-2">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.06),transparent_60%)]" />
        <AppHeader route={route} />
        {route === 'flowsheet' ? (
          <main className="relative flex min-h-0 flex-1 gap-2">
            <Palette />
            <FlowCanvas />
            <AnalysisDock />
            <Inspector />
          </main>
        ) : (
          <Suspense fallback={<div className="glass flex-1 animate-pulse" aria-busy="true" />}>
            <main className="relative min-h-0 flex-1 overflow-y-auto">
              {route === 'mccabe-thiele' ? (
                <McCabeThielePage params={params} />
              ) : route === 'batch' ? (
                <BatchPage params={params} />
              ) : (
                <DistillationLinesPage />
              )}
            </main>
          </Suspense>
        )}
      </div>
    </ReactFlowProvider>
  );
}
