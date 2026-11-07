import { Moon, RotateCcw, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { navigate, type Route } from '@/lib/route';
import { useTheme } from '@/lib/theme';
import { COMPONENTS } from '@/engine/components';
import { useFlowsheet } from '@/store/flowsheetStore';
import { useBalance } from '@/store/balanceStore';
import { LANGS, t, useLang } from '@/i18n';

type NavItem = { route: Route; label: string };
type NavGroup = { label: string; items: NavItem[] };
const NAV: (NavItem | NavGroup)[] = [
  { route: 'flowsheet', label: 'Flowsheet' },
  {
    label: 'Distillation',
    items: [
      { route: 'mccabe-thiele', label: 'McCabe–Thiele' },
      { route: 'batch', label: 'Batch distillation' },
      { route: 'distillation-lines', label: 'Distillation lines' },
    ],
  },
  { route: 'extraction', label: 'Extraction' },
  { route: 'absorption', label: 'Absorption' },
  { route: 'evaporation', label: 'Evaporation' },
  { route: 'crystallization', label: 'Crystallization' },
  { route: 'drying', label: 'Drying' },
];

const tab = (active: boolean) =>
  cn(
    'whitespace-nowrap rounded px-2.5 py-1 text-[11px] transition-colors',
    active
      ? 'bg-signal-liquid/15 text-signal-liquid shadow-[inset_0_0_0_1px_rgb(var(--sig-liquid)/0.35)]'
      : 'text-plant-300 hover:bg-white/[0.04] hover:text-plant-100',
  );

function Group({ g, route }: { g: NavGroup; route: Route }) {
  const [open, setOpen] = useState(false);
  const active = g.items.find((i) => i.route === route);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={tab(!!active)}>
        {active ? `${t(g.label)} · ${t(active.label)}` : t(g.label)} ▾
      </button>
      {open && (
        <div role="menu" className="glass absolute left-0 top-full z-50 mt-1 min-w-[190px] !bg-plant-900/95 p-1">
          {g.items.map((i) => (
            <button
              key={i.route}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(i.route);
              }}
              className={cn('block w-full rounded px-2.5 py-1.5 text-left text-[11px]', i.route === route ? 'text-signal-liquid' : 'text-plant-200 hover:bg-white/[0.05]')}
            >
              {t(i.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppHeader({ route }: { route: Route }) {
  const mode = useBalance((s) => s.mode);
  return (
    <header className="glass relative z-30 flex h-11 shrink-0 items-center gap-5 px-4">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-signal-liquid stroke-[1.5]" aria-hidden>
          <rect x="8" y="2" width="8" height="20" rx="4" />
          <path d="M8 8h5M16 12h-5M8 16h5" />
        </svg>
        <span className="text-sm font-semibold tracking-tight text-plant-100">Thermal Separation</span>
      </div>

      <nav aria-label={t('Modules')} className="flex min-w-0 items-center gap-0.5">
        {NAV.map((n) =>
          'items' in n ? (
            <Group key={n.label} g={n} route={route} />
          ) : (
            <button key={n.route} type="button" onClick={() => navigate(n.route)} aria-current={route === n.route ? 'page' : undefined} className={tab(route === n.route)}>
              {t(n.label)}
            </button>
          ),
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        {route === 'flowsheet' && mode === 'sim' && <FlowsheetStatus />}
        <LangSwitch />
        <ThemeToggle />
      </div>
    </header>
  );
}

function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div role="group" aria-label={t('Language')} className="flex rounded border border-white/[0.08] p-0.5">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          title={l.name}
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          className={cn(
            'rounded-sm px-1.5 py-0.5 font-mono text-[10px] transition-colors',
            lang === l.id ? 'bg-signal-liquid/15 text-signal-liquid' : 'text-plant-400 hover:text-plant-100',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
      title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
      className="grid h-7 w-7 place-items-center rounded border border-white/[0.08] text-plant-300 transition-colors hover:border-signal-liquid/40 hover:text-signal-liquid"
    >
      {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

function FlowsheetStatus() {
  const nodes = useFlowsheet((s) => s.nodes.length);
  const streams = useFlowsheet((s) => s.edges.length);
  const resolved = useFlowsheet((s) => s.edges.filter((e) => e.data?.resolved).length);
  const resetDemo = useFlowsheet((s) => s.resetDemo);
  const system = useFlowsheet((s) => s.system);
  const ms = useFlowsheet((s) => s.lastSolveMs);
  const errors = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'error').length);
  const warnings = useFlowsheet((s) => s.nodes.filter((n) => n.data.diag?.status === 'warning').length);
  return (
    <>
      <span className="hidden font-mono text-[10px] text-plant-400 xl:inline">
        <Stat label="UNITS" value={nodes} /> · <Stat label="STREAMS" value={`${resolved}/${streams}`} /> ·{' '}
        <Stat label="SYSTEM" value={`${COMPONENTS[system.A].name} / ${COMPONENTS[system.B].name}`} />
      </span>
      {(errors > 0 || warnings > 0) && (
        <span className="font-mono text-[10px]">
          {errors > 0 && <span className="text-signal-alarm">{errors} ERR </span>}
          {warnings > 0 && <span className="text-signal-vapor">{warnings} WARN</span>}
        </span>
      )}
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-signal-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-signal-ok shadow-[0_0_6px] shadow-signal-ok" />
        ENGINE ONLINE
        <span className="text-plant-500">· {ms.toFixed(1)} ms</span>
      </span>
      <button
        type="button"
        onClick={resetDemo}
        className="flex items-center gap-1.5 rounded border border-white/[0.07] px-2 py-1 font-mono text-[10px] text-plant-300 transition-colors hover:border-signal-liquid/40 hover:text-signal-liquid"
      >
        <RotateCcw className="h-3 w-3" /> RESET
      </button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span>
      <span className="text-plant-500">{label} </span>
      <span className="text-plant-200">{value}</span>
    </span>
  );
}
