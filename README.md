# Thermal Separation — P&ID Simulator

Browser-based, interactive P&ID / flowsheet simulator for thermal separation
processes (distillation, extraction/absorption, crystallisation, chromatography).

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · `@xyflow/react` · Zustand
· Tremor + Recharts (analysis panel).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm test           # engine unit tests (vitest)
```

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | React Flow canvas, custom P&ID nodes (Feed, Mixer, Heater, Column), Zustand store | ✅ |
| 2 | `thermodynamics.ts` — Raoult/Dalton VLE, Antoine, enthalpy balances | ✅ |
| 3 | Engine ↔ UI: unit solve in topological order, live stream propagation | ✅ |
| 4 | McCabe–Thiele side panel (Tremor/Recharts) on column selection | ✅ |

## Data contract

Defined in `src/types/process.ts`. Internal units: kmol/h, **K**, kPa, kW
(°C is used only at the UI boundary).

```ts
// Stream (edge)
{ id, source, target, flowRate, temperature, pressure, vaporFraction /* q */, molarFractions: { compA, compB } }

// Unit operation (node)
{ id, type: 'feed' | 'mixer' | 'heater' | 'distillation',
  params: { theoreticalStages, refluxRatio, heatDuty, condenserType?, distillateToFeed?, feedSpec? },
  state:  { topProduct, bottomProduct } }
```

Extensions to the original contract: `type: 'feed'` (boundary streams), and the
optional params `condenserType` (`total` = 0 equilibrium stages, `partial` = +1),
`distillateToFeed` (D/F — closes the column rating problem) and `feedSpec`
(`'T'` → q computed, `'q'` → T computed; at fixed P and z they are not independent).
`useFlowsheet.getState().getUnitPayloads()` / `getStreamPayloads()` serialise the
canvas to exactly this schema.

## Thermodynamics engine (`src/engine/`)

Ideal property package: ideal liquid (γ = 1) + ideal gas, Raoult/Dalton
K-values `Kᵢ = Pᵢ°(T)/P`, Antoine vapour pressures. Enthalpy reference is the
pure liquid at 298.15 K; latent heat follows Kirchhoff's law from ΔHvap(Tb).

| Function | Purpose |
|---|---|
| `vaporPressure`, `saturationTemperature` | Antoine P°(T) and its analytic inverse |
| `bubbleTemperature`, `dewTemperature`, `bubblePressure`, `dewPressure` | Saturation points |
| `relativeVolatility`, `averageRelativeVolatility` | α(T) and column-average α |
| `yFromAlpha`, `xFromAlpha`, `equilibriumCurveAlpha`, `txyDiagram` | Equilibrium curves |
| `flashTP` (Rachford–Rice), `flashPH` | Isothermal and isenthalpic flash |
| `thermalCondition`, `stateFromThermalCondition` | Feed q ↔ (T, β) |
| `mixStreams`, `heatStream` | Adiabatic mixer and heater/cooler balances |
| `validityWarnings` | Antoine-range / Tc diagnostics |

Core functions take composition vectors (multicomponent-ready for MESH);
`binaryComponents`, `toVector`, `toBinary` adapt to the `{ compA, compB }` schema.
Components: benzene, toluene, n-hexane, n-heptane (default system benzene/toluene).
Polar/associating mixtures are excluded — Raoult's law does not apply to them.

### Flowsheet solver (`engine/flowsheet.ts`)

Sequential-modular: units are solved in topological order on every parameter
change, so downstream nodes update in the same render. Feed → (T or q) spec;
mixer → adiabatic mass/enthalpy balance + PH flash; heater → H_out = H_in + 3600·Q/F
+ PH flash; column → McCabe–Thiele rating (`engine/mccabeThiele.ts`: CMO,
column-average α, optimal feed stage, x_D solved by Brent so the reboiler liquid
equals x_B), products at bubble/dew point, condenser/reboiler duties from
rigorous enthalpies. Recycle loops are detected and flagged (not yet solved).
Each unit reports `ok / warning / error / idle` diagnostics (status LED on the node).

Validation (benzene/toluene, 1 atm, z = 0.5): bubble 92.1 °C, y = 0.714,
dew 98.8 °C, α̅ = 2.47 — matching textbook values.

## Column analysis panel (`components/analysis/`)

Selecting a distillation node docks a panel beside the canvas (lazy-loaded):

- **KPI cards** (Tremor): distillate / bottoms purity, R/Rmin with an
  optimum-range badge, reboiler and condenser duty, feed stage and q.
- **McCabe–Thiele** (Recharts): constant-α equilibrium curve, y = x, rectifying
  (solid) and stripping (dashed) operating lines, q-line to the equilibrium
  pinch, stage staircase from x_D to x_B, highlighted feed stage, hover tooltip
  per stage. A partial condenser appears as the first step.
- **T–x–y**: rigorous Raoult envelope at column pressure with crosshair tooltip
  and the F / D / B stream points.
- **Stage table**: x, y and bubble-point temperature per stage (table view of
  the diagram).

Everything is driven by the store, so the panel redraws as sliders move.
Chart colours were validated for colour-vision deficiency on the dark surface
(`vizTokens.ts`); line style and direct labels carry identity alongside colour.

## Layout

```
src/
  types/process.ts          schema + port definitions
  engine/                   thermodynamics.ts, components.ts, numerics.ts + tests
  store/flowsheetStore.ts   Zustand store, propagation hook, demo flowsheet
  nodes/                    custom P&ID nodes (SVG symbols, glass instrument cards)
  edges/StreamEdge.tsx      phase-coloured pipe with live data tag
  components/               palette, inspector (shadcn sliders), status bar, canvas
  components/analysis/      McCabe–Thiele, T–x–y, stage table, KPI panel + chart data builders
```

## References

Thermodynamic and numerical methods are implemented independently from
published equations; the following projects are used as logic references only
(no code is copied — DWSIM and CADET are GPL-licensed):
DWSIM, CADET, ThermalSeparation (Modelica), and the McCabe–Thiele simulators by
trsav, 314arhaam and minangajayasekera-ops.
