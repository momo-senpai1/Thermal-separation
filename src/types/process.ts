/**
 * Canonical data schema for the flowsheet.
 *
 * Units (internal, SI-flavoured — convert only at the UI boundary):
 *   flowRate     kmol/h
 *   temperature  K
 *   pressure     kPa
 *   heatDuty     kW
 *   vaporFraction (q)  — thermal condition of the feed, q = (H_V - H_F)/(H_V - H_L):
 *                        q = 1 saturated liquid, q = 0 saturated vapour,
 *                        q > 1 subcooled liquid, q < 0 superheated vapour.
 *   molarFractions — binary A/B system (A = light key), must sum to 1.
 */

export interface MolarFractions {
  compA: number;
  compB: number;
}

/** Thermodynamic conditions of a stream, independent of its topology. */
export type StreamConditions = {
  flowRate: number;
  temperature: number;
  pressure: number;
  vaporFraction: number;
  molarFractions: MolarFractions;
};

/** Stream payload (edges) — strict contract for all canvas interactions. */
export type StreamPayload = StreamConditions & {
  id: string;
  source: string;
  target: string;
};

/**
 * `feed` extends the original contract ('distillation' | 'mixer' | 'heater')
 * so that boundary streams can be specified on the canvas.
 */
export type UnitType =
  | 'feed'
  | 'mixer'
  | 'splitter'
  | 'heater'
  | 'cooler'
  | 'pump'
  | 'valve'
  | 'distillation'
  | 'batch'
  | 'flash'
  | 'evaporator'
  // standalone process blocks (their own feed, no stream ports)
  | 'absorber'
  | 'extractor'
  | 'evaptrain'
  | 'crystallizer'
  | 'dryer';

