import { ReactFlowProvider } from '@xyflow/react';
import { AnalysisDock } from '@/components/analysis/AnalysisDock';
import { FlowCanvas } from '@/components/FlowCanvas';
import { Inspector } from '@/components/Inspector';
import { Palette } from '@/components/Palette';
import { StatusBar } from '@/components/StatusBar';

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="relative flex h-full flex-col gap-2 p-2">
        {/* ambient vignette */}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(45,212,191,0.06),transparent_60%)]" />
        <StatusBar />
        <main className="relative flex min-h-0 flex-1 gap-2">
          <Palette />
          <FlowCanvas />
          <AnalysisDock />
          <Inspector />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
