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
export type UnitType = 'feed' | 'mixer' | 'heater' | 'distillation';

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
}

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

export type UnitNodeData = {
  /** ISA-style equipment tag, e.g. "T-401" */
  tag: string;
  label: string;
  params: UnitParams;
  state: UnitState;
};

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
} satisfies Record<UnitType, { inlets: readonly string[]; outlets: readonly string[] }>;

/** Which unit-state slot an outlet port reads from. */
export const outletSlot = (handle: string | null | undefined): keyof UnitState =>
  handle === 'bottoms' ? 'bottomProduct' : 'topProduct';
