/**
 * Balance problems ("Bilanzaufgaben"): a flowsheet of black-box units joined by
 * streams, each stream carrying a molar flow ṅ, mole fractions x_i and a thermal
 * state q. Any of these can be given or unknown; the solver works out the
 * unknowns from the mass and energy balances the way one would by hand.
 */

export type BUnitKind =
  | 'source'
  | 'sink'
  | 'mixer'
  | 'splitter'
  | 'heater'
  | 'cooler'
  /** legacy alias of cooler (heat removed) */
  | 'exchanger'
  | 'pump'
  | 'valve'
  | 'column'
  | 'flash'
  | 'evaporator'
  | 'absorber'
  | 'extractor'
  | 'crystallizer'
  | 'dryer'
  | 'unit';

/** One inlet, one outlet, composition unchanged. */
export const PASS_THROUGH: readonly BUnitKind[] = ['heater', 'cooler', 'exchanger', 'pump', 'valve'];
/** Heat exchangers with an energy balance on q. */
export const THERMAL: readonly BUnitKind[] = ['heater', 'cooler', 'exchanger'];
/** Units with a top and a bottom outlet. */
export const TWO_OUTLETS: readonly BUnitKind[] = ['column', 'flash', 'evaporator', 'absorber', 'extractor', 'crystallizer', 'dryer'];
export type BPort = 'out' | 'top' | 'bottom';

export type CurveSpec =
  | { kind: 'table'; preset?: string; points: [number, number][] }
  | { kind: 'alpha'; alpha: number };

export interface ColumnSettings {
  /** run the McCabe–Thiele construction for this column */
  mt: boolean;
  /** reflux ratio v = L/D */
  v: number;
  /** total: saturated-liquid distillate; partial: vapour distillate, the condenser is a stage */
  condenser: 'total' | 'partial';
  /** index of the component on the diagram axes */
  key: number;
  curve: CurveSpec;
}

export interface BUnit {
  id: string;
  kind: BUnitKind;
  name: string;
  /** heater: heat supplied, cooler/exchanger: heat removed [kJ/h]; null = unknown */
  Q?: number | null;
  /** exchanger: latent heat of the stream [kJ/kmol] */
  dHv?: number | null;
  column?: ColumnSettings;
  /** horizontal position, used to order the solution steps left to right */
  order?: number;
}

export interface BStream {
  id: string;
  name: string;
  from: string;
  fromPort: BPort;
  to: string;
  /** molar flow [kmol/h], null = unknown */
  n: number | null;
  /** mole fractions per component, null = unknown */
  x: (number | null)[];
  /** thermal state (liquid fraction), null = unknown / not needed */
  q: number | null;
}

export interface BProblem {
  components: string[];
  units: BUnit[];
  streams: BStream[];
}

/** Variable keys: n:<stream>, x:<stream>:<i>, q:<stream>, Q:<unit>, H:<unit> (latent heat). */
export type VarKey = string;

export interface Term {
  c: number;
  f: VarKey[];
}

export type EqKind = 'total' | 'comp' | 'sum' | 'identity' | 'energy';

export interface Equation {
  id: string;
  kind: EqKind;
  /** units inside the balance envelope (one for a single unit) */
  scope: string[];
  comp?: number;
  /** stream for sum equations */
  stream?: string;
  /** Σ c·Πf + k = 0 */
  terms: Term[];
  k: number;
  /** ordering: smaller is preferred */
  priority: number;
}

export interface StepEq {
  eq: Equation;
}

export interface Step {
  /** 'single' | 'system' | 'zero' */
  how: 'single' | 'system' | 'zero';
  eqs: Equation[];
  /** values known before this step (for the substituted form) */
  known: Map<VarKey, number>;
  solved: { key: VarKey; value: number }[];
}

export interface Check {
  eq: Equation;
  residual: number;
  scale: number;
  ok: boolean;
}

export interface BalanceResult {
  steps: Step[];
  values: Map<VarKey, number>;
  /** unknowns that could not be determined */
  missing: VarKey[];
  checks: Check[];
  warnings: string[];
}
