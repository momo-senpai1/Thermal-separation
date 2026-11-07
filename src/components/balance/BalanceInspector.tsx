import { useEffect, useState } from 'react';
import { PRESET_CURVES, parseTable } from '@/engine/balance/columnMT';
import { nKey, qKey, QKey, xKey } from '@/engine/balance/solver';
import type { CurveSpec } from '@/engine/balance/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { DEFAULT_COLUMN, useBalance, useBalanceSolution, type BEdge, type BNode } from '@/store/balanceStore';
import { Segmented } from '@/components/ui/segmented';
import { kindLabel } from './BalanceGraph';
import { num } from './texFormat';

const inputCls =
  'w-full rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 font-mono text-xs text-plant-100 outline-none placeholder:text-signal-liquid/80 focus:border-signal-liquid/50';

const parse = (s: string): number | null => {
  const v = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
};

/** Number field where empty means "unknown"; the computed value shows as placeholder. */
function SpecInput({ label, value, computed, unit, onChange }: { label: string; value: number | null | undefined; computed?: number; unit?: string; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    setText((cur) => (parse(cur) === (value ?? null) ? cur : value === null || value === undefined ? '' : String(value)));
  }, [value]);
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_96px_44px] items-center gap-2 text-[11px] text-plant-300">
      <span className="truncate">{label}</span>
      <input
        className={inputCls}
        inputMode="decimal"
        value={text}
        placeholder={computed !== undefined ? `= ${num(computed)}` : '?'}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
      />
      <span className="font-mono text-[9px] text-plant-500">{unit}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-white/[0.04] px-4 py-3">
      <p className="tag text-plant-500">{t(title)}</p>
      {children}
    </div>
  );
}

function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input aria-label={t('Name')} className={cn(inputCls, 'font-sans')} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function StreamPanel({ e }: { e: BEdge }) {
  const update = useBalance((s) => s.updateStream);
  const components = useBalance((s) => s.components);
  const { result } = useBalanceSolution();
  const d = e.data!;
  const setX = (i: number, v: number | null) => update(e.id, { x: components.map((_, j) => (j === i ? v : d.x[j] ?? null)) });
  return (
    <>
      <Section title="Stream">
        <NameInput value={d.name} onChange={(name) => update(e.id, { name })} />
        <SpecInput label={t('Molar flow ṅ')} unit="kmol/h" value={d.n} computed={result.values.get(nKey(e.id))} onChange={(n) => update(e.id, { n })} />
      </Section>
      <Section title="Mole fractions">
        {components.map((c, i) => (
          <SpecInput key={i} label={`x ${c}`} value={d.x[i]} computed={result.values.get(xKey(e.id, i))} onChange={(v) => setX(i, v)} />
        ))}
        <div className="flex flex-wrap gap-1 pt-1">
          {components.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => update(e.id, { x: components.map((_, j) => (j === i ? 1 : 0)) })}
              className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-plant-300 hover:border-signal-liquid/40 hover:text-signal-liquid"
            >
              {t('pure {comp}', { comp: c })}
            </button>
          ))}
          <button
            type="button"
            onClick={() => update(e.id, { x: components.map(() => null) })}
            className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-plant-400 hover:text-plant-100"
          >
            {t('all unknown')}
          </button>
        </div>
      </Section>
      <Section title="Thermal state">
        <SpecInput label={t('q (1 = boiling liquid, 0 = saturated vapour)')} value={d.q} computed={result.values.get(qKey(e.id))} onChange={(q) => update(e.id, { q })} />
        <p className="text-[10px] leading-relaxed text-plant-500">{t('Needed for feeds of columns with McCabe–Thiele and around heat exchangers.')}</p>
      </Section>
      <p className="px-4 py-3 text-[10px] leading-relaxed text-plant-500">{t('Leave a field empty when the value is unknown; the computed value then appears in it.')}</p>
    </>
  );
}

function CurveEditor({ id, curve }: { id: string; curve: CurveSpec }) {
  const updateColumn = useBalance((s) => s.updateColumn);
  const preset = curve.kind === 'alpha' ? 'alpha' : curve.preset ?? 'table';
  const [text, setText] = useState(curve.kind === 'table' ? curve.points.map((p) => `${p[0]} ${p[1]}`).join('\n') : '0 0\n0.5 0.7\n1 1');
  useEffect(() => {
    if (curve.kind === 'table' && curve.preset) setText(curve.points.map((p) => `${p[0]} ${p[1]}`).join('\n'));
  }, [curve]);
  return (
    <div className="space-y-2">
      <select
        aria-label={t('Equilibrium curve')}
        value={preset}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === 'alpha') updateColumn(id, { curve: { kind: 'alpha', alpha: 2.5 } });
          else if (v === 'table') updateColumn(id, { curve: { kind: 'table', points: parseTable(text) } });
          else updateColumn(id, { curve: { kind: 'table', preset: v, points: PRESET_CURVES[v]!.points } });
        }}
        className="w-full rounded-md border border-white/[0.08] bg-plant-950/70 px-2 py-1.5 text-xs text-plant-100 outline-none"
      >
        <option value="alpha">{t('Constant relative volatility α')}</option>
        <option value="table">{t('Own table (x y per line)')}</option>
        {Object.entries(PRESET_CURVES).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label}
          </option>
        ))}
      </select>
      {curve.kind === 'alpha' ? (
        <SpecInput label="α" value={curve.alpha} onChange={(a) => a !== null && updateColumn(id, { curve: { kind: 'alpha', alpha: a } })} />
      ) : (
        <textarea
          aria-label={t('Equilibrium table')}
          rows={6}
          value={text}
          onChange={(ev) => {
            setText(ev.target.value);
            updateColumn(id, { curve: { kind: 'table', points: parseTable(ev.target.value) } });
          }}
          className={cn(inputCls, 'resize-y leading-4')}
        />
      )}
      <p className="text-[10px] leading-relaxed text-plant-500">{t('y*(x) of the diagram component; read the table off the exercise diagram to reproduce its solution.')}</p>
    </div>
  );
}

