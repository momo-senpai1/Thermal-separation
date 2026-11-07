import type { ReactNode } from 'react';

/** Small line-art schematics (viewBox 120×100) for the equipment library. */
const L = 'rgb(var(--sig-liquid))'; // liquid / vessel
const V = 'rgb(var(--sig-vapor))'; // vapour / gas
const H = 'rgb(var(--sig-heat))'; // heat
const N = 'rgb(var(--plant-400))'; // neutral

const vessel = (x: number, y: number, w: number, h: number) => (
  <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2.5} fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.4} />
);
const arrow = (d: string, c = N) => <path d={d} stroke={c} strokeWidth={1.3} fill="none" markerEnd="url(#ah)" />;

const ART: Record<string, ReactNode> = {
  'tray-column': (
    <>
      {vessel(45, 6, 30, 88)}
      {[22, 36, 50, 64, 78].map((y, i) => (
        <path key={y} d={i % 2 ? `M75 ${y}H52v-5` : `M45 ${y}h23v-5`} stroke={L} strokeWidth={1} fill="none" />
      ))}
      {arrow('M60 6V0', V)}
      {arrow('M20 50h25')}
      {arrow('M60 94v6', L)}
    </>
  ),
  'packed-column': (
    <>
      {vessel(45, 6, 30, 88)}
      <rect x={47} y={24} width={26} height={22} fill="url(#pack)" stroke={N} strokeWidth={0.6} />
      <rect x={47} y={56} width={26} height={22} fill="url(#pack)" stroke={N} strokeWidth={0.6} />
      <path d="M48 20h24M48 52h24" stroke={L} strokeDasharray="2 2" />
      {arrow('M60 6V0', V)}
      {arrow('M20 50h25')}
    </>
  ),
  'kettle-reboiler': (
    <>
      <rect x={14} y={34} width={92} height={46} rx={20} fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.4} />
      <path d="M20 66h70M20 70h70" stroke={H} strokeWidth={1.4} />
      <path d="M18 56h64" stroke={L} strokeDasharray="3 2" />
      <path d="M86 56v-8h4v24" stroke={L} />
      {arrow('M60 34V18', V)}
      {arrow('M8 68h12', H)}
    </>
  ),
  'thermosiphon-reboiler': (
    <>
      {vessel(14, 10, 22, 80)}
      <rect x={70} y={26} width={20} height={56} rx={6} fill="rgb(var(--sig-heat)/0.07)" stroke={H} strokeWidth={1.3} />
      <path d="M25 90v6h55v-14" stroke={L} fill="none" />
      {arrow('M80 26V18H36', V)}
      <path d="M74 34v40M80 34v40M86 34v40" stroke={H} strokeWidth={0.8} />
    </>
  ),
  'forced-reboiler': (
    <>
      {vessel(14, 10, 22, 80)}
      <rect x={72} y={28} width={20} height={50} rx={6} fill="rgb(var(--sig-heat)/0.07)" stroke={H} strokeWidth={1.3} />
      <circle cx={55} cy={88} r={7} fill="none" stroke={L} strokeWidth={1.3} />
      <path d="M52 88l6-4v8z" fill={L} />
      <path d="M25 90v-2h23M62 88h20v-10" stroke={L} fill="none" />
      {arrow('M82 28V20H36', V)}
    </>
  ),
  condenser: (
    <>
      <rect x={12} y={30} width={96} height={36} rx={14} fill="rgb(var(--sig-vapor)/0.06)" stroke={V} strokeWidth={1.3} />
      <path d="M18 42h84M18 48h84M18 54h84" stroke={L} strokeWidth={0.8} />
      {arrow('M30 14v16', V)}
      {arrow('M90 66v16', L)}
      {arrow('M110 40h-8', L)}
    </>
  ),
  'reflux-drum': (
    <>
      <rect x={10} y={28} width={100} height={40} rx={18} fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.4} />
      <path d="M14 52h92" stroke={L} strokeDasharray="3 2" />
      <rect x={74} y={68} width={14} height={14} rx={3} fill="none" stroke={N} />
      {arrow('M24 12v16', L)}
      {arrow('M40 68v18', L)}
      {arrow('M98 28V14', V)}
    </>
  ),
  'falling-film': (
    <>
      <rect x={40} y={8} width={40} height={70} rx={4} fill="rgb(var(--sig-heat)/0.05)" stroke={H} strokeWidth={1.2} />
      {[48, 56, 64, 72].map((x) => (
        <path key={x} d={`M${x} 10v66`} stroke={L} strokeWidth={1.1} strokeDasharray="1 3" />
      ))}
      {vessel(38, 78, 44, 18)}
      {arrow('M60 0v8', L)}
      {arrow('M82 86h22', V)}
      {arrow('M20 40h20', H)}
    </>
  ),
  'rising-film': (
    <>
      <rect x={40} y={22} width={40} height={70} rx={4} fill="rgb(var(--sig-heat)/0.05)" stroke={H} strokeWidth={1.2} />
      {[48, 56, 64, 72].map((x) => (
        <path key={x} d={`M${x} 90V24`} stroke={L} strokeWidth={1.1} strokeDasharray="4 2" />
      ))}
      {vessel(36, 4, 48, 18)}
      {arrow('M60 100v-8', L)}
      {arrow('M84 12h20', V)}
    </>
  ),
  'forced-evaporator': (
    <>
      {vessel(14, 8, 40, 60)}
      <rect x={78} y={20} width={18} height={56} rx={5} fill="rgb(var(--sig-heat)/0.07)" stroke={H} strokeWidth={1.3} />
      <circle cx={66} cy={88} r={7} fill="none" stroke={L} strokeWidth={1.3} />
      <path d="M34 68v20h25M73 88h14v-12M87 20v-8H54" stroke={L} fill="none" />
      {arrow('M34 8V0', V)}
    </>
  ),
  mvr: (
    <>
      {vessel(14, 20, 40, 66)}
      <path d="M78 22l24 8v18l-24 8z" fill="rgb(var(--sig-vapor)/0.08)" stroke={V} strokeWidth={1.3} />
      <path d="M34 20V10h50v12M90 56v12H54" stroke={V} fill="none" />
      <path d="M20 66h28M20 72h28" stroke={H} />
      <text x={86} y={44} fontSize={8} fill={V} fontFamily="monospace">M</text>
    </>
  ),
  tvr: (
    <>
      {vessel(14, 24, 40, 62)}
      <path d="M66 30h24l10 10-10 10H66z" fill="rgb(var(--sig-vapor)/0.08)" stroke={V} strokeWidth={1.3} />
      {arrow('M110 40h-10', H)}
      <path d="M34 24V12h44v18M78 50v20H54" stroke={V} fill="none" />
    </>
  ),
  'rotary-dryer': (
    <>
      <path d="M14 34l90 14v20l-90-14z" fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.3} />
      {[30, 50, 70, 90].map((x) => (
        <path key={x} d={`M${x} ${36 + (x - 14) * 0.155}v20`} stroke={N} strokeWidth={0.8} />
      ))}
      {arrow('M4 30h10', H)}
      {arrow('M20 20v12', L)}
      {arrow('M100 72v14', L)}
    </>
  ),
  'fluid-bed': (
    <>
      {vessel(34, 8, 52, 80)}
      <path d="M36 66h48" stroke={N} strokeDasharray="2 2" />
      {[44, 52, 60, 68, 76].map((x, i) => (
        <circle key={x} cx={x} cy={50 + (i % 2) * 8} r={3} fill={L} fillOpacity={0.6} />
      ))}
      {arrow('M60 100V88', H)}
      {arrow('M60 8V0', V)}
    </>
  ),
  'spray-dryer': (
    <>
      <path d="M30 14h60v42l-30 30-30-30z" fill="rgb(var(--sig-liquid)/0.05)" stroke={L} strokeWidth={1.3} />
      <circle cx={60} cy={20} r={3} fill={L} />
      {[48, 54, 60, 66, 72].map((x) => (
        <path key={x} d={`M60 22L${x} 46`} stroke={L} strokeOpacity={0.5} strokeDasharray="1 2" />
      ))}
      {arrow('M60 0v14', L)}
      {arrow('M14 30h16', H)}
      {arrow('M60 86v12', N)}
    </>
  ),
  'flash-dryer': (
    <>
      <path d="M30 90V20h14v70" fill="rgb(var(--sig-liquid)/0.05)" stroke={L} strokeWidth={1.3} />
      <path d="M44 20h22" stroke={L} />
      <path d="M66 12h24v26l-12 14-12-14z" fill="none" stroke={N} strokeWidth={1.2} />
      {arrow('M10 84h20', H)}
      {arrow('M78 52v14', L)}
    </>
  ),
  'freeze-dryer': (
    <>
      <rect x={10} y={20} width={56} height={60} rx={6} fill="rgb(var(--sig-liquid)/0.05)" stroke={L} strokeWidth={1.3} />
      {[36, 50, 64].map((y) => (
        <path key={y} d={`M16 ${y}h44`} stroke={N} />
      ))}
      <rect x={80} y={30} width={28} height={40} rx={5} fill="rgb(var(--viz-eq-rgb)/0.08)" stroke="var(--viz-eq)" strokeWidth={1.2} />
      <path d="M66 50h14" stroke={V} />
      <text x={86} y={54} fontSize={8} fill="var(--viz-eq)" fontFamily="monospace">−50</text>
    </>
  ),
  'packed-absorber': (
    <>
      {vessel(45, 6, 30, 88)}
      <rect x={47} y={28} width={26} height={44} fill="url(#pack)" stroke={N} strokeWidth={0.6} />
      {arrow('M100 18H75', L)}
      {arrow('M20 82h25', V)}
      {arrow('M60 6V0', V)}
      {arrow('M75 90h25', L)}
    </>
  ),
  'tray-absorber': (
    <>
      {vessel(45, 6, 30, 88)}
      {[24, 40, 56, 72].map((y, i) => (
        <path key={y} d={i % 2 ? `M75 ${y}H52v-5` : `M45 ${y}h23v-5`} stroke={L} strokeWidth={1} fill="none" />
      ))}
      {arrow('M100 16H75', L)}
      {arrow('M20 84h25', V)}
    </>
  ),
  stripper: (
    <>
      {vessel(45, 6, 30, 88)}
      <rect x={47} y={28} width={26} height={44} fill="url(#pack)" stroke={N} strokeWidth={0.6} />
      {arrow('M100 18H75', L)}
      {arrow('M20 84h25', H)}
      {arrow('M60 6V0', V)}
    </>
  ),
  'mixer-settler': (
    <>
      <rect x={8} y={30} width={34} height={40} rx={4} fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.3} />
      <path d="M25 22v30M17 52h16" stroke={N} strokeWidth={1.3} />
      <rect x={46} y={30} width={66} height={40} rx={4} fill="rgb(var(--sig-liquid)/0.04)" stroke={L} strokeWidth={1.3} />
      <path d="M48 46h62" stroke={V} strokeDasharray="3 2" />
      <path d="M48 46h62v22H48z" fill="rgb(var(--sig-liquid)/0.08)" stroke="none" />
    </>
  ),
  rdc: (
    <>
      {vessel(42, 6, 36, 88)}
      <path d="M60 2v92" stroke={N} strokeWidth={1.2} />
      {[22, 38, 54, 70].map((y) => (
        <g key={y}>
          <path d={`M48 ${y}h24`} stroke={L} strokeWidth={1.6} />
          <path d={`M42 ${y + 8}h8M70 ${y + 8}h8`} stroke={N} strokeWidth={1.4} />
        </g>
      ))}
    </>
  ),
  kuhni: (
    <>
      {vessel(42, 6, 36, 88)}
      <path d="M60 2v92" stroke={N} strokeWidth={1.2} />
      {[26, 50, 74].map((y) => (
        <g key={y}>
          <path d={`M54 ${y}h12M54 ${y - 3}v6M66 ${y - 3}v6`} stroke={L} strokeWidth={1.4} />
          <path d={`M42 ${y + 12}h14M64 ${y + 12}h14`} stroke={N} strokeDasharray="2 1" />
        </g>
      ))}
    </>
  ),
  'packed-extractor': (
    <>
      {vessel(45, 6, 30, 88)}
      <rect x={47} y={22} width={26} height={56} fill="url(#pack)" stroke={N} strokeWidth={0.6} />
      {[30, 46, 62].map((y) => (
        <circle key={y} cx={56 + (y % 3)} cy={y} r={2.5} fill={V} fillOpacity={0.7} />
      ))}
    </>
  ),
  'fc-crystallizer': (
    <>
      <path d="M14 12h40v50l-20 18-20-18z" fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.3} />
      {[24, 32, 40, 30, 44].map((x, i) => (
        <rect key={i} x={x} y={46 + (i % 3) * 5} width={4} height={4} fill={L} fillOpacity={0.6} transform={`rotate(20 ${x} ${46 + (i % 3) * 5})`} />
      ))}
      <rect x={78} y={20} width={18} height={50} rx={5} fill="rgb(var(--sig-heat)/0.07)" stroke={H} strokeWidth={1.3} />
      <circle cx={66} cy={88} r={7} fill="none" stroke={L} strokeWidth={1.3} />
      <path d="M34 80v8h25M73 88h14v-18M87 20v-8H54" stroke={L} fill="none" />
    </>
  ),
  dtb: (
    <>
      <path d="M22 8h76v62l-38 26-38-26z" fill="rgb(var(--sig-liquid)/0.05)" stroke={L} strokeWidth={1.3} />
      <rect x={50} y={20} width={20} height={44} fill="none" stroke={N} strokeWidth={1.2} />
      <path d="M54 66h12" stroke={L} strokeWidth={2} />
      <path d="M36 20v46M84 20v46" stroke={N} strokeDasharray="3 2" />
      {arrow('M98 30h14', L)}
    </>
  ),
  'cooling-crystallizer': (
    <>
      <rect x={30} y={16} width={60} height={70} rx={10} fill="rgb(var(--sig-liquid)/0.06)" stroke={L} strokeWidth={1.3} />
      <rect x={24} y={30} width={72} height={50} rx={12} fill="none" stroke="var(--viz-eq)" strokeDasharray="3 2" />
      <path d="M60 8v52M50 60h20" stroke={N} strokeWidth={1.3} />
      {[44, 52, 68, 74].map((x, i) => (
        <rect key={x} x={x} y={66 + (i % 2) * 6} width={4} height={4} fill={L} fillOpacity={0.6} />
      ))}
    </>
  ),
  'flash-drum': (
    <>
      {vessel(42, 8, 36, 84)}
      <path d="M45 30h30M45 34h30" stroke={N} />
      <path d="M44 66h32" stroke={L} strokeDasharray="3 2" />
      {arrow('M14 50h28')}
      {arrow('M60 8V0', V)}
      {arrow('M60 92v8', L)}
    </>
  ),
  demister: (
    <>
      <rect x={20} y={36} width={80} height={22} fill="url(#mesh)" stroke={N} />
      {[30, 50, 70, 90].map((x) => (
        <circle key={x} cx={x} cy={76} r={2.5} fill={L} fillOpacity={0.6} />
      ))}
      {arrow('M60 96V60', V)}
      {arrow('M60 36V8', V)}
    </>
  ),
  ejector: (
    <>
      <path d="M10 40h30l14 6h20l30-8v24l-30-8H54l-14 6H10z" fill="rgb(var(--sig-vapor)/0.06)" stroke={V} strokeWidth={1.3} />
      {arrow('M0 50h10', H)}
      {arrow('M47 86V56')}
      {arrow('M104 50h14')}
    </>
  ),
  'liquid-ring': (
    <>
      <circle cx={60} cy={50} r={36} fill="rgb(var(--sig-liquid)/0.05)" stroke={L} strokeWidth={1.3} />
      <circle cx={52} cy={50} r={20} fill="none" stroke={N} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <path key={a} d={`M52 50l${20 * Math.cos((a * Math.PI) / 180)},${20 * Math.sin((a * Math.PI) / 180)}`} stroke={N} />
      ))}
      <path d="M60 14a36 36 0 0 1 0 72" fill="none" stroke={L} strokeWidth={5} strokeOpacity={0.3} />
    </>
  ),
  'shell-tube': (
    <>
      <rect x={14} y={32} width={92} height={36} rx={14} fill="rgb(var(--sig-heat)/0.05)" stroke={H} strokeWidth={1.3} />
      <path d="M20 44h80M20 50h80M20 56h80" stroke={L} strokeWidth={0.8} />
      {arrow('M2 50h12', L)}
      {arrow('M106 50h12', L)}
      {arrow('M40 16v16', H)}
      {arrow('M80 68v16', H)}
    </>
  ),
};

export function Schematic({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden>
      <defs>
        <marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L6 3L0 6z" fill="currentColor" />
        </marker>
        <pattern id="pack" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 3h6" stroke="rgb(var(--plant-400))" strokeWidth="0.8" />
        </pattern>
        <pattern id="mesh" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 0l5 5M5 0L0 5" stroke="rgb(var(--plant-400))" strokeWidth="0.6" />
        </pattern>
      </defs>
      <g className="text-plant-400">{ART[id] ?? <rect x={30} y={20} width={60} height={60} rx={8} fill="none" stroke={N} />}</g>
    </svg>
  );
}
