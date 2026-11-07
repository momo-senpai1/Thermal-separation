# Thermal Separation — P&ID Simulator

Browser-based, interactive P&ID / flowsheet simulator for thermal separation
processes (distillation, extraction/absorption, crystallisation, chromatography).

**Stack:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · `@xyflow/react` · Zustand
· Tremor + Recharts (analysis panel).

## Run locally

Requires **Node.js 20.19+ or 22+** (`node -v`).

```bash
git clone https://github.com/momo-senpai1/Thermal-separation.git
cd Thermal-separation
npm ci            # install exact locked dependencies
npm run dev       # dev server with hot reload → http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm test` | Unit + integration tests (vitest, 165 tests) |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Type-check + production bundle in `dist/` |
| `npm run preview` | Serve the production build → http://localhost:4173 |

## Deploy on GitHub Pages

`.github/workflows/deploy-pages.yml` builds, tests and publishes on every push to
`main` (or manually from the Actions tab). One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Merge to `main` (or run the workflow manually: **Actions → Deploy to GitHub Pages → Run workflow**).
3. The site appears at `https://momo-senpai1.github.io/Thermal-separation/`.

GitHub Pages on a **private** repository needs a paid plan (Pro/Team/Enterprise);
otherwise make the repository public, or deploy `dist/` to any static host
(Vercel, Netlify, Cloudflare Pages: build command `npm run build`, output `dist`).
The base path comes from `VITE_BASE` (set automatically by the workflow).

`.github/workflows/ci.yml` runs type-check, tests and build on every push and PR.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | React Flow canvas, custom P&ID nodes (Feed, Mixer, Heater, Column), Zustand store | ✅ |
| 2 | `thermodynamics.ts` — Raoult/Dalton VLE, Antoine, enthalpy balances | ✅ |
| 3 | Engine ↔ UI: unit solve in topological order, live stream propagation | ✅ |
| 4 | McCabe–Thiele side panel (Tremor/Recharts) on column selection | ✅ |

## Modules

The header switches between modules (hash routes, so links work on static hosting):

| Route | Module |
|---|---|
| `#/flowsheet` | P&ID flowsheet: feeds, mixer, heater, distillation column, **batch still** |
| `#/mccabe-thiele` | McCabe–Thiele design workbench |
| `#/batch` | Batch distillation workbench |
| `#/distillation-lines` | Ternary distillation lines, border lines and product regions |
| `#/extraction?tool=cross\|counter\|hn` | Cross-current, counter-current and Hunter–Nash extraction |
| `#/absorption` | Gas absorption and stripping (Henry's law, Kremser, NTU/HTU) |
| `#/evaporation` | Single/multiple-effect evaporation, steam economy, MVR |
| `#/crystallization` | Solubility, cooling/evaporative yield, MSMPR crystal size distribution |
| `#/drying` | Psychrometrics, drying curves and time, continuous dryer air/heat |
| `#/equipment` | Equipment library — 32 items across all topics, linked to the calculators |

Planned: reactive extraction, adsorption.

### Feed materials (flowsheet)

The flowsheet's **Feed materials** picker selects the two components (water,
methanol, ethanol, acetone, benzene, toluene, p-xylene, n-hexane, n-heptane,
cyclohexane). `engine/propertyPackage.ts` decides the model per pair:
Raoult for similar hydrocarbons and methanol/ethanol; **Wilson** for
ethanol/water and methanol/water (fitted to Perry's VLE — within 0.02 in y,
ethanol azeotrope at 78.2 °C) and for acetone/methanol and benzene/cyclohexane
(fitted to their azeotropes). Pairs that form two liquid phases (water +
hydrocarbons) or lack validated parameters are refused with the reason. With
an activity model the column and batch still step on the real equilibrium
curve (tangent-pinch R_min, total-reflux N_min, azeotrope limit). A **flash
drum** unit (heat duty + drum pressure) is available in the palette.

### Flowsheet equipment

Drag any unit from the palette onto the canvas and wire it up:

- **Streams:** feed, mixer, splitter (fraction to outlet 1).
- **Heat & pressure:** heater, cooler/condenser (duty Q < 0), pump
  (W = V̇·Δp/η from liquid densities), valve (isenthalpic let-down, flashes if
  the outlet crosses the bubble point).
- **Separation:** column (trays with an overall efficiency or packing with an
  HETP — the node shows real trays or packed height), flash drum, evaporator
  (set the vaporized fraction, the duty is computed), batch still.
- **Process blocks:** absorber/stripper, extraction column, multiple-effect
  evaporator, crystallizer and dryer. Each one is a standalone block with its own
  feed specification, solved by the same engine as its workbench page. The
  inspector edits the block and links to the full module.

### Theme and languages

- **Light and dark mode:** use the sun/moon button in the header. The first
  visit follows the operating system; the choice is then stored in the browser.
  All colours, including chart colours, are CSS variables (`src/index.css`).
- **English, German and Kurdish (Kurmanji, Latin script):** use the EN / DE / KU
  switch in the header. Strings are keyed by their English text (`src/i18n/`).
  Missing entries fall back to English, and chemical names inside longer labels
  are translated term by term. Navigation, panels, controls, palette, inspector
  and equipment names are translated. Longer explanatory paragraphs are still in
  English. The Kurdish wording needs review by a native speaker; corrections go
  in `src/i18n/ku.ts`.

### Unit operations

- **Absorption / stripping** (`engine/absorption.ts`): Henry constants for NH₃,
  acetone, SO₂, H₂S, CO₂ (absorption) and benzene, toluene, O₂ (stripping) with
  temperature dependence; loading-ratio equilibrium, minimum L/G or G/L, stage
  stepping vs Kremser, packed height from NTU × HTU.
