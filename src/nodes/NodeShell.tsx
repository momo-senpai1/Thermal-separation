import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Diagnostics, SolveStatus } from '@/types/process';
import { t } from '@/i18n';

interface NodeShellProps {
  tag: string;
  label: string;
  selected?: boolean;
  /** solver diagnostics; undefined before the first solve */
  diag?: Diagnostics;
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
const LED: Record<SolveStatus, string> = {
  ok: 'bg-signal-ok shadow-[0_0_6px] shadow-signal-ok',
  warning: 'bg-signal-vapor shadow-[0_0_6px] shadow-signal-vapor',
  error: 'bg-signal-alarm shadow-[0_0_6px] shadow-signal-alarm animate-pulse',
  idle: 'bg-plant-500',
};

export function NodeShell({ tag, label, selected, diag, accent = 'liquid', className, children }: NodeShellProps) {
  const status = diag?.status ?? 'idle';
  const message = status === 'ok' ? null : diag?.messages[0];
  return (
    <div
      className={cn(
        'glass relative min-w-[168px] transition-shadow duration-150',
        selected && 'shadow-glow',
        status === 'error' && 'border-signal-alarm/40',
        className,
      )}
    >
      {/* accent rail */}
      <div className={cn('absolute inset-x-3 top-0 h-px bg-gradient-to-r to-transparent', ACCENT[accent])} />
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-3 py-1.5">
        <span className="tag text-plant-200">{tag}</span>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[10px] text-plant-400">{t(label)}</span>
          <span title={diag?.messages.join('\n') || 'Solved'} className={cn('h-1.5 w-1.5 rounded-full', LED[status])} />
        </span>
      </header>
      <div className="px-3 py-2">{children}</div>
      {message && (
        <footer
          title={diag?.messages.join('\n')}
          className={cn(
            'max-w-[230px] truncate border-t border-white/[0.05] px-3 py-1 font-mono text-[9px]',
            status === 'error' && 'text-signal-alarm',
            status === 'warning' && 'text-signal-vapor/80',
            status === 'idle' && 'text-plant-500',
          )}
        >
          {message}
        </footer>
      )}
    </div>
  );
}

export function Readout({
  label,
  value,
  unit,
  tone = 'default',
  computed = false,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'liquid' | 'vapor' | 'heat' | 'muted';
  /** marks a value computed by the engine (vs. specified by the user) */
  computed?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] leading-5">
      <span className="font-mono text-plant-400">
        {t(label)}
        {computed && <span className="ml-1 align-super text-[7px] text-plant-500">calc</span>}
      </span>
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
