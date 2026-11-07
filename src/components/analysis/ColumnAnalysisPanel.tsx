import {
  Badge,
  Card,
  Metric,
  ProgressBar,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from '@tremor/react';
import { AlertTriangle, CheckCircle2, Gauge, X } from 'lucide-react';
import { useMemo } from 'react';
import { COMPONENTS } from '@/engine/components';
import { fmt, kToC } from '@/lib/utils';
import { useFlowsheet, type UnitNode } from '@/store/flowsheetStore';
import { buildMcCabeThiele, buildStageTable, buildTxy } from './chartData';
import { McCabeThieleChart, McCabeThieleLegend } from './McCabeThieleChart';
import { TxyChart, TxyLegend, type TxyMarker } from './TxyChart';

function refluxBadge(ratio: number) {
  // heuristic: optimum reflux typically 1.2–1.5 × Rmin
  if (ratio < 1.1) return { color: 'amber', label: 'Near pinch', Icon: AlertTriangle } as const;
  if (ratio <= 1.5) return { color: 'emerald', label: 'Near optimum (1.1–1.5)', Icon: CheckCircle2 } as const;
  return { color: 'slate', label: 'Above optimum (> 1.5)', Icon: Gauge } as const;
}

function Kpi({ title, value, unit, children }: { title: string; value: string; unit?: string; children?: React.ReactNode }) {
  return (
    <Card className="!bg-plant-950/60 !p-3 !ring-white/[0.06]">
      <Text className="!text-[10px] !uppercase !tracking-[0.12em] !text-plant-400">{title}</Text>
      <Metric className="readout mt-0.5 !text-xl !text-plant-100">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-plant-400">{unit}</span>}
      </Metric>
      <div className="mt-1.5">{children}</div>
    </Card>
  );
}

export default function ColumnAnalysisPanel({ node, onClose }: { node: UnitNode; onClose: () => void }) {
  const c = node.data.column;
  const D = node.data.state.topProduct;
  const B = node.data.state.bottomProduct;
  const feedEdge = useFlowsheet((s) => s.edges.find((e) => e.target === node.id));
  const P = D?.pressure ?? 101.325;

  const mt = useMemo(() => (c ? buildMcCabeThiele(c) : null), [c]);
  const system = useFlowsheet((st) => st.system);
  const txy = useMemo(() => buildTxy(system, P), [system, P]);
  const stages = useMemo(() => (c ? buildStageTable(c, system, P) : []), [c, system, P]);

  const sys = `${COMPONENTS[system.A].name} / ${COMPONENTS[system.B].name}`;
  const { refluxRatio: R, theoreticalStages: N, condenserType = 'total' } = node.data.params;

  return (
    <section
      aria-label={`${node.data.tag} McCabe–Thiele analysis`}
      className="glass flex w-[500px] shrink-0 flex-col overflow-hidden duration-200 animate-in fade-in slide-in-from-right-4"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.05] px-4 py-3">
        <div>
          <p className="tag text-signal-liquid">{node.data.tag} · Rectification analysis</p>
          <p className="mt-0.5 font-mono text-[10px] text-plant-400">
            {sys} · {fmt(P, 1)} kPa · {N} stages + {condenserType} condenser
            {c && <> · α = {fmt(c.alpha, 3)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close analysis panel"
          className="rounded p-1 text-plant-400 transition-colors hover:bg-white/5 hover:text-plant-100"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {!c || !mt || !D || !B ? (
        <div className="p-4 text-[11px] leading-relaxed text-plant-400">
          <p className="tag mb-1 text-plant-500">No solution</p>
          {node.data.diag?.messages.map((m) => <p key={m}>{m}</p>) ?? <p>Connect a feed stream to the column.</p>}
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            <Kpi title={`Distillate purity · ${COMPONENTS[system.A].name}`} value={fmt(c.xD * 100, 2)} unit="mol %">
              <ProgressBar value={c.xD * 100} color="teal" className="mt-1" showAnimation={false} />
              <Text className="readout mt-1 !text-[10px] !text-plant-400">
                D = {fmt(c.D, 1)} kmol/h · {fmt(kToC(D.temperature), 1)} °C
              </Text>
            </Kpi>
            <Kpi title={`Bottoms purity · ${COMPONENTS[system.B].name}`} value={fmt((1 - c.xB) * 100, 2)} unit="mol %">
              <ProgressBar value={(1 - c.xB) * 100} color="teal" className="mt-1" showAnimation={false} />
              <Text className="readout mt-1 !text-[10px] !text-plant-400">
                B = {fmt(c.B, 1)} kmol/h · {fmt(kToC(B.temperature), 1)} °C · x<sub>B</sub> = {fmt(c.xB, 4)}
              </Text>
            </Kpi>
            <Kpi title="Reflux / minimum" value={fmt(R / c.Rmin, 2)} unit="× Rmin">
              {(() => {
                const b = refluxBadge(R / c.Rmin);
                return (
                  <Badge color={b.color} icon={b.Icon} size="xs">
                    {b.label}
                  </Badge>
                );
              })()}
              <Text className="readout mt-1 !text-[10px] !text-plant-400">
                R = {fmt(R, 2)} · Rmin = {fmt(c.Rmin, 3)} · Nmin = {fmt(c.Nmin, 2)}
              </Text>
            </Kpi>
            <Kpi title="Reboiler duty" value={fmt(c.Qr, 0)} unit="kW">
              <Text className="readout !text-[10px] !text-plant-400">Condenser Qc = {fmt(c.Qc, 0)} kW</Text>
              <Text className="readout !text-[10px] !text-plant-400">
                Feed stage {c.feedStage} of {N} · q = {fmt(c.q, 3)}
              </Text>
            </Kpi>
          </div>

          <TabGroup>
            <TabList variant="line" className="!border-white/[0.06]">
              <Tab className="!text-[11px]">McCabe–Thiele</Tab>
              <Tab className="!text-[11px]">T–x–y</Tab>
              <Tab className="!text-[11px]">Stage table</Tab>
            </TabList>
            <TabPanels>
              <TabPanel className="!mt-3 space-y-2">
                <McCabeThieleLegend real={!!c.curve} />
                <McCabeThieleChart s={mt} />
                <p className="text-[10px] leading-relaxed text-plant-500">
                  Steps drawn from x<sub>D</sub> down to x<sub>B</sub>; hover a stage corner for its compositions.
                  {condenserType === 'partial' && ' The first step is the partial condenser (an equilibrium stage).'}{' '}
                  {c.curve ? 'CMO assumed; stages stepped on the real equilibrium curve.' : 'CMO and constant α assumed.'}
                </p>
              </TabPanel>
              <TabPanel className="!mt-3 space-y-2">
                <TxyLegend />
                <TxyChart
                  rows={txy}
                  markers={
                    [
                      { label: 'D', x: c.xD, T: kToC(D.temperature) },
                      { label: 'B', x: c.xB, T: kToC(B.temperature) },
                      feedEdge?.data?.resolved
                        ? { label: 'F', x: feedEdge.data.molarFractions.compA, T: kToC(feedEdge.data.temperature) }
                        : null,
                    ].filter(Boolean) as TxyMarker[]
                  }
                />
                <p className="text-[10px] leading-relaxed text-plant-500">
                  Rigorous Raoult&apos;s-law envelope at {fmt(P, 1)} kPa. Between the lines the mixture is two-phase.
                </p>
              </TabPanel>
              <TabPanel className="!mt-3">
                <Table className="!overflow-visible">
                  <TableHead>
                    <TableRow>
                      {['Stage', 'Role', 'x', 'y', 'T [°C]'].map((h) => (
                        <TableHeaderCell key={h} className="!px-2 !py-1.5 !text-[10px] !font-medium !uppercase !tracking-wider !text-plant-400">
                          {h}
                        </TableHeaderCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="!divide-white/[0.04]">
                    {stages.map((r) => (
                      <TableRow key={r.stage} className={r.stage === c.feedStage ? 'bg-signal-liquid/[0.06]' : ''}>
                        <TableCell className="readout !px-2 !py-1 !text-[11px] !text-plant-200">{r.stage}</TableCell>
                        <TableCell className="!px-2 !py-1 !text-[11px] !text-plant-300">{r.section}</TableCell>
                        <TableCell className="readout !px-2 !py-1 !text-right !text-[11px] !text-plant-100">{fmt(r.x, 4)}</TableCell>
                        <TableCell className="readout !px-2 !py-1 !text-right !text-[11px] !text-plant-100">{fmt(r.y, 4)}</TableCell>
                        <TableCell className="readout !px-2 !py-1 !text-right !text-[11px] !text-plant-100">{fmt(r.T, 2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabPanel>
            </TabPanels>
          </TabGroup>
        </div>
      )}
    </section>
  );
}
