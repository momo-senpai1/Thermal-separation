import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-white/[0.06] bg-plant-950/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
            value === o.value
              ? 'bg-signal-liquid/15 text-signal-liquid shadow-[inset_0_0_0_1px_rgba(45,212,191,0.4)]'
              : 'text-plant-400 hover:text-plant-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
