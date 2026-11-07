import { useMemo, useState } from 'react';
import { EquipmentPanel } from '@/components/equipment/EquipmentCards';
import { ParamSlider } from '@/components/ParamSlider';
import { Segmented } from '@/components/ui/segmented';
import { DesignDiagram, DesignLegend, FULL, type Window } from '@/components/workbench/DesignDiagram';
import { GillilandChart, GillilandLegend } from '@/components/workbench/GillilandChart';
import { Field, Kpi, Notice, Panel, Select, Toggle } from '@/components/workbench/controls';
import { solveDesign, type CalcTarget } from '@/engine/mtDesign';
import { getSystem, SYSTEM_OPTIONS, type SystemId } from '@/engine/vle/systems';
import { num } from '@/lib/route';
import { cn, fmt } from '@/lib/utils';

const DEFAULTS = {
  system: 'artificial' as SystemId,
  alpha: 2,
  v: 3,
  xF: 0.5,
  xD: 0.95,
  xB: 0.05,
  q: 0.5,
  emOn: false,
  EM: 0.8,
  N: 15,
  feedOn: false,
  feedStage: 8,
  target: 'stages' as CalcTarget,
};

type Focus = 'full' | 'top' | 'feed' | 'bottom';

function focusWindow(focus: Focus, cx: number, cy: number): Window {
  if (focus === 'full' || !Number.isFinite(cx)) return FULL;
  const w = 0.25;
  const clamp = (c: number): [number, number] => {
    const a = Math.min(Math.max(c - w / 2, 0), 1 - w);
    return [a, a + w];
  };
  return { x: clamp(cx), y: clamp(cy) };
}

