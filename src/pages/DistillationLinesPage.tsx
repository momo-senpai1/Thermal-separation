import { useDeferredValue, useMemo, useState } from 'react';
import { VIZ } from '@/components/analysis/vizTokens';
import { ParamSlider } from '@/components/ParamSlider';
import { Field, Kpi, Notice, Panel, Select, Toggle } from '@/components/workbench/controls';
import { TernaryDiagram, type Layers } from '@/components/workbench/TernaryDiagram';
import { borderLines, columnAtTotalReflux, defaultDistillate, field, productRegions, singularPoints, snapDistillate } from '@/engine/ternary/lines';
import { bubble, TERNARY_SYSTEMS, type Vec3 } from '@/engine/ternary/model';
import { fmt } from '@/lib/utils';

const START: Record<string, { F: Vec3 }> = {
  hch: { F: [0.35, 0.3, 0.35] },
  acm: { F: [0.4, 0.08, 0.52] },
};
const LAYERS: Layers = { lines: true, arrows: true, borders: true, feed: true, column: true, points: true };
const fmtX = (x: Vec3) => x.map((v) => v.toFixed(3)).join(' · ');

export default function DistillationLinesPage() {
  const [sysId, setSysId] = useState('hch');
  const [P, setP] = useState(1.01325);
  const feasibleStart = (id: string) => {
    const sy = TERNARY_SYSTEMS.find((q) => q.id === id)!.get();
    const pts = singularPoints(sy, 1.01325);
    return defaultDistillate(sy, 1.01325, START[id]!.F, borderLines(sy, 1.01325, pts));
  };
  const [F, setF] = useState<Vec3>(START.hch!.F);
  const [D, setD] = useState<Vec3>(() => feasibleStart('hch'));
  const [layers, setLayers] = useState<Layers>(LAYERS);
  const sys = useMemo(() => TERNARY_SYSTEMS.find((s) => s.id === sysId)!.get(), [sysId]);

  // the field depends on (system, P); dragging uses deferred values to stay smooth
  const dP = useDeferredValue(P);
  const points = useMemo(() => singularPoints(sys, dP), [sys, dP]);
  const lines = useMemo(() => field(sys, dP, points), [sys, dP, points]);
  const borders = useMemo(() => borderLines(sys, dP, points), [sys, dP, points]);
  const dF = useDeferredValue(F);
  const dD = useDeferredValue(D);
  const regions = useMemo(() => productRegions(sys, dP, dF, borders), [sys, dP, dF, borders]);
  const column = useMemo(() => columnAtTotalReflux(sys, dP, dF, dD), [sys, dP, dF, dD]);

  const switchSystem = (id: string) => {
    setSysId(id);
    setF(START[id]!.F);
    setD(feasibleStart(id));
  };
  const toggle = (k: keyof Layers) => (v: boolean) => setLayers((l) => ({ ...l, [k]: v }));
  const tern = points.filter((p) => p.order !== 'pure');

  return (
    <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
        <Panel title="Distillation lines">
          <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
            Multicomponent rectification, the geometric way: three components on one figure — the field of distillation
            lines at total reflux, the border lines they cannot cross, and the products a feed can actually reach. Drag
            the feed F and the distillate D; change the pressure and watch the azeotropes move.
          </p>
          <div className="space-y-3">
            <Field label="Substance system">
              <Select value={sysId} options={TERNARY_SYSTEMS.map((s) => ({ id: s.id, label: s.label }))} onChange={switchSystem} ariaLabel="Substance system" />
            </Field>
            <p className="font-mono text-[9px] leading-relaxed text-plant-500">{sys.note}</p>
            <ParamSlider label="Pressure" symbol="p" unit="bar" min={0.2} max={3} step={0.005} digits={3} value={P} onChange={setP} />
          </div>
        </Panel>
        <Panel title="Show">
          <div className="grid grid-cols-2 gap-y-2">
            <Toggle checked={layers.lines} onChange={toggle('lines')} label="Distillation lines" />
            <Toggle checked={layers.arrows} onChange={toggle('arrows')} label="Arrows" />
            <Toggle checked={layers.borders} onChange={toggle('borders')} label="Border lines" />
            <Toggle checked={layers.points} onChange={toggle('points')} label="Azeotropes" />
            <Toggle checked={layers.feed} onChange={toggle('feed')} label="Feed & regions" />
            <Toggle checked={layers.column} onChange={toggle('column')} label="Products & column" />
          </div>
        </Panel>
        <Panel title="Actions">
          <div className="space-y-2">
            <button
              type="button"
              disabled={!column || column.feasible}
              onClick={() => setD(snapDistillate(sys, P, F, D))}
              className="w-full rounded-md border border-signal-liquid/40 bg-signal-liquid/[0.07] py-1.5 text-[11px] text-signal-liquid transition-colors hover:bg-signal-liquid/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Snap D onto the line
            </button>
            <button
              type="button"
              onClick={() => {
                setP(1.01325);
                switchSystem(sysId);
                setLayers(LAYERS);
              }}
              className="w-full rounded-md border border-signal-alarm/30 py-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-alarm/90 transition-colors hover:bg-signal-alarm/10"
            >
              Reset all
            </button>
          </div>
        </Panel>
        <Panel title="Legend">
          <ul className="space-y-1.5 text-[10px] text-plant-300">
            <li className="flex items-center gap-2"><span className="h-0.5 w-5 rounded-full opacity-70" style={{ background: VIZ.equilibrium }} />Distillation line · arrows towards rising T</li>
            <li className="flex items-center gap-2"><span className="h-[3px] w-5 rounded-full" style={{ background: VIZ.operating }} />Border line (separatrix)</li>
            <li className="flex items-center gap-2"><span className="h-0.5 w-5 rounded-full" style={{ background: VIZ.qLine }} />Line through F · shaded: reachable D and B</li>
            <li className="flex items-center gap-2"><span className="h-0.5 w-5 rounded-full bg-plant-100" />Column profile · dots are stages</li>
            <li className="flex items-center gap-2">
              <svg width="20" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill={VIZ.surface} stroke={VIZ.text} strokeWidth="1.6" /></svg>Light node — lines end here going up
            </li>
            <li className="flex items-center gap-2">
              <svg width="20" height="12" aria-hidden><rect x="2" y="2" width="8" height="8" fill={VIZ.text} /></svg>Heavy node — lines end here going down
            </li>
            <li className="flex items-center gap-2">
              <svg width="20" height="12" aria-hidden><path d="M6 0L12 6L6 12L0 6Z" fill={VIZ.textMuted} /></svg>Saddle — border lines start here
            </li>
          </ul>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi label="Stages at total reflux" value={column ? fmt(column.N, 2) : '—'} tone={column?.feasible ? 'default' : 'muted'} sub="from B up to D" />
          <Kpi label="D / F" value={column ? fmt(column.DF, 3) : '—'} sub="lever rule on D–F–B" />
          <Kpi small label="Distillate D · x₁/x₂/x₃" value={fmtX(D)} sub={`T = ${fmt(bubble(sys, D, P).T, 1)} °C`} />
          <Kpi small label="Bottoms B · x₁/x₂/x₃" value={column ? fmtX(column.B) : '—'} sub={column ? `T = ${fmt(bubble(sys, column.B, P).T, 1)} °C` : ''} />
          <Kpi small label="Feed F · x₁/x₂/x₃" value={fmtX(F)} sub={`T = ${fmt(bubble(sys, F, P).T, 1)} °C`} />
          <Kpi label="Singular points" value={String(points.length)} sub={`${tern.length} azeotrope${tern.length === 1 ? '' : 's'} · ${borders.length} border branches`} />
        </div>

        {column && !column.feasible && (
          <Notice tone="warning">
            D is not on a distillation line through a balanced bottoms product (gap {fmt(column.gap, 3)}). At total reflux D and
            B must lie on one distillation line and on one straight line with F, D in the shaded distillate region and B in
            the shaded bottoms region — use <b>Snap D onto the line</b> to move D to the nearest such split.
          </Notice>
        )}

        <Panel title={`${sys.name} · ${fmt(P, 3)} bar`}>
          <div className="mx-auto max-w-[900px]">
            <TernaryDiagram
              sys={sys}
              P={dP}
              points={points}
              field={lines}
              borders={borders}
              regions={regions}
              column={column}
              F={F}
              D={D}
              layers={layers}
              onMove={(w, x) => (w === 'F' ? setF(x) : setD(x))}
            />
          </div>
        </Panel>

        {tern.length > 0 && (
          <Panel title="Azeotropes">
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-plant-500">
                  <th className="py-1 font-medium">Point</th>
                  <th className="py-1 font-medium">Type</th>
                  <th className="py-1 text-right font-medium">x₁ / x₂ / x₃</th>
                  <th className="py-1 text-right font-medium">T [°C]</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.label} className="border-t border-white/[0.03]">
                    <td className="py-0.5 text-plant-200">{p.label}</td>
                    <td className="py-0.5 text-plant-300">{p.kind.replace('-', ' ')}</td>
                    <td className="py-0.5 text-right text-plant-100">{fmtX(p.x)}</td>
                    <td className="py-0.5 text-right text-plant-100">{fmt(p.T, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <Panel title="Where the model stops">
          <ul className="grid gap-x-6 gap-y-1 text-[11px] leading-relaxed text-plant-400 md:grid-cols-2">
            <li>Distillation lines at total reflux: each point is an equilibrium stage, x_(n+1) = y*(x_n).</li>
            <li>A column at total reflux cannot cross a border line; finite reflux can cross slightly curved ones.</li>
            <li>Shaded product regions: between the distillation line through F and the straight lines to its end points.</li>
            <li>Wilson parameters are temperature-independent and fitted to the binary azeotropes at 1.013 bar.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
