import { Plus, X } from 'lucide-react';
import type { DragEvent } from 'react';
import type { BUnitKind } from '@/engine/balance/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useBalance, type FlowsheetMode } from '@/store/balanceStore';
import { BALANCE_DND, KIND_ICON, kindLabel } from './BalanceGraph';

/** Simulation ↔ balance-task switch, shown at the top of both palettes. */
export function ModeSwitch() {
  const mode = useBalance((s) => s.mode);
  const setMode = useBalance((s) => s.setMode);
  const opts: { id: FlowsheetMode; label: string }[] = [
    { id: 'sim', label: 'Simulation' },
    { id: 'task', label: 'Balance task' },
  ];
  return (
    <div className="border-b border-white/[0.05] p-2">
      <div role="group" aria-label={t('Flowsheet mode')} className="grid grid-cols-2 gap-1 rounded-md border border-white/[0.06] bg-plant-950/60 p-0.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={mode === o.id}
            onClick={() => setMode(o.id)}
            className={cn(
              'rounded px-2 py-1 text-[11px] transition-colors',
              mode === o.id ? 'bg-signal-liquid/15 text-signal-liquid shadow-[inset_0_0_0_1px_rgb(var(--sig-liquid)/0.4)]' : 'text-plant-400 hover:text-plant-200',
            )}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

const GROUPS: { title: string; items: { kind: BUnitKind; desc: string }[] }[] = [
  {
    title: 'Streams',
    items: [
      { kind: 'source', desc: 'Stream entering the system' },
      { kind: 'sink', desc: 'Stream leaving the system' },
      { kind: 'mixer', desc: 'Several in · one out' },
      { kind: 'splitter', desc: 'Same composition in all outlets' },
    ],
  },
  {
    title: 'Heat & pressure',
    items: [
      { kind: 'heater', desc: 'Q̇ supplied evaporates: q falls' },
      { kind: 'cooler', desc: 'Q̇ removed condenses: q rises' },
      { kind: 'pump', desc: 'Flow and composition unchanged' },
      { kind: 'valve', desc: 'Flow and composition unchanged' },
    ],
  },
  {
    title: 'Separation',
    items: [
      { kind: 'column', desc: 'Feeds in · distillate and bottoms · McCabe–Thiele' },
      { kind: 'flash', desc: 'Vapour and liquid out' },
      { kind: 'evaporator', desc: 'Vapour and concentrate out' },
    ],
  },
  {
    title: 'Process blocks',
    items: [
      { kind: 'absorber', desc: 'Gas and solvent in · gas and liquid out' },
      { kind: 'extractor', desc: 'Feed and solvent in · extract and raffinate out' },
      { kind: 'crystallizer', desc: 'Mother liquor and crystals out' },
      { kind: 'dryer', desc: 'Wet solid and air in · exhaust and dry solid out' },
      { kind: 'unit', desc: 'Only the balances' },
    ],
  },
];

export function BalancePalette() {
  const components = useBalance((s) => s.components);
  const setComponentName = useBalance((s) => s.setComponentName);
  const addComponent = useBalance((s) => s.addComponent);
  const removeComponent = useBalance((s) => s.removeComponent);
  const loadExample = useBalance((s) => s.loadExample);
  const clear = useBalance((s) => s.clear);
  const onDragStart = (e: DragEvent, kind: BUnitKind) => {
    e.dataTransfer.setData(BALANCE_DND, kind);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <aside className="glass flex w-60 shrink-0 flex-col overflow-y-auto">
      <ModeSwitch />
      <div className="space-y-2 border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Components')}</p>
        <ul className="space-y-1">
          {components.map((c, i) => (
            <li key={i} className="flex items-center gap-1">
              <span className="w-4 font-mono text-[10px] text-plant-500">{i + 1}</span>
              <input
                aria-label={t('Component {n}', { n: i + 1 })}
                value={c}
                onChange={(e) => setComponentName(i, e.target.value)}
                className="min-w-0 flex-1 rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-xs text-plant-100 outline-none focus:border-signal-liquid/50"
              />
              <button
                type="button"
                aria-label={t('Remove component {name}', { name: c })}
                disabled={components.length <= 2}
                onClick={() => removeComponent(i)}
                className="grid h-6 w-6 place-items-center rounded text-plant-500 hover:text-signal-alarm disabled:opacity-30"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addComponent} className="flex items-center gap-1 text-[11px] text-signal-liquid hover:underline">
          <Plus className="h-3 w-3" /> {t('Add component')}
        </button>
      </div>
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Units')}</p>
        <p className="mt-0.5 text-[10px] text-plant-500">{t('Drag onto the flowsheet, then connect the handles')}</p>
      </div>
      <div className="space-y-2 p-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="tag px-2 pb-1 pt-1 text-plant-500">{t(g.title)}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li
                  key={it.kind}
                  draggable
                  onDragStart={(e) => onDragStart(e, it.kind)}
                  className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-white/[0.06] hover:bg-white/[0.03] active:cursor-grabbing"
                >
                  <span className="grid h-8 w-8 place-items-center rounded border border-white/[0.06] bg-plant-950/70">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-plant-300 stroke-[1.4] transition-colors group-hover:stroke-signal-liquid">
                      {KIND_ICON[it.kind]}
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-plant-200">{kindLabel(it.kind)}</span>
                    <span className="block truncate text-[10px] text-plant-500">{t(it.desc)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-1.5 border-t border-white/[0.05] p-3">
        <p className="tag text-plant-400">{t('Examples')}</p>
        <button
          type="button"
          onClick={loadExample}
          className="block w-full rounded border border-white/[0.08] px-2 py-1.5 text-left text-[11px] text-plant-200 transition-colors hover:border-signal-liquid/40 hover:text-signal-liquid"
        >
          {t('THF pressure-swing distillation (exercise)')}
        </button>
        <button
          type="button"
          onClick={clear}
          className="block w-full rounded border border-white/[0.08] px-2 py-1.5 text-left text-[11px] text-plant-300 transition-colors hover:border-signal-alarm/40 hover:text-signal-alarm"
        >
          {t('Empty sheet')}
        </button>
      </div>
    </aside>
  );
}
