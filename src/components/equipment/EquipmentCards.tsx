import { EQUIPMENT, equipmentFor, TOPICS, type Equipment, type Topic } from '@/content/equipment';
import { navigate } from '@/lib/route';
import { Schematic } from './Schematic';

export function EquipmentCard({ e, compact = false }: { e: Equipment; compact?: boolean }) {
  return (
    <article className="glass flex flex-col gap-2 p-3">
      <div className="flex gap-3">
        <div className="grid h-[84px] w-[100px] shrink-0 place-items-center rounded-md border border-white/[0.05] bg-plant-950/60">
          <Schematic id={e.id} className="h-[76px] w-[92px]" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[12px] font-semibold leading-snug text-plant-100">{e.name}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-plant-300">{e.summary}</p>
        </div>
      </div>
      {!compact && (
        <dl className="space-y-1.5 text-[11px] leading-relaxed">
          <div>
            <dt className="tag inline text-signal-ok/80">Use · </dt>
            <dd className="inline text-plant-300">{e.use}</dd>
          </div>
          <div>
            <dt className="tag inline text-signal-vapor/80">Limits · </dt>
            <dd className="inline text-plant-300">{e.limits}</dd>
          </div>
        </dl>
      )}
      <ul className="flex flex-wrap gap-1">
        {e.params.map((p) => (
          <li key={p} className="rounded-sm border border-white/[0.07] px-1.5 py-0.5 font-mono text-[9px] text-plant-400">
            {p}
          </li>
        ))}
      </ul>
      {e.tryIt && (
        <button
          type="button"
          onClick={() => navigate(e.tryIt!.route, e.tryIt!.query)}
          className="mt-auto self-start text-[11px] text-signal-liquid hover:underline"
        >
          {e.tryIt.label} →
        </button>
      )}
    </article>
  );
}

/** Equipment strip for a module page. */
export function EquipmentPanel({ topic }: { topic: Topic }) {
  const list = equipmentFor(topic);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <p className="tag text-plant-400">Equipment · {TOPICS.find((t) => t.id === topic)!.label}</p>
        <button type="button" onClick={() => navigate('equipment', { topic })} className="text-[11px] text-signal-liquid hover:underline">
          Equipment library →
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {list.map((e) => (
          <EquipmentCard key={e.id} e={e} />
        ))}
      </div>
    </section>
  );
}

export { EQUIPMENT };
