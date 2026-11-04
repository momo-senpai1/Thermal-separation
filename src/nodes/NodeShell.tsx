import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface NodeShellProps {
  tag: string;
  label: string;
  selected?: boolean;
  /** live = unit has a solved state; idle = awaiting inputs/engine */
  status: 'live' | 'idle';
  accent?: 'liquid' | 'vapor' | 'heat';
  className?: string;
  children: ReactNode;
}

const ACCENT = {
  liquid: 'from-signal-liquid/70',
  vapor: 'from-signal-vapor/70',
  heat: 'from-signal-heat/70',
} as const;

/** Glass instrument card shared by every unit operation. */
export function NodeShell({ tag, label, selected, status, accent = 'liquid', className, children }: NodeShellProps) {
  return (
    <div
      className={cn(
        'glass relative min-w-[168px] transition-shadow duration-150',
        selected && 'shadow-glow',
        className,
      )}
    >
      {/* accent rail */}
      <div className={cn('absolute inset-x-3 top-0 h-px bg-gradient-to-r to-transparent', ACCENT[accent])} />
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-3 py-1.5">
        <span className="tag text-plant-200">{tag}</span>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[10px] text-plant-400">{label}</span>
          <span
            title={status === 'live' ? 'State resolved' : 'Awaiting engine / inputs'}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              status === 'live' ? 'bg-signal-ok shadow-[0_0_6px] shadow-signal-ok' : 'bg-plant-500',
            )}
          />
        </span>
      </header>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'liquid' | 'vapor' | 'heat' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] leading-5">
      <span className="font-mono text-plant-400">{label}</span>
      <span
        className={cn(
          'readout',
          tone === 'default' && 'text-plant-200',
          tone === 'liquid' && 'text-signal-liquid',
          tone === 'vapor' && 'text-signal-vapor',
          tone === 'heat' && 'text-signal-heat',
          tone === 'muted' && 'text-plant-500',
        )}
      >
        {value}
        {unit && <span className="ml-1 text-[9px] text-plant-500">{unit}</span>}
      </span>
    </div>
  );
}