export default function McCabeThielePage({ params }: { params: URLSearchParams }) {
  const [s, setS] = useState(() => ({
    ...DEFAULTS,
    alpha: num(params, 'alpha', DEFAULTS.alpha),
    v: num(params, 'v', DEFAULTS.v),
    xF: num(params, 'xF', DEFAULTS.xF),
    q: num(params, 'q', DEFAULTS.q),
  }));
  const [focus, setFocus] = useState<Focus>('full');
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const sys = useMemo(() => getSystem(s.system, s.alpha), [s.system, s.alpha]);
  const isAlpha = sys.kind === 'alpha';
  const r = useMemo(
    () =>
      solveDesign({
        y: sys.y,
        azeotrope: sys.azeotrope,
        alpha: isAlpha ? s.alpha : undefined,
        v: s.v,
        xF: s.xF,
        xD: s.xD,
        xB: s.xB,
        q: s.q,
        EM: s.emOn ? s.EM : 1,
        feedStage: s.feedOn ? s.feedStage : null,
        target: s.target,
        N: s.N,
      }),
    [sys, isAlpha, s],
  );

  const sc = r.shortcut;
  const last = r.stages.at(-1);
  const win =
    focus === 'top'
      ? focusWindow(focus, r.xD, r.xD)
      : focus === 'bottom'
        ? focusWindow(focus, r.xB, last ? (r.xB + last.y) / 2 : r.xB)
        : focus === 'feed'
          ? focusWindow(focus, r.intersection.x, r.intersection.y)
          : FULL;

  return (
    <div className="grid gap-2 xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* ---------------- controls ---------------- */}
      <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
        <Panel title="McCabe–Thiele method">
          <p className="mb-3 text-[11px] leading-relaxed text-plant-400">
            Construct the theoretical stages of a binary column. Pick the system and what to solve for, then drag — the
            diagram, the stage count and the Fenske / Underwood / Gilliland limits update live.
          </p>
          <div className="space-y-3">
            <Field label="VLE system">
              <Select value={s.system} options={SYSTEM_OPTIONS} onChange={(v) => set('system', v)} ariaLabel="VLE system" />
            </Field>
            <p className="font-mono text-[9px] leading-relaxed text-plant-500">
              {sys.source}
              {sys.azeotrope !== null && ` · azeotrope at x ≈ ${fmt(sys.azeotrope, 3)}`}
            </p>
            <Field label="Calculation target">
              <Segmented<CalcTarget>
                value={s.target}
                onChange={(v) => set('target', v)}
                options={[
                  { value: 'stages', label: 'Stages', hint: 'Number of stages for given x_D, x_B' },
                  { value: 'bottoms', label: 'x_B', hint: 'Bottoms concentration for given N' },
                  { value: 'distillate', label: 'x_D', hint: 'Distillate concentration for given N' },
                ]}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Parameters">
          <div className="space-y-3">
            <ParamSlider label="Relative volatility" symbol="α" min={1.1} max={6} step={0.01} digits={2} value={s.alpha}
              disabled={!isAlpha} onChange={(v) => set('alpha', v)} />
            <ParamSlider label="Reflux ratio" symbol="v" min={0.1} max={20} step={0.01} digits={2} value={s.v} onChange={(v) => set('v', v)} />
            <ParamSlider label="Feed" symbol="x_F" min={0.01} max={0.99} step={0.005} digits={3} value={s.xF} onChange={(v) => set('xF', v)} />
            <ParamSlider label="Distillate" symbol="x_D" min={0.01} max={0.999} step={0.001} digits={3}
              value={s.target === 'distillate' ? r.xD : s.xD} computed={s.target === 'distillate'} onChange={(v) => set('xD', v)} />
            <ParamSlider label="Bottoms" symbol="x_B" min={0.001} max={0.99} step={0.001} digits={4}
              value={s.target === 'bottoms' ? r.xB : s.xB} computed={s.target === 'bottoms'} onChange={(v) => set('xB', v)} />
            <ParamSlider label="Feed condition" symbol="q" min={-1.5} max={2} step={0.01} digits={2} value={s.q} onChange={(v) => set('q', v)} />
            <div className="space-y-2 border-t border-white/[0.04] pt-3">
              <Toggle checked={s.emOn} onChange={(v) => set('emOn', v)} label="Murphree efficiency" />
              <ParamSlider label="Murphree efficiency" symbol="E_M" min={0.2} max={1} step={0.01} digits={2} value={s.EM}
                disabled={!s.emOn} onChange={(v) => set('EM', v)} />
            </div>
            <ParamSlider label="Stages" symbol="N" min={1} max={60} step={1} digits={0}
              value={s.target === 'stages' ? (Number.isFinite(r.N) ? r.N : s.N) : s.N}
              computed={s.target === 'stages'} onChange={(v) => set('N', Math.round(v))} />
            <div className="space-y-2 border-t border-white/[0.04] pt-3">
              <Toggle checked={s.feedOn} onChange={(v) => setS((p) => ({ ...p, feedOn: v, feedStage: v && r.feedStage ? r.feedStage : p.feedStage }))} label="Set feed stage" />
              <ParamSlider label="Feed stage" symbol="n_F" min={1} max={60} step={1} digits={0}
                value={s.feedOn ? s.feedStage : r.feedStage || s.feedStage} disabled={!s.feedOn} onChange={(v) => set('feedStage', Math.round(v))} />
            </div>
            <button
              type="button"
              onClick={() => setS(DEFAULTS)}
              className="w-full rounded-md border border-signal-alarm/30 py-1.5 font-mono text-[10px] uppercase tracking-wider text-signal-alarm/90 transition-colors hover:bg-signal-alarm/10"
            >
              Reset all
            </button>
          </div>
        </Panel>
      </aside>

      {/* ---------------- results ---------------- */}
      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi label="Stages N" value={r.ok ? fmt(r.N, 2) : '—'} tone={r.ok ? 'default' : 'muted'}
            sub={r.ok ? `${Math.ceil(r.N - 1e-9)} real stages` : 'no staircase'} />
          <Kpi label="Feed stage" value={r.ok ? String(r.feedStage) : '—'} tone={r.ok ? 'default' : 'muted'}
            sub={s.feedOn ? 'set by hand' : 'optimal'} />
          <Kpi label={s.target === 'distillate' ? 'Distillate x_D' : 'Bottoms x_B'} value={fmt(s.target === 'distillate' ? r.xD : r.xB, 4)}
            sub={s.target === 'stages' ? 'specified' : 'solved for N'} />
          <Kpi label="N_min · Fenske" value={sc ? fmt(sc.Nmin, 2) : '—'} tone={sc ? 'default' : 'muted'} sub={sc ? 'total reflux' : 'needs constant α'} />
          <Kpi label="v_min · Underwood" value={sc ? fmt(sc.vmin, 3) : '—'} tone={sc ? 'default' : 'muted'}
            sub={sc ? `v = ${fmt(s.v / sc.vmin, 2)} · v_min` : 'needs constant α'} />
          <Kpi label="N · Gilliland" value={sc?.gilliland != null ? fmt(sc.gilliland, 2) : '—'} tone={sc?.gilliland != null ? 'default' : 'muted'}
            sub={sc?.gilliland != null ? `staircase ${r.ok ? fmt(r.N, 2) : '—'}` : s.emOn ? 'off with E_M' : sc ? 'v ≤ v_min' : 'needs constant α'} />
        </div>

        {r.error && <Notice tone="error">{r.error.message}</Notice>}
        {r.mirrored && r.ok && (
          <Notice tone="info">
            Above the azeotrope: x_D &lt; x_F &lt; x_B. The column is solved for the other component and turned back through
            180° — the staircase runs under the diagonal.
          </Notice>
        )}

        <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <Panel
            title="y–x diagram"
            aside={
              <div className="w-64">
                <Segmented<Focus>
                  value={focus}
                  onChange={setFocus}
                  options={[
                    { value: 'full', label: 'Full' },
                    { value: 'top', label: 'Top' },
                    { value: 'feed', label: 'Feed' },
                    { value: 'bottom', label: 'Bottom' },
                  ]}
                />
              </div>
            }
          >
            <div className="mb-2">
              <DesignLegend murphree={s.emOn} />
            </div>
            <div className="mx-auto max-w-[760px]">
              <DesignDiagram r={r} y={sys.y} azeotrope={sys.azeotrope} murphree={s.emOn} win={win} />
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-plant-500">
              Steps from x_D (total condenser, no stage) down to x_B; every step is an equilibrium stage, the reboiler
              included, and the last one counts fractionally. Hover a stage corner for its compositions; zoom with the
              buttons above.
            </p>
          </Panel>

          <div className="space-y-2">
            <Panel title="Shortcut methods">
              {sc ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="rounded border border-white/[0.05] p-2">
                      <p className="text-plant-500">Fenske</p>
                      <p className="text-plant-100">N_min = {fmt(sc.Nmin, 2)}</p>
                    </div>
                    <div className="rounded border border-white/[0.05] p-2">
                      <p className="text-plant-500">Underwood</p>
                      <p className="text-plant-100">v_min = {fmt(sc.vmin, 3)}</p>
                    </div>
                  </div>
                  {sc.curve.length > 0 && (
                    <>
                      <GillilandLegend />
                      <GillilandChart sc={sc} v={s.v} Nstair={r.ok ? r.N : null} />
                      <p className="text-[10px] leading-relaxed text-plant-500">
                        Shaded: 1.05 – 1.5 · v_min, the usual range of the economic optimum (column height vs. energy).
                        {s.emOn && ' Gilliland is a fit to ideal stages — off while E_M < 1.'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-plant-400">
                  Fenske, Underwood and Gilliland need a constant relative volatility — choose the artificial system. On a
                  real system, find the minimum reflux by lowering v until the staircase no longer reaches x_B.
                </p>
              )}
            </Panel>

            <Panel title="Stage table">
              {r.stages.length ? (
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full font-mono text-[11px]">
                    <thead className="sticky top-0 bg-plant-900">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-plant-500">
                        <th className="py-1 font-medium">n</th>
                        <th className="py-1 font-medium">Section</th>
                        <th className="py-1 text-right font-medium">x</th>
                        <th className="py-1 text-right font-medium">y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.stages.map((st) => (
                        <tr key={st.stage} className={cn('border-t border-white/[0.03]', st.isFeed && 'bg-signal-liquid/[0.07]')}>
                          <td className="py-0.5 text-plant-200">{st.stage}</td>
                          <td className="py-0.5 text-plant-300">
                            {st.isFeed ? 'feed' : st.section}
                            {st.partial && ` · ${fmt(r.N - (st.stage - 1), 2)} of a stage`}
                          </td>
                          <td className="py-0.5 text-right text-plant-100">{fmt(st.x, 4)}</td>
                          <td className="py-0.5 text-right text-plant-100">{fmt(st.y, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-plant-500">No staircase for these settings.</p>
              )}
            </Panel>
          </div>
        </div>

        <Panel title="Where the model stops">
          <ul className="grid gap-x-6 gap-y-1 text-[11px] leading-relaxed text-plant-400 md:grid-cols-2">
            <li>Constant molar overflow: straight operating lines, one feed, two products, total condenser.</li>
            <li>All specifications on one side of an azeotrope; above it the column runs the other way round.</li>
            <li>Shortcuts (Fenske / Underwood / Gilliland) only for a constant α.</li>
            <li>One Murphree efficiency for every tray, the reboiler included.</li>
            <li>The construction gives up after 200 steps — below or just above the minimum reflux.</li>
            <li>Datasheets are joined by straight lines between the tabulated points.</li>
          </ul>
        </Panel>
      </div>
      <div className="space-y-2 pt-2">
        <EquipmentPanel topic="distillation" />
        <EquipmentPanel topic="auxiliary" />
      </div>
    </div>
  );
}
