import { useMemo, useState } from 'react';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { HunterNashDiagram, type HNLayers } from '@/components/extraction/HunterNashDiagram';
import { fmtL, LoadingChart, LoadingLegend, type LoadingLayers } from '@/components/extraction/LoadingChart';
import { VIZ } from '@/components/analysis/vizTokens';
import { ParamSlider } from '@/components/ParamSlider';
import { Kpi, Notice, Panel, Select, Toggle } from '@/components/workbench/controls';
import { solveCounter, solveCross, type ExtractionTarget } from '@/engine/extraction/cascade';
import { extractionDefaults } from '@/engine/extraction/defaults';
import { solveHunterNash } from '@/engine/extraction/hunterNash';
import { equilibriumCurve, getLLE, LLE_OPTIONS } from '@/engine/extraction/lle';
import { navigate } from '@/lib/route';
import { cn, fmt } from '@/lib/utils';

type Tool = 'cross' | 'counter' | 'hn';
const TOOLS: { id: Tool; label: string; blurb: string }[] = [
  { id: 'cross', label: 'Cross-current', blurb: 'One operating line per stage, each starting on the solvent line: how far fresh solvent in every stage gets you, and what it costs in solvent.' },
  { id: 'counter', label: 'Counter-current', blurb: 'One operating line for the whole cascade, stepped off from the feed end, with the minimum solvent ratio — for the same specification as the cross-current tool.' },
  { id: 'hn', label: 'Hunter–Nash', blurb: 'The counter-current cascade on the ternary diagram when carrier and solvent are partly miscible: mixing point, pole, and the minimum and maximum solvent ratio.' },
];
const TARGETS: { id: ExtractionTarget; label: string }[] = [
  { id: 'stages', label: 'Number of stages' },
  { id: 'raffinate', label: 'Raffinate X_N for given N' },
  { id: 'solvent', label: 'Solvent ratio Ġ/L̇ for given N' },
];

