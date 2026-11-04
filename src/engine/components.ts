/**
 * Pure-component property database.
 *
 * Antoine (Dean, Lange's Handbook 15th ed.):  log10(P°/mmHg) = A − B / (C + T/°C)
 * Enthalpy data (NIST WebBook / Poling, Prausnitz & O'Connell, 5th ed.):
 *   cpL, cpV  — mean liquid / ideal-gas heat capacity, J/(mol·K), ~298–400 K
 *   dHvap     — enthalpy of vaporisation at the normal boiling point Tb, J/mol
 *
 * The selection is restricted to non-polar hydrocarbons whose binary pairs are
 * well described by Raoult's law (ideal liquid + ideal gas). Polar / associating
 * systems (alcohol–water, etc.) need an activity-coefficient model and are
 * deliberately not offered.
 */

export type ComponentId = 'benzene' | 'toluene' | 'n-hexane' | 'n-heptane';

export interface PureComponent {
  id: ComponentId;
  name: string;
  formula: string;
  /** molar mass, g/mol */
  mw: number;
  antoine: { A: number; B: number; C: number; /** validity, °C */ Tmin: number; Tmax: number };
  /** normal boiling point, K */
  Tb: number;
  /** critical temperature, K */
  Tc: number;
  cpL: number;
  cpV: number;
  dHvap: number;
}

export const COMPONENTS: Record<ComponentId, PureComponent> = {
  benzene: {
    id: 'benzene', name: 'Benzene', formula: 'C6H6', mw: 78.11,
    antoine: { A: 6.90565, B: 1211.033, C: 220.79, Tmin: 8, Tmax: 103 },
    Tb: 353.24, Tc: 562.05, cpL: 135.7, cpV: 82.4, dHvap: 30720,
  },
  toluene: {
    id: 'toluene', name: 'Toluene', formula: 'C7H8', mw: 92.14,
    antoine: { A: 6.95464, B: 1344.8, C: 219.482, Tmin: 6, Tmax: 137 },
    Tb: 383.78, Tc: 591.75, cpL: 157.3, cpV: 103.7, dHvap: 33180,
  },
  'n-hexane': {
    id: 'n-hexane', name: 'n-Hexane', formula: 'C6H14', mw: 86.18,
    antoine: { A: 6.87601, B: 1171.17, C: 224.41, Tmin: -25, Tmax: 92 },
    Tb: 341.88, Tc: 507.6, cpL: 195.6, cpV: 143.1, dHvap: 28850,
  },
  'n-heptane': {
    id: 'n-heptane', name: 'n-Heptane', formula: 'C7H16', mw: 100.2,
    antoine: { A: 6.89677, B: 1264.9, C: 216.54, Tmin: -2, Tmax: 124 },
    Tb: 371.58, Tc: 540.2, cpL: 224.6, cpV: 165.9, dHvap: 31770,
  },
};

/** A binary system: A is the light key (more volatile), B the heavy key. */
export interface BinarySystem {
  A: ComponentId;
  B: ComponentId;
}

export const DEFAULT_SYSTEM: BinarySystem = { A: 'benzene', B: 'toluene' };

export const getComponents = (ids: readonly ComponentId[]): PureComponent[] => ids.map((id) => COMPONENTS[id]);
