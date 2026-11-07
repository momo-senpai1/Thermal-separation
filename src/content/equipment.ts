/**
 * Equipment library: what each piece of thermal-separation equipment is for,
 * when to choose it, and the design parameters that matter. Texts are short
 * engineering summaries in the spirit of Stichlmair & Fair and Mersmann et al.
 */

import type { Route } from '@/lib/route';

export type Topic = 'distillation' | 'evaporation' | 'drying' | 'absorption' | 'extraction' | 'crystallization' | 'auxiliary';

export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'distillation', label: 'Distillation & rectification' },
  { id: 'evaporation', label: 'Evaporation & concentration' },
  { id: 'drying', label: 'Drying' },
  { id: 'absorption', label: 'Absorption & stripping' },
  { id: 'extraction', label: 'Liquid–liquid extraction' },
  { id: 'crystallization', label: 'Crystallization' },
  { id: 'auxiliary', label: 'Auxiliary & process support' },
];

export interface Equipment {
  id: string;
  topic: Topic;
  name: string;
  /** one-line description */
  summary: string;
  /** when to choose it */
  use: string;
  /** limits / when not to */
  limits: string;
  /** design parameters that matter */
  params: string[];
  /** where it can be tried in the app */
  tryIt?: { route: Route; label: string; query?: Record<string, string> };
}

