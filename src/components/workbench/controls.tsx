import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { t, tx } from '@/i18n';

export function Panel({ title, children, className, aside }: { title?: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={cn('glass p-3', className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/[0.05] pb-1.5">
          <p className="tag text-plant-400">{t(title)}</p>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <span className="tag block text-plant-500">{t(label)}</span>
      {children}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none rounded-md border border-white/[0.08] bg-plant-950/70 py-1.5 pl-2.5 pr-8 text-xs text-plant-100 outline-none transition-colors hover:border-white/15 focus:border-signal-liquid/50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-plant-900">
            {t(o.label)}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 stroke-plant-400" fill="none" aria-hidden>
        <path d="M3 4.5 6 7.5 9 4.5" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-plant-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-[3px] border border-white/20 bg-plant-950 transition-colors checked:border-signal-liquid checked:bg-signal-liquid focus-visible:outline focus-visible:outline-1 focus-visible:outline-signal-liquid"
      />
      {t(label)}
    </label>
  );
}

export function Kpi({
  label,
  value,
  unit,
  sub,
  tone = 'default',
  small = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  tone?: 'default' | 'muted';
  small?: boolean;
}) {
  return (
    <div className="glass min-w-0 px-3 py-2.5">
      <p className="tag truncate text-plant-500">{t(label)}</p>
      <p className={cn('readout mt-0.5 truncate', small ? 'py-1 text-sm' : 'text-lg', tone === 'muted' ? 'text-plant-500' : 'text-plant-100')}>
        {value}
        {unit && <span className="ml-1 text-[10px] text-plant-500">{unit}</span>}
      </p>
      {sub && <div className="mt-0.5 truncate font-mono text-[10px] text-plant-400">{tx(sub)}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'warning' | 'info'; children: ReactNode }) {
  const t = {
    error: 'border-signal-alarm/35 bg-signal-alarm/[0.07] text-signal-alarm',
    warning: 'border-signal-vapor/30 bg-signal-vapor/[0.06] text-signal-vapor',
    info: 'border-white/[0.07] bg-white/[0.02] text-plant-300',
  }[tone];
  const icon = { error: '✕', warning: '!', info: 'i' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] leading-relaxed', t)}>
      <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border border-current font-mono text-[9px] font-bold">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
