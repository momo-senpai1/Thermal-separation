import { useState } from 'react';
import { CartesianGrid, ComposedChart, Label, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { axisTick, VIZ } from '@/components/analysis/vizTokens';
import { Notice } from '@/components/workbench/controls';
import type { ColumnAnalysis } from '@/engine/balance/columns';
import { curveFn } from '@/engine/balance/columnMT';
import { nKey, qKey, xKey } from '@/engine/balance/solver';
import type { BProblem } from '@/engine/balance/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useBalanceSolution } from '@/store/balanceStore';
import { Tex } from './Tex';
import { compTex, eqTex, eqTitle, num, resultTex, varName } from './texFormat';

type Tab = 'steps' | 'streams' | 'columns';

export function BalanceResults() {
  const [tab, setTab] = useState<Tab>('steps');
  const { columns, result } = useBalanceSolution();
  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'steps', label: 'Solution path', badge: String(result.steps.length) },
    { id: 'streams', label: 'Stream table' },
    { id: 'columns', label: 'McCabe–Thiele', badge: columns.length ? String(columns.length) : undefined },
  ];
  return (
    <section className="glass flex h-[46%] min-h-[240px] shrink-0 flex-col overflow-hidden">
      <div role="tablist" className="flex items-center gap-1 border-b border-white/[0.05] px-2 py-1.5">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            type="button"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] transition-colors',
              tab === tb.id ? 'bg-signal-liquid/15 text-signal-liquid' : 'text-plant-300 hover:bg-white/[0.04]',
            )}
          >
            {t(tb.label)}
            {tb.badge && <span className="rounded-sm bg-white/[0.06] px-1 font-mono text-[9px] text-plant-400">{tb.badge}</span>}
          </button>
        ))}
        <span className="ml-auto pr-2 font-mono text-[10px]">
          {result.missing.length ? (
            <span className="text-signal-vapor">{t('{n} unknowns open', { n: result.missing.length })}</span>
          ) : (
            <span className="text-signal-ok">{t('all unknowns determined')}</span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'steps' ? <Steps /> : tab === 'streams' ? <StreamTable /> : <Columns />}
      </div>
    </section>
  );
}