/** Unit types that are self-contained process blocks (no material-stream ports). */
export const BLOCK_TYPES = ['absorber', 'extractor', 'evaptrain', 'crystallizer', 'dryer'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const isBlock = (t: string | undefined): t is BlockType => (BLOCK_TYPES as readonly string[]).includes(t ?? '');

export type CondenserType = 'total' | 'partial';

export interface UnitParams {
  theoreticalStages: number;
  refluxRatio: number;
  heatDuty: number;
  /**
   * Extension: total condenser contributes 0 equilibrium stages,
   * partial condenser contributes 1. Only meaningful for 'distillation'.
   */
  condenserType?: CondenserType;
  /** Extension (distillation): distillate-to-feed ratio D/F — closes the rating problem. */
  distillateToFeed?: number;
  /**
   * Extension (feed): which thermal variable is specified. 'T' → q is computed;
   * 'q' → T is computed. At fixed P and z the two are not independent.
   */
  feedSpec?: FeedSpec;
  /** Extension (flash drum, evaporator): drum pressure, kPa (default: inlet pressure) */
  flashPressure?: number;
  /** Extension (pump, valve): outlet pressure, kPa */
  outletPressure?: number;
  /** Extension (pump): efficiency */
  efficiency?: number;
  /** Extension (splitter): fraction of the inlet to outlet 1 */
  splitFraction?: number;
  /** Extension (evaporator): fraction of the feed to vaporize, V/F */
  targetVF?: number;
  /** Extension (distillation): column internals */
  internals?: 'trays' | 'packing';
  /** Extension (distillation): overall tray efficiency */
  trayEfficiency?: number;
  /** Extension (distillation): height equivalent to a theoretical plate, m */
  hetp?: number;
  /** Extension (process blocks): the block's own specification */
  block?: Record<string, number | string>;
  /** Extension (batch still): operating mode */
  batchMode?: 'rayleigh' | 'constant-reflux';
  /** Extension (batch still): distilled fraction D/L₀ at which the cut is taken */
  distilledFraction?: number;
}

export type FeedSpec = 'T' | 'q';

export interface UnitState {
  /** feed/mixer/heater: the outlet stream · distillation: distillate (D) */
  topProduct: StreamConditions | null;
  /** distillation: bottoms (B) · otherwise null */
  bottomProduct: StreamConditions | null;
}

/** Unit operation payload (nodes) — strict contract for all canvas interactions. */
export interface UnitOperationPayload {
  id: string;
  type: UnitType;
  params: UnitParams;
  state: UnitState;
}

// ---------------------------------------------------------------------------
// React Flow data carriers (payload + presentation-only fields)
// ---------------------------------------------------------------------------

export type SolveStatus = 'idle' | 'ok' | 'warning' | 'error';

export interface Diagnostics {
  status: SolveStatus;
  messages: string[];
}

/** Column results beyond the strict payload (flows, duties, stage profile). */
export interface ColumnResults {
  alpha: number;
  D: number;
  B: number;
  xD: number;
  xB: number;
  feedStage: number;
  Rmin: number;
  Nmin: number;
  /** condenser duty, kW (negative = heat removed) */
  Qc: number;
  /** reboiler duty, kW */
  Qr: number;
  /** column feed as seen by the solver (for McCabe–Thiele plotting) */
  zF: number;
  q: number;
  steps: { stage: number; x: number; y: number; section: 'condenser' | 'rectifying' | 'stripping' }[];
  rectifying: { slope: number; intercept: number };
  stripping: { slope: number; intercept: number };
  intersection: { x: number; y: number };
  pinch: { x: number; y: number };
  /** equilibrium curve used (non-ideal packages); null → constant α */
  curve?: { x: number[]; y: number[] } | null;
}

export type UnitNodeData = {
  /** ISA-style equipment tag, e.g. "T-401" */
  tag: string;
  label: string;
  params: UnitParams;
  state: UnitState;
  /** solver output — presentation only, not part of the payload */
  diag?: Diagnostics;
  column?: ColumnResults | null;
  batch?: BatchResults | null;
  /** process-block results: [label, value, unit] rows */
  block?: { rows: [string, string, string][] } | null;
  /** extra result rows for stream units (pump power, evaporator duty, …) */
  extra?: [string, string, string][] | null;
};

/** Batch-still results (per batch, at the chosen cut). */
export interface BatchResults {
  alpha: number;
  xW: number;
  xDavg: number;
  recovery: number;
  boilup: number;
  /** last reachable cut D/L₀ */
  dEnd: number;
}

export type StreamEdgeData = StreamConditions & {
  /** Stream tag, e.g. "S-03" */
  tag: string;
  /** false until upstream unit has produced conditions for this port */
  resolved: boolean;
};

/** Port (handle) ids per unit type — single source of truth for wiring. */
export const PORTS = {
  feed: { inlets: [] as const, outlets: ['out'] as const },
  mixer: { inlets: ['in-1', 'in-2'] as const, outlets: ['out'] as const },
  heater: { inlets: ['in'] as const, outlets: ['out'] as const },
  distillation: { inlets: ['feed'] as const, outlets: ['distillate', 'bottoms'] as const },
  batch: { inlets: ['charge'] as const, outlets: ['distillate', 'residue'] as const },
  flash: { inlets: ['in'] as const, outlets: ['vapor', 'liquid'] as const },
  evaporator: { inlets: ['in'] as const, outlets: ['vapor', 'liquid'] as const },
  splitter: { inlets: ['in'] as const, outlets: ['out-1', 'out-2'] as const },
  cooler: { inlets: ['in'] as const, outlets: ['out'] as const },
  pump: { inlets: ['in'] as const, outlets: ['out'] as const },
  valve: { inlets: ['in'] as const, outlets: ['out'] as const },
  absorber: { inlets: [] as const, outlets: [] as const },
  extractor: { inlets: [] as const, outlets: [] as const },
  evaptrain: { inlets: [] as const, outlets: [] as const },
  crystallizer: { inlets: [] as const, outlets: [] as const },
  dryer: { inlets: [] as const, outlets: [] as const },
} satisfies Record<UnitType, { inlets: readonly string[]; outlets: readonly string[] }>;

/** Which unit-state slot an outlet port reads from. */
export const outletSlot = (handle: string | null | undefined): keyof UnitState =>
  handle === 'bottoms' || handle === 'residue' || handle === 'liquid' || handle === 'out-2' ? 'bottomProduct' : 'topProduct';
