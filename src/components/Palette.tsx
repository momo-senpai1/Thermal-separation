import type { DragEvent } from 'react';
import type { UnitType } from '@/types/process';

export const DND_MIME = 'application/x-thermal-unit';

const ITEMS: { type: UnitType; tag: string; name: string; desc: string; icon: JSX.Element }[] = [
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

export function Palette() {
  const onDragStart = (e: DragEvent, type: UnitType) => {
    e.dataTransfer.setData(DND_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="glass flex w-52 shrink-0 flex-col">
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">Equipment</p>
        <p className="mt-0.5 text-[10px] text-plant-500">Drag onto the flowsheet</p>
      </div>
      <ul className="space-y-1 p-2">
        {ITEMS.map((it) => (
          <li
            key={it.type}
            draggable
            onDragStart={(e) => onDragStart(e, it.type)}
            className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-white/[0.06] hover:bg-white/[0.03] active:cursor-grabbing"
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
              <span className="block text-xs text-plant-200">{it.name}</span>
              <span className="block truncate text-[10px] text-plant-500">{it.desc}</span>
            </span>
            <span className="tag text-plant-500">{it.tag}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-white/[0.05] p-3 text-[10px] leading-relaxed text-plant-500">
        <p className="tag mb-1 text-plant-400">Stream legend</p>
        <Legend color="#2dd4bf" label="Liquid · q ≥ 1" />
        <Legend color="#a3e635" label="Two-phase · 0 < q < 1" />
        <Legend color="#fbbf24" label="Vapour · q ≤ 0" />
        <Legend color="#3a4b60" label="Unresolved" />
      </div>
    </aside>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
      <span className="font-mono">{label}</span>
    </div>
  );
}