function Steps() {
  const { problem, result } = useBalanceSolution();
  if (!problem.streams.length) return <Notice tone="info">{t('Draw the process first: drag units onto the sheet and connect them.')}</Notice>;
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {result.steps.map((s, i) => (
          <li key={i} className="rounded-md border border-white/[0.05] bg-white/[0.015] px-3 py-2">
            <p className="mb-1 text-[11px] text-plant-300">
              <span className="mr-2 font-mono text-plant-500">{i + 1}.</span>
              {s.how === 'system'
                ? t('{n} equations, {n} unknowns', { n: s.eqs.length }) + ': ' + s.eqs.map((e) => eqTitle(e, problem)).join(' · ')
                : eqTitle(s.eqs[0]!, problem)}
            </p>
            <div className="grid gap-x-6 text-[13px] text-plant-100 md:grid-cols-2">
              {s.eqs.map((e) => (
                <div key={e.id} className="min-w-0">
                  <Tex math={eqTex(e, problem)} block />
                  <Tex math={eqTex(e, problem, s.known)} block className="text-plant-300" />
                </div>
              ))}
            </div>
            {s.how === 'zero' && <p className="text-[10px] text-plant-500">{t('All mole fractions are ≥ 0, so each remaining one is zero.')}</p>}
            <div className="mt-1 text-[13px] text-signal-liquid">
              <Tex math={`\\Rightarrow\\ ${resultTex(s, problem)}`} block />
            </div>
          </li>
        ))}
      </ol>
      {result.missing.length > 0 && (
        <Notice tone="warning">
          {t('Not determined yet: {list}. Enter more of the given values (a flow, a composition) or check the connections.', {
            list: result.missing.slice(0, 12).map((k) => varName(k, problem)).join(', ') + (result.missing.length > 12 ? ' …' : ''),
          })}
        </Notice>
      )}
      {result.warnings.includes('inconsistent') && (
        <Notice tone="error">{t('The given values contradict each other: a balance does not close (see the checks).')}</Notice>
      )}
      {result.warnings.some((w) => w.startsWith('negative') || w.startsWith('range')) && (
        <Notice tone="warning">{t('Some results are negative or outside 0…1; check the given values.')}</Notice>
      )}
      {result.checks.length > 0 && (
        <details className="rounded-md border border-white/[0.05] px-3 py-2 text-[11px] text-plant-400">
          <summary className="cursor-pointer">
            {t('Checks')}: {result.checks.filter((c) => c.ok).length}/{result.checks.length} {t('balances close')}
          </summary>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
            {result.checks.map((c) => (
              <li key={c.eq.id} className={c.ok ? 'text-plant-400' : 'text-signal-alarm'}>
                {c.ok ? '✓' : '✕'} {eqTitle(c.eq, problem)} · Δ = {num(c.residual, 6)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StreamTable() {
  const { problem, result } = useBalanceSolution();
  const units = new Map(problem.units.map((u) => [u.id, u.name]));
  const cell = (given: number | null | undefined, key: string, d = 4) => {
    const v = result.values.get(key);
    const g = given !== null && given !== undefined;
    return <td key={key} className={cn('px-2 py-1 text-right font-mono', g ? 'text-plant-200' : v !== undefined ? 'text-signal-liquid' : 'text-plant-600')}>{v !== undefined ? num(v, d) : '?'}</td>;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-plant-500">
            <th className="px-2 py-1 text-left font-normal">{t('Stream')}</th>
            <th className="px-2 py-1 text-left font-normal">{t('from → to')}</th>
            <th className="px-2 py-1 text-right font-normal">ṅ [kmol/h]</th>
            {problem.components.map((c, i) => (
              <th key={i} className="px-2 py-1 text-right font-normal">
                <Tex math={`x_{${compTex(c)}}`} />
              </th>
            ))}
            <th className="px-2 py-1 text-right font-normal">q</th>
          </tr>
        </thead>
        <tbody>
          {problem.streams.map((s) => (
            <tr key={s.id} className="border-b border-white/[0.03]">
              <td className="px-2 py-1 font-mono text-plant-100">{s.name}</td>
              <td className="px-2 py-1 text-plant-400">
                {units.get(s.from)} → {units.get(s.to)}
              </td>
              {cell(s.n, nKey(s.id), 2)}
              {problem.components.map((_, i) => cell(s.x[i], xKey(s.id, i)))}
              {s.q !== null || result.values.has(qKey(s.id)) ? cell(s.q, qKey(s.id)) : <td className="px-2 py-1 text-right font-mono text-plant-600">–</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-plant-500">{t('White: given · coloured: computed · ?: still unknown')}</p>
    </div>
  );
}

const MISSING: Record<string, string> = {
  ports: 'Connect exactly one stream to the top outlet and one to the bottom outlet.',
  flows: 'The balances do not yet give flow and composition of: {detail}.',
  q: 'Enter the thermal state q of: {detail}.',
  curve: 'Enter an equilibrium curve (at least two points).',
};
const MT_ERRORS: Record<string, string> = {
  reflux: 'The reflux ratio must be positive.',
  flows: 'Distillate and bottoms flows must be positive.',
  nofeed: 'The column has no feed.',
  order: 'Distillate and bottoms have the same composition.',
  vapour: 'A feed takes more vapour than the column carries (V ≤ 0): check q and v.',
  pinch: 'The staircase pinches against the equilibrium curve: the reflux ratio is too low for this separation, or the product lies beyond an azeotrope.',
  steps: 'More than 200 stages: the column operates at its minimum reflux.',
};

function Columns() {
  const { columns, problem } = useBalanceSolution();
  if (!columns.length) return <Notice tone="info">{t('Select a column and enable McCabe–Thiele to construct its stages.')}</Notice>;
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {columns.map((c) => (
        <ColumnCard key={c.unitId} c={c} problem={problem} />
      ))}
    </div>
  );
}

function ColumnCard({ c, problem }: { c: ColumnAnalysis; problem: BProblem }) {
  const unit = problem.units.find((u) => u.id === c.unitId)!;
  const cs = unit.column!;
  const comp = problem.components[cs.key] ?? '?';
  const r = c.result;
  const f = curveFn(cs.curve);
  const curve = f ? Array.from({ length: 201 }, (_, i) => ({ x: i / 200, y: f(i / 200) })) : [];
  return (
    <div className="rounded-md border border-white/[0.05] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-plant-100">{c.name}</p>
        {r?.ok && (
          <p className="font-mono text-[11px] text-signal-liquid">
            N<sub>th</sub> = {num(r.N, 2)} → {Math.ceil(r.N - 1e-9)} {t('stages')}
          </p>
        )}
      </div>
      {c.missing && <Notice tone="info">{t(MISSING[c.missing.code]!, { detail: c.missing.detail ?? '' })}</Notice>}
      {r && !r.ok && <Notice tone="error">{t(MT_ERRORS[r.error ?? 'pinch'] ?? r.error ?? '')}</Notice>}
      {(r || f) && (
        <ResponsiveContainer width="100%" aspect={1.25} maxHeight={380}>
          <ComposedChart margin={{ top: 8, right: 12, bottom: 22, left: 0 }}>
            <CartesianGrid stroke={VIZ.grid} />
            <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false}>
              <Label value={`x ${comp}`} position="bottom" offset={4} style={{ fill: VIZ.textMuted, fontSize: 10 }} />
            </XAxis>
            <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} stroke={VIZ.axis} tickLine={false} width={34}>
              <Label value={`y ${comp}`} angle={-90} position="insideLeft" offset={8} style={{ fill: VIZ.textMuted, fontSize: 10, textAnchor: 'middle' }} />
            </YAxis>
            <Line data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" stroke={VIZ.axis} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line data={curve} dataKey="y" stroke={VIZ.equilibrium} strokeWidth={2} dot={false} isAnimationActive={false} />
            {r?.ok &&
              r.opLines.map((seg, i) => <Line key={`o${i}`} data={seg} dataKey="y" stroke={VIZ.operating} strokeWidth={1.6} dot={false} isAnimationActive={false} />)}
            {r?.ok &&
              r.qLines.map((ql, i) => (
                <Line key={`q${i}`} data={ql.pts} dataKey="y" stroke={VIZ.qLine} strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
              ))}
            {r && r.staircase.length > 1 && <Line data={r.staircase} dataKey="y" stroke={VIZ.text} strokeWidth={1.2} dot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <ul className="mt-1 flex flex-wrap gap-x-4 text-[10px] text-plant-300">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.equilibrium }} />{t('Equilibrium')}</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.operating }} />{t('Operating lines')}</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.qLine }} />{t('q-lines')}</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: VIZ.text }} />{t('Stages')}</li>
      </ul>
      {r?.ok && (
        <div className="mt-2 space-y-0.5 font-mono text-[10px] text-plant-400">
          <p>
            v = {num(cs.v, 3)} · {t(cs.condenser === 'partial' ? 'partial condenser (counted as a stage)' : 'total condenser')} · {t('reboiler counted as a stage')}
          </p>
          {r.feedStages.map((fs) => (
            <p key={fs.name}>
              {t('Feed {name} on stage {n} (counted from the top)', { name: fs.name, n: fs.stage })}
            </p>
          ))}
          {r.sections.map((s, i) => (
            <p key={i}>
              {t('Section {n}', { n: i + 1 })}: L = {num(s.L, 1)}, V = {num(s.V, 1)} kmol/h, L/V = {num(s.slope, 4)}
            </p>
          ))}
          {r.mirrored && <p className="text-plant-500">{t('{comp} leaves at the bottom here (beyond the azeotrope); the steps run below the diagonal.', { comp })}</p>}
        </div>
      )}
    </div>
  );
}
