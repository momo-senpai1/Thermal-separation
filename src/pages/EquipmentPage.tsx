import { useState } from 'react';
import { EquipmentCard } from '@/components/equipment/EquipmentCards';
import { EQUIPMENT, TOPICS, type Topic } from '@/content/equipment';
import { cn } from '@/lib/utils';
import { t as tr } from '@/i18n';

export default function EquipmentPage({ params }: { params: URLSearchParams }) {
  const initial = TOPICS.some((t) => t.id === params.get('topic')) ? (params.get('topic') as Topic) : null;
  const [topic, setTopic] = useState<Topic | null>(initial);
  const list = topic ? EQUIPMENT.filter((e) => e.topic === topic) : EQUIPMENT;
  return (
    <div className="space-y-2">
      <div className="glass space-y-2 px-3 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-sm font-semibold text-plant-100">Equipment library</h1>
          <p className="text-[11px] text-plant-400">
            Industrial thermal-separation equipment — what it does, when to choose it, and the design parameters that matter.
            Where the app can calculate it, the card links straight there.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('Filter by topic')}>
          {[{ id: null as Topic | null, label: `${tr('All')} (${EQUIPMENT.length})` }, ...TOPICS.map((t) => ({ id: t.id as Topic | null, label: t.label }))].map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={topic === t.id}
              onClick={() => setTopic(t.id)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] transition-colors',
                topic === t.id ? 'border-signal-liquid/50 bg-signal-liquid/10 text-signal-liquid' : 'border-white/[0.07] text-plant-300 hover:text-plant-100',
              )}
            >
              {tr(t.label)}
            </button>
          ))}
        </div>
      </div>
      {(topic ? TOPICS.filter((t) => t.id === topic) : TOPICS).map((t) => (
        <section key={t.id} className="space-y-2">
          <p className="tag px-1 pt-1 text-plant-400">{tr(t.label)}</p>
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {list.filter((e) => e.topic === t.id).map((e) => (
              <EquipmentCard key={e.id} e={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
