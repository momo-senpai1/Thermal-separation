import { useEffect, useState } from 'react';
import { Select } from '@/components/workbench/controls';
import { COMPONENTS, type ComponentId } from '@/engine/components';
import { PACKAGE_COMPONENTS, packageNote, pairModel } from '@/engine/propertyPackage';
import { cn } from '@/lib/utils';
import { useFlowsheet } from '@/store/flowsheetStore';

const OPTIONS = PACKAGE_COMPONENTS.map((id) => ({ id, label: COMPONENTS[id].name }));

/** Two-component feed selector for the flowsheet (light key is ordered automatically). */
export function MaterialPicker() {
  const system = useFlowsheet((s) => s.system);
  const setSystem = useFlowsheet((s) => s.setSystem);
  const [draft, setDraft] = useState<{ a: ComponentId; b: ComponentId }>({ a: system.A, b: system.B });
  const [error, setError] = useState<string | null>(null);
  // follow external changes (e.g. RESET) of the flowsheet's system
  useEffect(() => {
    setDraft({ a: system.A, b: system.B });
    setError(null);
  }, [system]);

  const pick = (a: ComponentId, b: ComponentId) => {
    const msg = setSystem(a, b);
    setDraft({ a, b });
    setError(msg);
  };
  const m = pairModel(system.A, system.B);

  return (
    <div className="space-y-2 border-b border-white/[0.05] p-3">
      <p className="tag text-plant-400">Feed materials</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={draft.a} options={OPTIONS} onChange={(v) => pick(v, draft.b)} ariaLabel="First feed component" />
        <Select value={draft.b} options={OPTIONS} onChange={(v) => pick(draft.a, v)} ariaLabel="Second feed component" />
      </div>
      {error ? (
        <p role="alert" className="rounded border border-signal-alarm/30 bg-signal-alarm/[0.06] px-2 py-1.5 text-[10px] leading-relaxed text-signal-alarm">
          {error} Still running {COMPONENTS[system.A].name} / {COMPONENTS[system.B].name}.
        </p>
      ) : (
        <p className="text-[10px] leading-relaxed text-plant-500">
          <span className={cn('mr-1 rounded-sm border px-1 font-mono text-[8px] uppercase', m.kind === 'wilson' ? 'border-signal-vapor/40 text-signal-vapor' : 'border-white/15 text-plant-400')}>
            {m.kind === 'wilson' ? 'Wilson' : 'Raoult'}
          </span>
          A = {COMPONENTS[system.A].name} ({(COMPONENTS[system.A].Tb - 273.15).toFixed(1)} °C, light), B = {COMPONENTS[system.B].name} ({(COMPONENTS[system.B].Tb - 273.15).toFixed(1)} °C). {packageNote(system)}
        </p>
      )}
    </div>
  );
}
