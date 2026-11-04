# Thermal Separation — P&ID Simulator

Browser-based, interactive P&ID / flowsheet simulator for thermal separation
processes (distillation, extraction/absorption, crystallisation, chromatography).

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · `@xyflow/react` · Zustand
(Tremor + Recharts arrive in Phase 4).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
```

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | React Flow canvas, custom P&ID nodes (Feed, Mixer, Heater, Column), Zustand store | ✅ |
| 2 | `thermodynamics.ts` — Raoult/Dalton VLE, Antoine, enthalpy balances | ⏳ |
| 3 | Engine ↔ UI: unit solve in topological order, live stream propagation | ⏳ |
| 4 | McCabe–Thiele side panel (Tremor/Recharts) on column selection | ⏳ |

## Data contract

Defined in `src/types/process.ts`. Internal units: kmol/h, **K**, kPa, kW
(°C is used only at the UI boundary).

```ts
// Stream (edge)
{ id, source, target, flowRate, temperature, pressure, vaporFraction /* q */, molarFractions: { compA, compB } }

// Unit operation (node)
{ id, type: 'feed' | 'mixer' | 'heater' | 'distillation',
  params: { theoreticalStages, refluxRatio, heatDuty, condenserType? },
  state:  { topProduct, bottomProduct } }
```

Extensions to the original contract: `type: 'feed'` (boundary streams) and the
optional `params.condenserType` (`total` = 0 equilibrium stages, `partial` = 1).
`useFlowsheet.getState().getUnitPayloads()` / `getStreamPayloads()` serialise the
canvas to exactly this schema.

## Layout

```
src/
  types/process.ts          schema + port definitions
  store/flowsheetStore.ts   Zustand store, propagation hook, demo flowsheet
  nodes/                    custom P&ID nodes (SVG symbols, glass instrument cards)
  edges/StreamEdge.tsx      phase-coloured pipe with live data tag
  components/               palette, inspector (shadcn sliders), status bar, canvas
```

## References

Thermodynamic and numerical methods are implemented independently from
published equations; the following projects are used as logic references only
(no code is copied — DWSIM and CADET are GPL-licensed):
DWSIM, CADET, ThermalSeparation (Modelica), and the McCabe–Thiele simulators by
trsav, 314arhaam and minangajayasekera-ops.