export const EQUIPMENT: Equipment[] = [
  // ---------------- distillation
  {
    id: 'tray-column', topic: 'distillation', name: 'Tray column (sieve, valve, bubble-cap)',
    summary: 'Vertical vessel with horizontal trays; vapour bubbles through the liquid on each tray, liquid flows down through downcomers.',
    use: 'Large diameters, high liquid loads, fouling service, side draws; valve trays give a wide turndown.',
    limits: 'Pressure drop ~5–10 mbar per tray — poor for deep vacuum; foaming and weeping limit the operating window.',
    params: ['tray spacing 0.45–0.6 m', 'F-factor / flooding 70–85 %', 'tray efficiency 50–80 %', 'weir height, downcomer area'],
    tryIt: { route: 'mccabe-thiele', label: 'Size the stages in McCabe–Thiele' },
  },
  {
    id: 'packed-column', topic: 'distillation', name: 'Packed column (random or structured packing)',
    summary: 'Column filled with Raschig/Pall rings or corrugated-sheet structured packing that spreads the liquid into a large film area.',
    use: 'Vacuum distillation (low pressure drop), small diameters, corrosive or heat-sensitive systems.',
    limits: 'Needs good liquid distribution and redistributors every 5–10 m; sensitive to low liquid loads and fouling.',
    params: ['HETP 0.2–0.6 m', 'specific area 125–750 m²/m³', 'pressure drop ~1 mbar/m', 'flooding point'],
    tryIt: { route: 'flowsheet', label: 'Rate a column in the flowsheet' },
  },
  {
    id: 'kettle-reboiler', topic: 'distillation', name: 'Kettle reboiler',
    summary: 'Horizontal shell with a submerged tube bundle; vapour disengages above the pool and returns to the column.',
    use: 'Robust, one theoretical stage, easy control; wide range of vaporisation ratios.',
    limits: 'Long residence time (heat-sensitive products), large shell, fouling on the pool side.',
    params: ['heat flux 20–40 kW/m²', 'vapour space for disengagement', 'weir height'],
  },
  {
    id: 'thermosiphon-reboiler', topic: 'distillation', name: 'Thermosiphon reboiler',
    summary: 'Vertical (or horizontal) exchanger driven by natural circulation: the density difference of the two-phase return lifts the liquid.',
    use: 'Most common reboiler — compact, cheap, short residence time.',
    limits: 'Needs liquid head; unstable at low ΔT or high vacuum; limited vaporisation per pass (10–35 %).',
    params: ['circulation ratio', 'static head', 'heat flux ≤ 60 kW/m²'],
  },
  {
    id: 'forced-reboiler', topic: 'distillation', name: 'Forced-circulation reboiler',
    summary: 'A pump drives the bottoms through the heater at high velocity; little or no boiling in the tubes.',
    use: 'Viscous or fouling bottoms, vacuum service where natural circulation fails.',
    limits: 'Pump cost and power; seals.',
    params: ['tube velocity 1.5–3 m/s', 'pump head', 'heat flux'],
  },
  {
    id: 'condenser', topic: 'distillation', name: 'Overhead condenser',
    summary: 'Shell-and-tube (or air) exchanger that condenses the top vapour totally or partially; a partial condenser adds one equilibrium stage.',
    use: 'Every column; partial condensers when the distillate is wanted as vapour or contains non-condensables.',
    limits: 'Non-condensables blanket the surface — vent them; sub-cooling affects reflux.',
    params: ['duty Q_c', 'cooling-water ΔT', 'vent rate', 'total vs partial'],
    tryIt: { route: 'flowsheet', label: 'Switch total/partial on T-401' },
  },
  {
    id: 'reflux-drum', topic: 'distillation', name: 'Reflux drum',
    summary: 'Horizontal vessel that collects the condensate and splits it into reflux and distillate; a boot collects a second liquid phase.',
    use: 'Buffers the reflux pump, separates water from hydrocarbon condensate, vents gases.',
    limits: 'Hold-up adds inventory and response time.',
    params: ['residence time 5–10 min', 'L/D 2.5–5', 'boot for water'],
  },
  // ---------------- evaporation
  {
    id: 'falling-film', topic: 'evaporation', name: 'Falling-film evaporator',
    summary: 'Liquid is distributed at the top of vertical tubes and flows down as a thin film while it boils.',
    use: 'Heat-sensitive products (milk, juices): short residence time, small ΔT, high heat-transfer coefficients; ideal for multiple effects and MVR.',
    limits: 'Needs a good distributor and a minimum wetting rate; poor with crystallizing or heavily fouling liquids.',
    params: ['wetting rate', 'U 1500–3500 W/m²K', 'ΔT 3–10 K', 'tube length 6–12 m'],
    tryIt: { route: 'evaporation', label: 'Design a multiple-effect plant' },
  },
  {
    id: 'rising-film', topic: 'evaporation', name: 'Rising (climbing) film evaporator',
    summary: 'Liquid enters at the bottom of long tubes; the vapour formed carries a film of liquid up the walls.',
    use: 'Low-viscosity, foaming liquids; no feed pump needed for the circulation.',
    limits: 'Needs a large ΔT to start the climbing film; long residence at the bottom.',
    params: ['ΔT ≥ 15 K', 'tube length 5–8 m', 'U 1000–2500 W/m²K'],
  },
  {
    id: 'forced-evaporator', topic: 'evaporation', name: 'Forced-circulation evaporator',
    summary: 'A large pump circulates the liquor through a heater under enough pressure to suppress boiling; it flashes in the separator.',
    use: 'Fouling, viscous or crystallizing liquors (salt, effluents) — boiling never happens on the heating surface.',
    limits: 'Pump power; higher cost.',
    params: ['tube velocity 1.5–3 m/s', 'superheat in heater 2–5 K', 'flash ΔT'],
    tryIt: { route: 'crystallization', label: 'Evaporative crystallization' },
  },
  {
    id: 'mvr', topic: 'evaporation', name: 'Mechanical vapour recompression (MVR)',
    summary: 'A fan or compressor raises the vapour pressure a few kelvin so the vapour can heat its own evaporator.',
    use: 'Large evaporation rates where electricity is cheap relative to steam: equivalent to 15–40 effects.',
    limits: 'Small temperature lift (BPE eats into it); compressor capital cost.',
    params: ['temperature lift 5–15 K', 'specific energy 10–30 kWh/t', 'isentropic efficiency'],
    tryIt: { route: 'evaporation', label: 'Compare MVR with steam' },
  },
  {
    id: 'tvr', topic: 'evaporation', name: 'Thermal vapour recompression (TVR)',
    summary: 'A steam-jet thermocompressor entrains part of the vapour with high-pressure motive steam and feeds the mixture to the heater.',
    use: 'Cheap, no moving parts; adds roughly one effect of economy.',
    limits: 'Needs motive steam at higher pressure; fixed design point.',
    params: ['entrainment ratio', 'motive pressure', 'compression ratio'],
  },
  // ---------------- drying
  {
    id: 'rotary-dryer', topic: 'drying', name: 'Rotary dryer',
    summary: 'Slightly inclined rotating drum with lifting flights that shower the solid through hot gas.',
    use: 'High throughputs of free-flowing bulk solids (minerals, fertilisers, biomass).',
    limits: 'Attrition, dust; poor for sticky or very fine solids.',
    params: ['fill 10–15 %', 'retention time', 'gas velocity', 'flight design'],
    tryIt: { route: 'drying', label: 'Air and heat for a continuous dryer' },
  },
  {
    id: 'fluid-bed', topic: 'drying', name: 'Fluidized-bed dryer',
    summary: 'Hot gas flows up through a perforated plate and fluidizes the particles: intense mixing, uniform temperature.',
    use: 'Granular solids 50 µm–5 mm (pharma, food, polymers); excellent heat and mass transfer.',
    limits: 'Needs fluidizable particles; elutriation of fines; broad residence-time distribution in single stage.',
    params: ['superficial velocity 1.5–3 × u_mf', 'bed height', 'plate pressure drop'],
    tryIt: { route: 'drying', label: 'Drying curve and time' },
  },
  {
    id: 'spray-dryer', topic: 'drying', name: 'Spray dryer',
    summary: 'The liquid feed is atomized (wheel or nozzle) into a hot-gas chamber; droplets dry in seconds to a powder.',
    use: 'Solutions and slurries straight to powder — milk, coffee, ceramics, detergents; heat-sensitive thanks to evaporative cooling.',
    limits: 'Low thermal efficiency, large chamber, fines recovery (cyclone, bag filter).',
    params: ['inlet/outlet gas temperature', 'droplet size 20–200 µm', 'residence 5–30 s'],
  },
  {
    id: 'flash-dryer', topic: 'drying', name: 'Flash (pneumatic) dryer',
    summary: 'Wet solids are dispersed into a fast hot-gas stream and dried while being conveyed up a duct.',
    use: 'Removing surface moisture from fine, heat-sensitive particles in seconds.',
    limits: 'Only surface (constant-rate) moisture; abrasion.',
    params: ['gas velocity 10–30 m/s', 'residence 0.5–5 s', 'duct length'],
  },
  {
    id: 'freeze-dryer', topic: 'drying', name: 'Vacuum / freeze dryer (lyophilizer)',
    summary: 'The frozen product loses its ice by sublimation under deep vacuum; a cold condenser traps the vapour.',
    use: 'Pharmaceuticals, biologics, premium foods — the most temperature-sensitive materials.',
    limits: 'Very slow (hours to days), expensive per kg of water.',
    params: ['shelf temperature', 'chamber pressure 0.1–1 mbar', 'condenser temperature'],
  },
  // ---------------- absorption
  {
    id: 'packed-absorber', topic: 'absorption', name: 'Packed absorber (gas scrubber)',
    summary: 'Gas flows up through packing counter-current to a washing liquid that takes up the soluble component.',
    use: 'Gas cleaning (NH₃, SO₂, HCl, VOC), CO₂ capture with amines; low pressure drop.',
    limits: 'Liquid distribution, flooding; large columns for poorly soluble gases (high m).',
    params: ['L/G ≈ 1.2–2 × minimum', 'NTU × HTU = height', 'HTU 0.3–1 m', 'absorption factor A'],
    tryIt: { route: 'absorption', label: 'Design an absorber' },
  },
  {
    id: 'tray-absorber', topic: 'absorption', name: 'Tray absorber',
    summary: 'Column with trays where the gas bubbles through the solvent on each stage.',
    use: 'High liquid rates, solids or fouling, when cooling coils are needed on the trays.',
    limits: 'Higher pressure drop than packing.',
    params: ['theoretical stages (Kremser)', 'tray efficiency', 'L/G'],
    tryIt: { route: 'absorption', label: 'Stages by Kremser' },
  },
  {
    id: 'stripper', topic: 'absorption', name: 'Stripper (desorber)',
    summary: 'Column in which steam or an inert gas drives a dissolved volatile component out of the liquid.',
    use: 'Solvent regeneration after absorption, VOC removal from water, deaeration of boiler feed water.',
    limits: 'Needs a large stripping factor S = m·G/L > 1; steam strippers add heat.',
    params: ['G/L vs minimum', 'stripping factor', 'temperature (raises m)'],
    tryIt: { route: 'absorption', label: 'Design an air stripper', query: { mode: 'strip' } },
  },
  // ---------------- extraction
  {
    id: 'mixer-settler', topic: 'extraction', name: 'Mixer–settler',
    summary: 'Each stage is a stirred mixer followed by a gravity settler; stages are connected counter-currently.',
    use: 'Few stages, high throughput, very reliable stage efficiency (~100 %); metallurgy, nuclear.',
    limits: 'Large footprint and solvent inventory.',
    params: ['stage efficiency', 'settler area (phase disengagement)', 'phase ratio'],
    tryIt: { route: 'extraction', label: 'Counter-current stages', query: { tool: 'counter' } },
  },
  {
    id: 'rdc', topic: 'extraction', name: 'Rotating-disc contactor (RDC)',
    summary: 'Column with a central shaft carrying discs between stator rings; rotation disperses one phase into droplets.',
    use: 'Medium throughput, many stages in one column, tolerant to solids.',
    limits: 'Axial mixing lowers efficiency in large columns.',
    params: ['rotor speed', 'HETS', 'hold-up', 'flooding'],
    tryIt: { route: 'extraction', label: 'Hunter–Nash stages', query: { tool: 'hn' } },
  },
  {
    id: 'kuhni', topic: 'extraction', name: 'Kühni agitated column',
    summary: 'Compartmented column with turbine impellers and perforated partitions that limit back-mixing.',
    use: 'High stage count per metre, adjustable agitation for systems with varying interfacial tension.',
    limits: 'Mechanical complexity; emulsifying systems.',
    params: ['impeller speed', 'free area of partitions', 'HETS 0.1–0.5 m'],
  },
  {
    id: 'packed-extractor', topic: 'extraction', name: 'Packed or sieve-tray extraction column',
    summary: 'Static column in which the dispersed phase rises or falls through packing or perforated plates.',
    use: 'Simple, no moving parts, low cost for systems with low interfacial tension.',
    limits: 'Few theoretical stages; low efficiency for difficult systems.',
    params: ['dispersed-phase choice', 'HETS', 'flooding capacity'],
  },
  // ---------------- crystallization
  {
    id: 'fc-crystallizer', topic: 'crystallization', name: 'Forced-circulation (FC) crystallizer',
    summary: 'Evaporative crystallizer: the slurry is pumped through an external heater and flashes in the body, where the supersaturation is released on the crystals.',
    use: 'Salts with flat solubility (NaCl, Na₂SO₄) — evaporation, not cooling, makes the yield.',
    limits: 'Secondary nucleation from the pump gives small crystals.',
    params: ['circulation rate', 'ΔT in heater 2–6 K', 'magma density', 'residence time'],
    tryIt: { route: 'crystallization', label: 'Evaporative yield and CSD' },
  },
  {
    id: 'dtb', topic: 'crystallization', name: 'Draft-tube-baffle (DTB) crystallizer',
    summary: 'Internal draft tube with a slow propeller circulates the magma; a baffled settling zone removes fines for dissolution.',
    use: 'Larger, narrowly sized crystals (KCl, (NH₄)₂SO₄) thanks to fines destruction.',
    limits: 'Larger vessel, more complex operation.',
    params: ['fines removal rate', 'propeller tip speed', 'residence time'],
    tryIt: { route: 'crystallization', label: 'MSMPR size distribution' },
  },
  {
    id: 'cooling-crystallizer', topic: 'crystallization', name: 'Cooling crystallizer',
    summary: 'Stirred tank (or scraped-surface exchanger) where the solution is cooled along the solubility curve.',
    use: 'Steep solubility curves (KNO₃, sugar, CuSO₄); batch or continuous.',
    limits: 'Encrustation on cold surfaces — keep wall ΔT small.',
    params: ['cooling profile', 'wall ΔT', 'seeding', 'metastable zone width'],
    tryIt: { route: 'crystallization', label: 'Cooling yield' },
  },
  // ---------------- auxiliary
  {
    id: 'flash-drum', topic: 'auxiliary', name: 'Flash drum / gas–liquid separator',
    summary: 'Vessel in which a two-phase stream separates by gravity; a let-down valve or heater upstream sets the split.',
    use: 'Single-stage separation, knock-out of liquid before compressors, phase separation after reactors.',
    limits: 'One equilibrium stage only.',
    params: ['vapour velocity (Souders–Brown)', 'liquid residence time', 'demister'],
    tryIt: { route: 'flowsheet', label: 'Drop a flash drum into the flowsheet' },
  },
  {
    id: 'demister', topic: 'auxiliary', name: 'Mist eliminator (mesh pad / vane pack)',
    summary: 'Knitted wire mesh or chevron vanes catch entrained droplets from a vapour stream.',
    use: 'Tops of separators, evaporator bodies and absorbers — protects compressors and keeps products clean.',
    limits: 'Mesh fouls with solids; velocity window (re-entrainment above it).',
    params: ['K-factor 0.08–0.11 m/s', 'droplet cut size ~3–10 µm', 'pressure drop'],
  },
  {
    id: 'ejector', topic: 'auxiliary', name: 'Steam-jet ejector',
    summary: 'Motive steam expands through a nozzle and entrains gas from the vacuum side; stages with intercondensers reach deep vacuum.',
    use: 'Vacuum distillation and evaporation; no moving parts, handles corrosive gases.',
    limits: 'Steam consumption; contaminated condensate.',
    params: ['suction pressure', 'motive steam per kg gas', 'number of stages'],
  },
  {
    id: 'liquid-ring', topic: 'auxiliary', name: 'Liquid-ring vacuum pump',
    summary: 'An eccentric impeller forms a rotating liquid ring whose changing pockets compress the gas.',
    use: 'Rough vacuum (30–1000 mbar), wet or condensable gases.',
    limits: 'Limited by the vapour pressure of the ring liquid.',
    params: ['suction capacity', 'ring-liquid temperature', 'power'],
  },
  {
    id: 'shell-tube', topic: 'auxiliary', name: 'Heat exchanger (feed preheater, cross-exchanger, cooler)',
    summary: 'Shell-and-tube or plate exchanger transferring heat between process streams or utilities.',
    use: 'Feed preheating (sets the feed condition q), heat recovery between products and feed, product cooling.',
    limits: 'Fouling margins; temperature cross in single-shell designs.',
    params: ['duty Q = U·A·ΔT_lm', 'approach temperature', 'fouling factors'],
    tryIt: { route: 'flowsheet', label: 'Heater E-301 in the flowsheet' },
  },
];

export const equipmentFor = (topic: Topic) => EQUIPMENT.filter((e) => e.topic === topic);