function UnitPanel({ n }: { n: BNode }) {
  const update = useBalance((s) => s.updateUnit);
  const updateColumn = useBalance((s) => s.updateColumn);
  const components = useBalance((s) => s.components);
  const { result } = useBalanceSolution();
  const d = n.data;
  const col = d.column ?? DEFAULT_COLUMN;
  return (
    <>
      <Section title={kindLabel(d.kind)}>
        <NameInput value={d.name} onChange={(name) => update(n.id, { name })} />
      </Section>
      {d.kind === 'exchanger' && (
        <Section title="Heat">
          <SpecInput label={t('Q̇ removed (+ cooling)')} unit="kJ/h" value={d.Q} computed={result.values.get(QKey(n.id))} onChange={(Q) => update(n.id, { Q })} />
          <SpecInput label={t('Δh_v of the stream')} unit="kJ/kmol" value={d.dHv} onChange={(dHv) => update(n.id, { dHv })} />
          <p className="text-[10px] leading-relaxed text-plant-500">{t('Energy balance: ṅ·(q_out − q_in)·Δh_v = Q̇. Removing heat condenses vapour and raises q.')}</p>
        </Section>
      )}
      {d.kind === 'column' && (
        <Section title="McCabe–Thiele">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-plant-300">
            <input type="checkbox" checked={col.mt} onChange={(ev) => updateColumn(n.id, { mt: ev.target.checked })} className="h-3.5 w-3.5 accent-[rgb(var(--sig-liquid))]" />
            {t('Construct the stages for this column')}
          </label>
          {col.mt && (
            <>
              <SpecInput label={t('Reflux ratio v')} value={col.v} onChange={(v) => v !== null && updateColumn(n.id, { v })} />
              <Segmented
                value={col.condenser}
                onChange={(condenser) => updateColumn(n.id, { condenser })}
                options={[
                  { value: 'total', label: 'Total condenser', hint: 'Liquid distillate' },
                  { value: 'partial', label: 'Partial condenser', hint: 'Vapour distillate, counts as a stage' },
                ]}
              />
              <label className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2 text-[11px] text-plant-300">
                <span>{t('Diagram component')}</span>
                <select
                  value={col.key}
                  onChange={(ev) => updateColumn(n.id, { key: Number(ev.target.value) })}
                  className="rounded-md border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-xs text-plant-100 outline-none"
                >
                  {components.map((c, i) => (
                    <option key={i} value={i}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <CurveEditor id={n.id} curve={col.curve} />
            </>
          )}
          <p className="text-[10px] leading-relaxed text-plant-500">{t('Top outlet = distillate, bottom outlet = bottoms; every inlet is a feed.')}</p>
        </Section>
      )}
      {(d.kind === 'splitter' || d.kind === 'exchanger') && (
        <p className="px-4 py-3 text-[10px] leading-relaxed text-plant-500">{t('All outlets have the composition of the inlet.')}</p>
      )}
    </>
  );
}

export function BalanceInspector() {
  const node = useBalance((s) => s.nodes.find((n) => n.selected));
  const edge = useBalance((s) => s.edges.find((e) => e.selected));
  return (
    <aside className="glass flex w-72 shrink-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.05] px-4 py-3">
        <p className="tag text-plant-400">{t('Specification')}</p>
        <p className="mt-0.5 text-xs text-plant-200">{node ? node.data.name : edge ? `${t('Stream')} ${edge.data?.name}` : t('Select a unit or stream')}</p>
      </div>
      {edge ? (
        <StreamPanel key={edge.id} e={edge} />
      ) : node ? (
        <UnitPanel key={node.id} n={node} />
      ) : (
        <div className="space-y-2 px-4 py-4 text-[11px] leading-relaxed text-plant-400">
          <p>{t('1. Draw the process of the exercise: drag units in and connect them.')}</p>
          <p>{t('2. Click each stream and enter what the exercise gives; leave the rest empty.')}</p>
          <p>{t('3. The solution path below fills in as soon as the balances determine the unknowns.')}</p>
          <p>{t('4. For stage numbers, enable McCabe–Thiele on a column and enter v and the equilibrium curve.')}</p>
        </div>
      )}
    </aside>
  );
}