export default function ExtractionPage({ params }: { params: URLSearchParams }) {
  const [tool, setTool] = useState<Tool>(() => (['cross', 'counter', 'hn'].includes(params.get('tool') ?? '') ? (params.get('tool') as Tool) : 'cross'));
  const [sysId, setSysId] = useState('aa-ipe');
  const sys = useMemo(() => getLLE(sysId), [sysId]);
  const curve = useMemo(() => equilibriumCurve(sys), [sys]);
  const [spec, setSpec] = useState(() => extractionDefaults(getLLE('aa-ipe')));
  const [sF, setSF] = useState<number | null>(null);
  const [target, setTarget] = useState<ExtractionTarget>('stages');
  const [N, setN] = useState(4);
  const [ll, setLL] = useState<LoadingLayers>({ operating: true, drops: true, numbers: true, solvent: true, limits: false });
  const [hl, setHL] = useState<HNLayers>({ tieLines: true, construction: true, stages: true, pole: true });
  const set = <K extends keyof typeof spec>(k: K, v: number) => setSpec((p) => ({ ...p, [k]: v }));

  const switchSystem = (id: string) => {
    setSysId(id);
    setSpec(extractionDefaults(getLLE(id)));
    setSF(null);
  };
  const go = (t: Tool) => {
    setTool(t);
    navigate('extraction', { tool: t });
  };

  const cs = { curve, X0: spec.X0, Y0: spec.Y0, XN: spec.XN, r: spec.r, target, N };
  const cross = useMemo(() => solveCross(cs), [curve, spec, target, N]); // eslint-disable-line react-hooks/exhaustive-deps
  const counter = useMemo(() => solveCounter(cs), [curve, spec, target, N]); // eslint-disable-line react-hooks/exhaustive-deps

  // cross vs counter for the same specification and the same (whole) number of stages
  const compare = useMemo(() => {
    const n = tool === 'counter' ? Math.max(1, Math.ceil((counter.ok ? counter.N : 4) - 1e-9)) : cross.ok ? cross.N : 4;
    const c1 = solveCross({ ...cs, target: 'solvent', N: n });
    const c2 = solveCounter({ ...cs, target: 'solvent', N: n });
    return c1.ok && c2.ok ? { n, cross: c1, counter: c2 } : null;
  }, [cross, counter, tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hunter–Nash: same feed and raffinate, mass fractions
  const wF = spec.X0 / (1 + spec.X0);
  const wS = spec.Y0 / (1 + spec.Y0);
  const wRN = spec.XN / (1 + spec.XN);
  const hnProbe = useMemo(() => (sys.tieLines ? solveHunterNash({ sys, wF, wS, wRN, s: 1 }) : null), [sys, wF, wS, wRN]);
  const sDefault = useMemo(() => {
    const fromLoading = (spec.r * (1 + spec.Y0)) / (1 + spec.X0);
    if (!hnProbe || !Number.isFinite(hnProbe.sMin)) return fromLoading;
    return Math.max(fromLoading, hnProbe.sMin * 1.3);
  }, [hnProbe, spec]);
  const s = sF ?? sDefault;
  const hn = useMemo(() => (sys.tieLines ? solveHunterNash({ sys, wF, wS, wRN, s }) : null), [sys, wF, wS, wRN, s]);

  const Xmax = curve.Xmax;
  const rRange: [number, number] = [Math.max(1e-3, spec.r / 12), spec.r * 6];
  const active = tool === 'cross' ? cross : counter;

  return (
    <div className="space-y-2">
      <div className="glass flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="tag mr-2 text-plant-400">Extraction</span>
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            aria-pressed={tool === t.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] transition-colors',
              tool === t.id ? 'border-signal-liquid/50 bg-signal-liquid/10 text-signal-liquid' : 'border-white/[0.07] text-plant-300 hover:text-plant-100',
            )}
          >
            <span className="font-mono text-[9px] text-plant-500">{i + 1}</span>
            {t.label}
          </button>
        ))}
        <p className="ml-2 min-w-[280px] flex-1 text-[10px] leading-relaxed text-plant-500">{TOOLS.find((t) => t.id === tool)!.blurb}</p>
      </div>

      <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
          <Panel title="LLE system">
            <div className="space-y-2">
              <Select value={sysId} options={LLE_OPTIONS} onChange={switchSystem} ariaLabel="LLE system" />
              <p className="font-mono text-[9px] leading-relaxed text-plant-500">
                Solute {sys.solute} · carrier {sys.carrier} · solvent {sys.solvent}. {sys.note}
              </p>
            </div>
          </Panel>
          <Panel title="Calculate">
            <div className="space-y-3">
              {tool !== 'hn' && (
                <>
                  <Select value={target} options={TARGETS} onChange={setTarget} ariaLabel="Calculation target" />
                  <ParamSlider label="Stages" symbol="N" min={1} max={30} step={1} digits={0} value={target === 'stages' ? (active.ok ? active.N : N) : N}
                    computed={target === 'stages'} onChange={(v) => setN(Math.round(v))} />
                </>
              )}
              <ParamSlider label="Feed" symbol="X₀" min={Xmax * 0.02} max={Xmax * 0.95} step={Xmax / 2000} digits={4} value={spec.X0} onChange={(v) => set('X0', v)} />
              <ParamSlider label="Solvent" symbol="Y₀" min={0} max={Math.max(curve.Ystar(spec.X0) * 0.15, 1e-6)} step={Math.max(curve.Ystar(spec.X0) * 0.15, 1e-6) / 1000} digits={4} value={spec.Y0} onChange={(v) => set('Y0', v)} />
              <ParamSlider label="Raffinate" symbol="X_N" min={spec.X0 * 0.002} max={spec.X0 * 0.9} step={spec.X0 / 4000} digits={4}
                value={target === 'raffinate' && tool !== 'hn' ? active.XN : spec.XN} computed={target === 'raffinate' && tool !== 'hn'} onChange={(v) => set('XN', v)} />
              {tool !== 'hn' ? (
                <ParamSlider label="Solvent ratio" symbol="Ġ/L̇" min={rRange[0]} max={rRange[1]} step={(rRange[1] - rRange[0]) / 2000} digits={3}
                  value={target === 'solvent' ? active.r : spec.r} computed={target === 'solvent'} onChange={(v) => set('r', v)} />
              ) : (
                <ParamSlider label="Solvent / feed" symbol="S/F" min={Math.max(0.01, sDefault / 8)} max={sDefault * 5} step={sDefault / 800} digits={3}
                  value={s} onChange={(v) => setSF(v)} />
              )}
              <button
                type="button"
                onClick={() => {
                  setSpec(extractionDefaults(sys));
                  setSF(null);
                  setTarget('stages');
                }}
                className="w-full rounded-md border border-signal-alarm/30 py-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-alarm/90 transition-colors hover:bg-signal-alarm/10"
              >
                Reset all
              </button>
            </div>
          </Panel>
          <Panel title="Show">
            {tool !== 'hn' ? (
              <div className="grid grid-cols-2 gap-y-2">
                <Toggle checked={ll.operating} onChange={(v) => setLL({ ...ll, operating: v })} label={tool === 'cross' ? 'Operating lines' : 'Operating line'} />
                <Toggle checked={ll.drops} onChange={(v) => setLL({ ...ll, drops: v })} label={tool === 'cross' ? 'Drops to Y₀' : 'Stages'} />
                <Toggle checked={ll.numbers} onChange={(v) => setLL({ ...ll, numbers: v })} label="Stage numbers" />
                <Toggle checked={ll.solvent} onChange={(v) => setLL({ ...ll, solvent: v })} label="Solvent line Y₀" />
                {tool === 'counter' && <Toggle checked={ll.limits} onChange={(v) => setLL({ ...ll, limits: v })} label="Limiting ratios" />}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-2">
                <Toggle checked={hl.tieLines} onChange={(v) => setHL({ ...hl, tieLines: v })} label="Tie lines" />
                <Toggle checked={hl.construction} onChange={(v) => setHL({ ...hl, construction: v })} label="Mixing point" />
                <Toggle checked={hl.stages} onChange={(v) => setHL({ ...hl, stages: v })} label="Stages" />
                <Toggle checked={hl.pole} onChange={(v) => setHL({ ...hl, pole: v })} label="Pole lines" />
              </div>
            )}
          </Panel>
        </aside>

        <div className="min-w-0 space-y-2">
          {tool !== 'hn' ? (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
                <Kpi label={tool === 'cross' ? 'Stages N (whole)' : 'Stages N'} value={active.ok ? (tool === 'cross' ? String(active.N) : fmt(active.N, 2)) : '—'} tone={active.ok ? 'default' : 'muted'}
                  sub={tool === 'counter' && active.ok ? `${Math.ceil(active.N - 1e-9)} real stages` : target === 'stages' ? 'calculated' : 'specified'} />
                <Kpi label="Raffinate X_N" value={active.ok ? fmtL(tool === 'cross' ? active.Xout : active.XN) : '—'} sub={tool === 'cross' && active.ok ? `spec ${fmtL(spec.XN)}` : ''} />
                <Kpi label="Solvent Ġ/L̇" value={active.ok ? fmt(active.r, 3) : '—'} sub={tool === 'cross' ? 'per stage' : 'whole cascade'} />
                <Kpi label="Total solvent" value={active.ok ? fmt(active.solventTotal, 3) : '—'} sub="per unit carrier" />
                <Kpi label="Extracted" value={active.ok ? fmt(active.extracted * 100, 1) : '—'} unit="%" sub={active.ok ? `extract Y = ${fmtL(active.Yout)}` : ''} />
                <Kpi label={tool === 'counter' ? 'Ġ/L̇ min' : 'X*(Y₀) limit'} value={tool === 'counter' ? fmt(counter.rMin, 4) : fmtL(active.Xlimit)}
                  sub={tool === 'counter' ? `one stage at ${fmt(counter.rOne, 3)}` : 'no stage goes below'} />
              </div>
              {active.error && <Notice tone="error">{active.error}</Notice>}
              {sys.source === 'unifac' && <Notice tone="info">UNIFAC-predicted equilibrium: right in shape and trend, not a substitute for measured design data.</Notice>}

              <Panel title={`Loading diagram · ${sys.name}`}>
                <div className="mb-2"><LoadingLegend mode={tool} limits={ll.limits} /></div>
                <div className="mx-auto max-w-[980px]">
                  <LoadingChart mode={tool} curve={curve} X0={spec.X0} Y0={spec.Y0} XN={tool === 'counter' ? counter.XN : spec.XN} cross={cross} counter={counter} layers={ll} />
                </div>
              </Panel>

              <div className="grid gap-2 lg:grid-cols-2">
                <Panel title="How to read it">
                  {tool === 'cross' ? (
                    <div className="space-y-2 text-[11px] leading-relaxed text-plant-300">
                      <p>X counts solute per unit solute-free carrier, Y per unit solute-free solvent; carrier and solvent are taken as immiscible. Every stage is fed fresh solvent at Y₀, so every stage has an operating line of its own, from the raffinate of the stage before (X_(i−1), Y₀) up to the curve with slope −L̇/Ġ:</p>
                      <p className="rounded border border-white/[0.06] bg-plant-950/60 py-2 text-center font-mono text-plant-100">Y_i = Y₀ + (L̇/Ġ)·(X_(i−1) − X_i)</p>
                      <p>Where it meets the curve are the raffinate and extract leaving stage i; the dashed drop carries that raffinate back to Y₀ as the next stage’s feed. No stage gets the raffinate below X*(Y₀).</p>
                      {cross.ok && cross.stages.length > 0 && (
                        <p className="font-mono text-[10px] text-plant-400">Extraction factor λ = K·Ġ/L̇: {fmt(cross.stages[0]!.lambda, 2)} in the first stage, {fmt(cross.stages.at(-1)!.lambda, 2)} in the last (K: local slope of the curve).</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 text-[11px] leading-relaxed text-plant-300">
                      <p>Feed and solvent flow in opposite directions, so one operating line joins the two ends of the cascade: fresh solvent Y₀ meets the leaving raffinate X_N, the leaving extract Y₁ meets the feed X₀.</p>
                      <p className="rounded border border-white/[0.06] bg-plant-950/60 py-2 text-center font-mono text-plant-100">Y = Y₀ + (L̇/Ġ)·(X − X_N)</p>
                      <p>Step off from the feed end: across to the curve gives the raffinate leaving stage n, down to the line the extract coming up from stage n+1. Below Ġ/L̇_min the line touches the curve and the stages pinch; at the one-stage ratio a single stage does it.</p>
                    </div>
                  )}
                </Panel>
                <Panel title="Cross- against counter-current">
                  {compare ? (
                    <div className="space-y-2 text-[11px] leading-relaxed text-plant-300">
                      <p>
                        For X₀ = {fmtL(spec.X0)}, Y₀ = {fmtL(spec.Y0)}, X_N = {fmtL(spec.XN)} and N = {compare.n} stage{compare.n > 1 ? 's' : ''}:
                      </p>
                      <ul className="space-y-1 font-mono text-[11px]">
                        <li className="flex justify-between border-b border-white/[0.04] pb-1"><span className="text-plant-400">cross-current, per stage</span><span className="text-plant-100">Ġ/L̇ = {fmt(compare.cross.r, 4)}</span></li>
                        <li className="flex justify-between border-b border-white/[0.04] pb-1"><span className="text-plant-400">cross-current, total</span><span className="text-plant-100">{fmt(compare.cross.solventTotal, 4)}</span></li>
                        <li className="flex justify-between border-b border-white/[0.04] pb-1"><span className="text-plant-400">counter-current</span><span className="text-plant-100">Ġ/L̇ = {fmt(compare.counter.r, 4)}</span></li>
                      </ul>
                      <p>The cross-current cascade uses <b className="text-plant-100">{fmt(compare.cross.solventTotal / compare.counter.r, 2)}×</b> as much solvent for the same separation — the reason columns run counter-current.</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-plant-500">No comparison for these settings.</p>
                  )}
                </Panel>
              </div>

              <Panel title="Stages">
                <table className="w-full font-mono text-[11px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-plant-500">
                      <th className="py-1 font-medium">n</th>
                      <th className="py-1 text-right font-medium">raffinate X</th>
                      <th className="py-1 text-right font-medium">extract Y</th>
                      {tool === 'cross' && <th className="py-1 text-right font-medium">λ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(tool === 'cross' ? cross.stages : counter.stages).map((st) => (
                      <tr key={st.stage} className="border-t border-white/[0.03]">
                        <td className="py-0.5 text-plant-200">{st.stage}{'partial' in st && st.partial ? ' (partial)' : ''}</td>
                        <td className="py-0.5 text-right text-plant-100">{fmtL(st.X)}</td>
                        <td className="py-0.5 text-right text-plant-100">{fmtL(st.Y)}</td>
                        {tool === 'cross' && 'lambda' in st && <td className="py-0.5 text-right text-plant-100">{fmt(st.lambda, 2)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </>
          ) : !hn ? (
            <Notice tone="warning">
              {sys.name} is given as distribution data only (carrier and solvent practically immiscible) — there is no ternary diagram.
              Use the cross- or counter-current tool, or pick a system with tie-line data.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
                <Kpi label="Stages N" value={hn.ok ? fmt(hn.N, 2) : '—'} tone={hn.ok ? 'default' : 'muted'} sub={hn.ok ? `${Math.ceil(hn.N - 1e-9)} real stages` : ''} />
                <Kpi label="S/F" value={fmt(s, 3)} sub="solvent / feed (mass)" />
                <Kpi label="S/F min" value={fmt(hn.sMin, 3)} sub="tie-line pinch" />
                <Kpi label="S/F max" value={Number.isFinite(hn.sMax) ? fmt(hn.sMax, 2) : '∞'} sub="M reaches the binodal" />
                <Kpi small label="Extract E₁ · A/C/S" value={hn.E1 ? hn.E1.map((v) => v.toFixed(3)).join(' · ') : '—'} sub={hn.ok ? `${fmt(hn.Emass, 3)} per unit feed` : ''} />
                <Kpi small label="Raffinate R_N · A/C/S" value={hn.RN.map((v) => v.toFixed(3)).join(' · ')} sub={hn.ok ? `${fmt(hn.Rmass, 3)} per unit feed` : ''} />
              </div>
              {hn.error && <Notice tone="error">{hn.error}</Notice>}
              {sys.source === 'unifac' && <Notice tone="info">UNIFAC-predicted binodal and tie lines: right in shape and trend, not a substitute for measured design data.</Notice>}
              <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_380px]">
                <Panel title={`Ternary diagram (mass fractions) · ${sys.name}`}>
                  <ul className="mb-2 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />Binodal & tie lines</li>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />Operating lines through the pole Δ</li>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-plant-100" />Stage tie lines E_n – R_n</li>
                    <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t border-dashed border-plant-500" />Mixing lines F–S, R_N–E₁</li>
                  </ul>
                  <div className="mx-auto max-w-[900px]">
                    <HunterNashDiagram sys={sys} r={hn} layers={hl} />
                  </div>
                </Panel>
                <div className="space-y-2">
                  <Panel title="The construction">
                    <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-plant-300">
                      <li>Mixing point M = (F + S·S/F)/(1 + S/F) on the line F–S.</li>
                      <li>E₁ on the extract branch, on the line from R_N through M (lever rule gives the masses).</li>
                      <li>Pole Δ = F − E₁ = R_N − S: the net flow, the same between every pair of stages.</li>
                      <li>Stage n: R_n is the tie-line partner of E_n; the line from Δ through R_n gives E_(n+1).</li>
                      <li>Stop once R_n is below R_N; the last step counts fractionally.</li>
                    </ol>
                  </Panel>
                  <Panel title="Stages">
                    <table className="w-full font-mono text-[11px]">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-plant-500">
                          <th className="py-1 font-medium">n</th>
                          <th className="py-1 text-right font-medium">E: A / S</th>
                          <th className="py-1 text-right font-medium">R: A / C</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hn.stages.map((st) => (
                          <tr key={st.stage} className="border-t border-white/[0.03]">
                            <td className="py-0.5 text-plant-200">{st.stage}</td>
                            <td className="py-0.5 text-right text-plant-100">{st.E[0].toFixed(3)} / {st.E[2].toFixed(3)}</td>
                            <td className="py-0.5 text-right text-plant-100">{st.R[0].toFixed(3)} / {st.R[1].toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Panel>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="pt-2">
        <EquipmentPanel topic="extraction" />
      </div>
    </div>
  );
}
