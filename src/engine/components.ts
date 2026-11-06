/**
 * Pure-component property database.
 *
 * Antoine (Dean, Lange's Handbook 15th ed.):  log10(P°/mmHg) = A − B / (C + T/°C)
 * Enthalpy data (NIST WebBook / Poling, Prausnitz & O'Connell, 5th ed.):
 *   cpL, cpV  — mean liquid / ideal-gas heat capacity, J/(mol·K), ~298–400 K
 *   dHvap     — enthalpy of vaporisation at the normal boiling point Tb, J/mol
 *
 * Which pairs may be combined, and with which activity model, is decided in
 * `propertyPackage.ts`: ideal for similar hydrocarbons, Wilson for the
 * validated polar pairs, refused where the liquids split or no validated
 * parameters exist.
 */

export type ComponentId =
  | 'benzene'
  | 'toluene'
  | 'n-hexane'
  | 'n-heptane'
  | 'cyclohexane'
  | 'p-xylene'
  | 'water'
  | 'methanol'
  | 'ethanol'
  | 'acetone';

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
  cyclohexane: {
    id: 'cyclohexane', name: 'Cyclohexane', formula: 'C6H12', mw: 84.16,
    antoine: { A: 6.8413, B: 1201.53, C: 222.65, Tmin: 20, Tmax: 81 },
    Tb: 353.87, Tc: 553.6, cpL: 156.0, cpV: 106.3, dHvap: 29970,
  },
  'p-xylene': {
    id: 'p-xylene', name: 'p-Xylene', formula: 'C8H10', mw: 106.17,
    antoine: { A: 6.99052, B: 1453.43, C: 215.307, Tmin: 27, Tmax: 166 },
    Tb: 411.5, Tc: 616.2, cpL: 181.7, cpV: 126.4, dHvap: 35670,
  },
  water: {
    id: 'water', name: 'Water', formula: 'H2O', mw: 18.015,
    antoine: { A: 8.07131, B: 1730.63, C: 233.426, Tmin: 1, Tmax: 100 },
    Tb: 373.15, Tc: 647.1, cpL: 75.3, cpV: 33.6, dHvap: 40660,
  },
  methanol: {
    id: 'methanol', name: 'Methanol', formula: 'CH3OH', mw: 32.04,
    antoine: { A: 8.08097, B: 1582.271, C: 239.726, Tmin: 15, Tmax: 84 },
    Tb: 337.7, Tc: 512.6, cpL: 81.1, cpV: 44.1, dHvap: 35210,
  },
  ethanol: {
    id: 'ethanol', name: 'Ethanol', formula: 'C2H5OH', mw: 46.07,
    antoine: { A: 8.20417, B: 1642.89, C: 230.3, Tmin: -57, Tmax: 80 },
    Tb: 351.44, Tc: 513.9, cpL: 112.3, cpV: 65.6, dHvap: 38560,
  },
  acetone: {
    id: 'acetone', name: 'Acetone', formula: 'C3H6O', mw: 58.08,
    antoine: { A: 7.11714, B: 1210.595, C: 229.664, Tmin: -13, Tmax: 55 },
    Tb: 329.2, Tc: 508.1, cpL: 126.3, cpV: 74.5, dHvap: 29100,
  },
};

/** A binary system: A is the light key (more volatile), B the heavy key. */
export interface BinarySystem {
  A: ComponentId;
  B: ComponentId;
}

export const DEFAULT_SYSTEM: BinarySystem = { A: 'benzene', B: 'toluene' };

export const getComponents = (ids: readonly ComponentId[]): PureComponent[] => ids.map((id) => COMPONENTS[id]);