- **Evaporation** (`engine/evaporation.ts`): forward-feed multiple effects
  designed for equal areas, boiling-point elevation, steam economy vs number of
  effects, MVR compressor power and COP.
- **Crystallization** (`engine/crystallization.ts`): CRC solubility tables,
  yield and duties for cooling and evaporative crystallization, MSMPR
  distribution (dominant size 3Gτ, cumulative undersize).
- **Drying** (`engine/drying.ts`): humidity, enthalpy, wet bulb, dew point;
  constant- and falling-rate drying time; adiabatic continuous dryer with the
  air path on a psychrometric chart.

### McCabe–Thiele workbench (`engine/mtDesign.ts`)

- **VLE systems** (`engine/vle/systems.ts`): constant α; benzene/toluene and
  n-hexane/n-heptane (Raoult); methanol/water (Perry's datasheet); ethanol/water
  and isopropanol/water (Van Laar — azeotropes at x ≈ 0.91 and 0.66, validated
  against literature).
- **Calculation targets:** number of stages (fractional last stage), bottoms
  x_B for a given N, distillate x_D for a given N.
- **Murphree efficiency** on pseudo-equilibrium curves (kinked at the section switch).
- **Fixed feed stage** with dashed operating-line extensions; pinch and
  "feed below the column end" detection.
- **Azeotropes:** specifications must lie on one side; above the azeotrope the
  column is solved mirrored (x′ = 1 − x) and drawn under the diagonal.
- **Shortcuts (constant α):** Fenske N_min, Underwood v_min (binary, exact θ),
  Gilliland via Liddle's fit (slide misprints corrected) with an N–v chart,
  asymptotes and the 1.05–1.5·v_min design band.
- The unit tests reproduce every reference value of the workbench specification
  (N = 15.01, v_min = 2.123, Gilliland 15.62, the feed-stage table, Murphree cases, …).

### Batch distillation workbench (`engine/batch.ts`)

Open distillation (Rayleigh), batch rectification at constant reflux and at
constant distillate purity. Play / scrub the batch progress D/L₀; the y–x
construction, still / instantaneous / collected compositions, reflux, boil-up
and recovery follow. The flowsheet's **batch still** uses the same engine
(inlet = charge per cycle, outlets = receiver and residue at the chosen cut) and
can open the workbench pre-filled.

### Distillation lines (`engine/ternary/`)

Three components on one triangle, at total reflux (x_{n+1} = y*(x_n), every
point a stage):

- **Systems:** n-hexane / cyclohexane / n-heptane (ideal, zeotropic reference)
  and acetone / chloroform / methanol (Wilson). Each Wilson binary is fitted to
  its literature azeotrope at 1 atm; the ternary saddle azeotrope is then a
  *prediction* — 57.3 °C at (0.355, 0.213, 0.432) vs. ≈ 57.5 °C in the literature.
- **Singular points** found and classified from the stage map's Jacobian
  (light node / heavy node / saddle); **border lines** traced from saddle
  eigen-directions; the field seeded from heavy nodes and saddles, with arrows
  towards rising temperature.
- **Product regions** for a feed: between the distillation line through F and
  the direct / indirect splits, closed along the triangle edges or a border line.
- **Column at total reflux:** drag F and D; B follows from the material balance
  on the D–F line, chosen so that D and B share a distillation line; stage count
  and D/F are reported. *Snap D onto the line* iterates to a consistent split.
- Pressure slider moves the azeotropes (ternary saddle 51.5 °C at ≈ 0.81 bar).

### Extraction (`engine/extraction/`)

Three tools on one shared specification (X₀, Y₀, X_N, Ġ/L̇ per system), so they
compare number for number:

- **Cross-current** (loading diagram): one operating line per stage from the
  solvent line, whole stages, extraction factor per stage, pooled extract,
  X*(Y₀) limit; targets: stages, raffinate for given N, solvent ratio for given N.
- **Counter-current:** one operating line stepped off from the feed end,
  fractional stages, minimum solvent ratio (tangent pinch) and the one-stage
  ratio; same three targets; side-by-side solvent comparison with cross-current.
- **Hunter–Nash** (ternary, partly miscible): mixing point, E₁ by the lever
  rule, pole Δ = F − E₁ = R_N − S, stages from the feed end, S/F_min (tie-line
  pinch) and S/F_max (M reaches the binodal).

LLE systems (`lle.ts`): Water / Acetic acid / Isopropyl ether and Water /
Nicotine / Kerosene from Treybal's tables; Water with acetone or ethanol and
toluene, benzene or MIBK predicted with UNIFAC (`unifac.ts`, Hansen et al. 1991)
and an LLE flash continued to the plait point. The UNIFAC implementation is
checked against literature γ∞ (benzene and toluene in water, water in the
aromatics) and mutual solubilities; tie lines are verified isoactive. UNIFAC
systems are labelled as predictions in the UI.

## Data contract

Defined in `src/types/process.ts`. Internal units: kmol/h, **K**, kPa, kW
(°C is used only at the UI boundary).

```ts
// Stream (edge)
{ id, source, target, flowRate, temperature, pressure, vaporFraction /* q */, molarFractions: { compA, compB } }

// Unit operation (node)
{ id, type: 'feed' | 'mixer' | 'heater' | 'distillation' | 'batch' | 'flash',
  params: { theoreticalStages, refluxRatio, heatDuty, condenserType?, distillateToFeed?, feedSpec?, batchMode?, distilledFraction? },
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
