import type { DragEvent } from 'react';
import type { UnitType } from '@/types/process';
import { MaterialPicker } from './MaterialPicker';
import { t } from '@/i18n';

export const DND_MIME = 'application/x-thermal-unit';

type Item = { type: UnitType; tag: string; name: string; desc: string; icon: JSX.Element };
const BASE: Item[] = [
  {
    type: 'feed',
    tag: 'F',
    name: 'Feed',
    desc: 'Boundary stream',
    icon: <path d="M3 5h11l6 7-6 7H3z" />,
  },
  {
    type: 'mixer',
    tag: 'M',
    name: 'Mixer',
    desc: '2 → 1 adiabatic',
    icon: <path d="M5 4l14 8-14 8z" />,
  },
  {
    type: 'heater',
    tag: 'E',
    name: 'Heater',
    desc: 'Duty Q [kW]',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M2 12h4l2-4 3 8 3-8 3 8 2-4h3" />
      </>
    ),
  },
  {
    type: 'distillation',
    tag: 'T',
    name: 'Column',
    desc: 'Binary rectification',
    icon: (
      <>
        <rect x="8" y="2" width="8" height="20" rx="4" />
        <path d="M8 8h5M16 12h-5M8 16h5" />
      </>
    ),
  },
  {
    type: 'flash',
    tag: 'V',
    name: 'Flash drum',
    desc: 'Q, P → vapour + liquid',
    icon: (
      <>
        <rect x="8" y="3" width="8" height="18" rx="4" />
        <path d="M8 9h8M3 13h5M12 3V1M12 21v2" />
      </>
    ),
  },
  {
    type: 'batch',
    tag: 'B',
    name: 'Batch still',
    desc: 'Charge → distillate + residue',
    icon: (
      <>
        <path d="M4 13h12v4a6 5 0 0 1-12 0z" />
        <path d="M10 13V4h8v4M18 11v3" />
      </>
    ),
  },
];

const EXTRA: Item[] = [
  { type: 'splitter', tag: 'S', name: 'Splitter', desc: '1 → 2 by fraction', icon: <path d="M2 12h8l10-7M10 12l10 7" /> },
  { type: 'cooler', tag: 'E', name: 'Cooler / condenser', desc: 'Duty Q < 0', icon: <><circle cx="12" cy="12" r="8" /><path d="M2 12h4l2-4 3 8 3-8 3 8 2-4h3" /></> },
  { type: 'pump', tag: 'P', name: 'Pump', desc: 'Raise pressure', icon: <><circle cx="11" cy="13" r="7" /><path d="M11 6h9v3M8 13l6-3.5v7z" /></> },
  { type: 'valve', tag: 'FV', name: 'Valve', desc: 'Let down · flash', icon: <path d="M3 7l18 10V7L3 17z" /> },
  { type: 'evaporator', tag: 'EV', name: 'Evaporator', desc: 'Set V/F → duty', icon: <><rect x="7" y="2" width="10" height="9" rx="4" /><rect x="8" y="11" width="8" height="10" /></> },
  { type: 'absorber', tag: 'C', name: 'Absorber / stripper', desc: 'Gas–liquid block', icon: <><rect x="8" y="2" width="8" height="20" rx="4" /><path d="M9 8l6 6M15 8l-6 6" /></> },
  { type: 'extractor', tag: 'X', name: 'Extraction column', desc: 'Liquid–liquid block', icon: <><rect x="8" y="2" width="8" height="20" rx="4" /><path d="M12 2v20M9 8h6M9 13h6M9 18h6" /></> },
  { type: 'evaptrain', tag: 'EV', name: 'Multi-effect evaporator', desc: 'Concentration block', icon: <><rect x="2" y="6" width="6" height="12" rx="2" /><rect x="9" y="6" width="6" height="12" rx="2" /><rect x="16" y="6" width="6" height="12" rx="2" /></> },
  { type: 'crystallizer', tag: 'CR', name: 'Crystallizer', desc: 'Solid–liquid block', icon: <><path d="M5 4h14v11l-7 6-7-6z" /><path d="M9 12h2v2H9zM13 10h2v2h-2z" /></> },
  { type: 'dryer', tag: 'D', name: 'Dryer', desc: 'Moist solid block', icon: <><path d="M3 8l18 3v5L3 13z" /><path d="M8 9v5M13 10v5" /></> },
];

const byType = (t: UnitType) => [...BASE, ...EXTRA].find((i) => i.type === t)!;
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
