import type { DragEvent } from 'react';
import type { UnitType } from '@/types/process';
import { MaterialPicker } from './MaterialPicker';
import { UNIT_ICONS } from './unitIcons';
import { t } from '@/i18n';
import { ModeSwitch } from '@/components/balance/BalancePalette';

export const DND_MIME = 'application/x-thermal-unit';

type Item = { type: UnitType; tag: string; name: string; desc: string; icon: JSX.Element };
const ITEMS: Item[] = [
  { type: 'feed', tag: 'F', name: 'Feed', desc: 'Boundary stream', icon: UNIT_ICONS.feed },
  { type: 'mixer', tag: 'M', name: 'Mixer', desc: '2 → 1 adiabatic', icon: UNIT_ICONS.mixer },
  { type: 'heater', tag: 'E', name: 'Heater', desc: 'Duty Q [kW]', icon: UNIT_ICONS.heater },
  { type: 'distillation', tag: 'T', name: 'Column', desc: 'Binary rectification', icon: UNIT_ICONS.distillation },
  { type: 'flash', tag: 'V', name: 'Flash drum', desc: 'Q, P → vapour + liquid', icon: UNIT_ICONS.flash },
  { type: 'batch', tag: 'B', name: 'Batch still', desc: 'Charge → distillate + residue', icon: UNIT_ICONS.batch },
  { type: 'splitter', tag: 'S', name: 'Splitter', desc: '1 → 2 by fraction', icon: UNIT_ICONS.splitter },
  { type: 'cooler', tag: 'E', name: 'Cooler / condenser', desc: 'Duty Q < 0', icon: UNIT_ICONS.cooler },
  { type: 'pump', tag: 'P', name: 'Pump', desc: 'Raise pressure', icon: UNIT_ICONS.pump },
  { type: 'valve', tag: 'FV', name: 'Valve', desc: 'Let down · flash', icon: UNIT_ICONS.valve },
  { type: 'evaporator', tag: 'EV', name: 'Evaporator', desc: 'Set V/F → duty', icon: UNIT_ICONS.evaporator },
  { type: 'absorber', tag: 'C', name: 'Absorber / stripper', desc: 'Gas–liquid block', icon: UNIT_ICONS.absorber },
  { type: 'extractor', tag: 'X', name: 'Extraction column', desc: 'Liquid–liquid block', icon: UNIT_ICONS.extractor },
  { type: 'evaptrain', tag: 'EV', name: 'Multi-effect evaporator', desc: 'Concentration block', icon: UNIT_ICONS.evaptrain },
  { type: 'crystallizer', tag: 'CR', name: 'Crystallizer', desc: 'Solid–liquid block', icon: UNIT_ICONS.crystallizer },
  { type: 'dryer', tag: 'D', name: 'Dryer', desc: 'Moist solid block', icon: UNIT_ICONS.dryer },
];

const byType = (t: UnitType) => ITEMS.find((i) => i.type === t)!;
const GROUPS: { title: string; types: UnitType[] }[] = [
  { title: 'Streams', types: ['feed', 'mixer', 'splitter'] },
  { title: 'Heat & pressure', types: ['heater', 'cooler', 'pump', 'valve'] },
  { title: 'Separation', types: ['distillation', 'flash', 'evaporator', 'batch'] },
  { title: 'Process blocks', types: ['absorber', 'extractor', 'evaptrain', 'crystallizer', 'dryer'] },
];

export function Palette() {
  const onDragStart = (e: DragEvent, type: UnitType) => {
    e.dataTransfer.setData(DND_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="glass flex w-60 shrink-0 flex-col overflow-y-auto">
      <ModeSwitch />
      <MaterialPicker />
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Equipment')}</p>
        <p className="mt-0.5 text-[10px] text-plant-500">{t('Drag onto the flowsheet')}</p>
      </div>
      <div className="space-y-2 p-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="tag px-2 pb-1 pt-1 text-plant-500">{t(g.title)}</p>
            <ul className="space-y-0.5">
              {g.types.map(byType).map((it) => (
                <li
            key={it.type}
            draggable
            onDragStart={(e) => onDragStart(e, it.type)}
            className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-white/[0.06] hover:bg-white/[0.03] active:cursor-grabbing"
          >
            <span className="grid h-8 w-8 place-items-center rounded border border-white/[0.06] bg-plant-950/70">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-none stroke-plant-300 stroke-[1.4] transition-colors group-hover:stroke-signal-liquid"
              >
                {it.icon}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-plant-200">{t(it.name)}</span>
              <span className="block truncate text-[10px] text-plant-500">{t(it.desc)}</span>
            </span>
            <span className="tag text-plant-500">{it.tag}</span>
          </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-white/[0.05] p-3 text-[10px] leading-relaxed text-plant-500">
        <p className="tag mb-1 text-plant-400">Stream legend</p>
        <Legend color="rgb(var(--sig-liquid))" label="Liquid · q ≥ 1" />
        <Legend color="rgb(var(--sig-two))" label="Two-phase · 0 < q < 1" />
        <Legend color="rgb(var(--sig-vapor))" label="Vapour · q ≤ 0" />
        <Legend color="rgb(var(--plant-500))" label="Unresolved" />
      </div>
    </aside>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
      <span className="font-mono">{t(label)}</span>
    </div>
  );
}
