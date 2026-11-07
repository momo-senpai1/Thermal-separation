/**
 * Process blocks for the flowsheet: absorber, extractor, multiple-effect
 * evaporator, crystallizer and dryer. They work on materials outside the
 * flowsheet's binary vapour–liquid streams (gases in water, extraction
 * solvents, salt solutions, wet solids), so each block carries its own feed
 * specification. The same engines as the module pages do the work.
 */

import type { Route } from '@/lib/route';
import type { BlockType } from '@/types/process';
import { GASES, henry, solveAbsorber, solveStripper } from './absorption';
import { crystallizationYield, msmpr, SALTS, solubility } from './crystallization';
import { continuousDryer } from './drying';
import { solveEvaporator, SOLUTES } from './evaporation';
import { counterMinRatio, solveCounter } from './extraction/cascade';
import { equilibriumCurve, getLLE, LLE_OPTIONS } from './extraction/lle';

export interface BlockField {
  key: string;
  label: string;
  symbol: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  /** select field */
  options?: { id: string; label: string }[];
}

export interface BlockResult {
  ok: boolean;
  error?: string;
  rows: [string, string, string][];
}

export interface BlockDef {
  title: string;
  /** equipment-library schematic id */
  schematic: string;
  route: Route;
  routeQuery?: Record<string, string>;
  fields: BlockField[];
  defaults: Record<string, number | string>;
  solve: (s: Record<string, number | string>) => BlockResult;
}

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const n = (s: Record<string, number | string>, k: string) => Number(s[k]);
const str = (s: Record<string, number | string>, k: string) => String(s[k]);

export const BLOCKS: Record<BlockType, BlockDef> = {
  absorber: {
    title: 'Absorber / stripper',
    schematic: 'packed-absorber',
    route: 'absorption',
    fields: [
      { key: 'gas', label: 'Solute / system', symbol: '', options: GASES.map((g) => ({ id: g.id, label: g.name })) },
      { key: 'T', label: 'Temperature', symbol: 'T', unit: '°C', min: 5, max: 80, step: 0.5, digits: 1 },
      { key: 'P', label: 'Pressure', symbol: 'P', unit: 'bar', min: 0.5, max: 30, step: 0.1, digits: 1 },
      { key: 'c', label: 'Inlet mole fraction', symbol: 'y/x_in', min: 1e-5, max: 0.2, step: 1e-5, digits: 5 },
      { key: 'rec', label: 'Removed fraction', symbol: 'φ', min: 0.5, max: 0.999, step: 0.001, digits: 3 },
      { key: 'factor', label: 'Ratio ÷ minimum', symbol: 'f', min: 1.02, max: 4, step: 0.01, digits: 2 },
      { key: 'HTU', label: 'Height of a transfer unit', symbol: 'HTU', unit: 'm', min: 0.2, max: 2, step: 0.05, digits: 2 },
    ],
    defaults: { gas: 'nh3', T: 25, P: 1, c: 0.05, rec: 0.98, factor: 1.5, HTU: 0.6 },
    solve: (s) => {
      const g = GASES.find((x) => x.id === str(s, 'gas')) ?? GASES[0]!;
      const m = henry(g, n(s, 'T')) / n(s, 'P');
      const r =
        g.role === 'absorb'
          ? solveAbsorber({ m, yIn: n(s, 'c'), recovery: n(s, 'rec'), xIn: 0, factor: n(s, 'factor') })
          : solveStripper({ m, xIn: Math.min(n(s, 'c'), 2e-4), recovery: n(s, 'rec'), yIn: 0, factor: n(s, 'factor') });
      if (!r.ok) return { ok: false, error: r.error, rows: [] };
      const ratio = g.role === 'absorb' ? ['L/G', f(r.LG, 3), ''] : ['G/L', f(1 / r.LG, 3), ''];
      return {
        ok: true,
        rows: [
          ['Mode', g.role === 'absorb' ? 'absorber' : 'stripper', ''],
          ['m = H/P', f(m, m < 10 ? 3 : 1), ''],
          ['Stages', f(r.N), ''],
          ratio as [string, string, string],
          ['NTU', f(r.NTU), ''],
          ['Packed height', f(r.NTU * n(s, 'HTU')), 'm'],
        ],
      };
    },
  },
  extractor: {
    title: 'Extraction column',
    schematic: 'rdc',
    route: 'extraction',
    routeQuery: { tool: 'counter' },
    fields: [
      { key: 'sys', label: 'LLE system', symbol: '', options: LLE_OPTIONS },
      { key: 'X0', label: 'Feed loading', symbol: 'X₀', min: 0.005, max: 1, step: 0.001, digits: 3 },
      { key: 'rec', label: 'Extracted fraction', symbol: 'φ', min: 0.5, max: 0.999, step: 0.001, digits: 3 },
      { key: 'factor', label: 'Solvent ratio ÷ minimum', symbol: 'f', min: 1.05, max: 4, step: 0.01, digits: 2 },
    ],
    defaults: { sys: 'aa-ipe', X0: 0.43, rec: 0.95, factor: 1.4 },
    solve: (s) => {
      const sys = getLLE(str(s, 'sys'));
      const curve = equilibriumCurve(sys);
      const X0 = Math.min(n(s, 'X0'), curve.Xmax * 0.95);
      const XN = X0 * (1 - n(s, 'rec'));
      const rMin = counterMinRatio(curve, X0, 0, XN);
      const r = solveCounter({ curve, X0, Y0: 0, XN, r: rMin * n(s, 'factor'), target: 'stages', N: 1 });
      if (!r.ok) return { ok: false, error: r.error, rows: [] };
      return {
        ok: true,
        rows: [
          ['System', `${sys.solute} → ${sys.solvent}`, ''],
          ['Stages', f(r.N), ''],
          ['Solvent Ġ/L̇', f(r.r, 3), ''],
          ['Ġ/L̇ min', f(rMin, 3), ''],
          ['Extract Y₁', f(r.Y1, 4), ''],
          ...(X0 < n(s, 'X0') ? [['Note', `X₀ capped at ${f(X0, 3)}`, ''] as [string, string, string]] : []),
        ],
      };
    },
  },
  evaptrain: {
    title: 'Multiple-effect evaporator',
    schematic: 'falling-film',
    route: 'evaporation',
    fields: [
      { key: 'solute', label: 'Solution', symbol: '', options: SOLUTES.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'F', label: 'Feed', symbol: 'F', unit: 'kg/h', min: 1000, max: 50000, step: 100, digits: 0 },
      { key: 'wF', label: 'Feed solids', symbol: 'w_F', min: 0.01, max: 0.4, step: 0.005, digits: 3 },
      { key: 'wP', label: 'Product solids', symbol: 'w_P', min: 0.05, max: 0.7, step: 0.005, digits: 3 },
      { key: 'N', label: 'Effects', symbol: 'N', min: 1, max: 6, step: 1, digits: 0 },
      { key: 'Ps', label: 'Heating steam', symbol: 'p_s', unit: 'bar', min: 1.1, max: 8, step: 0.1, digits: 1 },
      { key: 'Plast', label: 'Last effect', symbol: 'p_N', unit: 'bar', min: 0.07, max: 1, step: 0.01, digits: 2 },
    ],
    defaults: { solute: 'sucrose', F: 10000, wF: 0.1, wP: 0.5, N: 3, Ps: 3, Plast: 0.15 },
    solve: (s) => {
      const solute = SOLUTES.find((x) => x.id === str(s, 'solute')) ?? SOLUTES[0]!;
      const N = Math.round(n(s, 'N'));
      const r = solveEvaporator({
        solute, F: n(s, 'F'), wF: n(s, 'wF'), wP: n(s, 'wP'), TF: 60, Ps: n(s, 'Ps'), Plast: n(s, 'Plast'),
        U: Array.from({ length: N }, (_, i) => 3000 * 0.85 ** i),
      });
      if (!r.ok) return { ok: false, error: r.error, rows: [] };
      return {
        ok: true,
        rows: [
          ['Evaporation', f(r.V, 0), 'kg/h'],
          ['Steam', f(r.S, 0), 'kg/h'],
          ['Economy', f(r.economy), ''],
          ['Area / effect', f(r.A, 1), 'm²'],
          ['Product', f(r.P, 0), 'kg/h'],
        ],
      };
    },
  },
  crystallizer: {
    title: 'Crystallizer',
    schematic: 'cooling-crystallizer',
    route: 'crystallization',
    fields: [
      { key: 'salt', label: 'Solute', symbol: '', options: SALTS.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'F', label: 'Feed solution', symbol: 'F', unit: 'kg/h', min: 100, max: 20000, step: 50, digits: 0 },
      { key: 'T1', label: 'Feed (saturated) at', symbol: 'T₁', unit: '°C', min: 10, max: 100, step: 1, digits: 0 },
      { key: 'T2', label: 'Crystallizer temperature', symbol: 'T₂', unit: '°C', min: 0, max: 100, step: 1, digits: 0 },
      { key: 'e', label: 'Water evaporated', symbol: 'e', min: 0, max: 0.9, step: 0.01, digits: 2 },
      { key: 'G', label: 'Growth rate', symbol: 'G', unit: 'µm/min', min: 0.1, max: 5, step: 0.05, digits: 2 },
      { key: 'tau', label: 'Residence time', symbol: 'τ', unit: 'min', min: 10, max: 240, step: 5, digits: 0 },
    ],
    defaults: { salt: 'kno3', F: 1000, T1: 60, T2: 20, e: 0, G: 1, tau: 60 },
    solve: (s) => {
      const salt = SALTS.find((x) => x.id === str(s, 'salt')) ?? SALTS[0]!;
      const T1 = n(s, 'T1');
      const y = crystallizationYield({ salt, F: n(s, 'F'), c0: solubility(salt, T1), T1, T2: n(s, 'T2'), e: n(s, 'e') });
      const c = msmpr({ G: n(s, 'G'), tau: n(s, 'tau'), MT: 150, rho: salt.rho, kv: 1 });
      return {
        ok: true,
        rows: [
          ['Crystals', f(y.crystals, 1), 'kg/h'],
          ['Yield', f(y.yield * 100, 1), '%'],
          ['Cooling duty', f((y.coolDuty * 1000) / 3600, 1), 'kW'],
          ['Dominant size', f(c.LD * 1e6, 0), 'µm'],
        ],
      };
    },
  },
  dryer: {
    title: 'Convective dryer',
    schematic: 'rotary-dryer',
    route: 'drying',
    fields: [
      { key: 'solids', label: 'Dry solids', symbol: 'ṁ_s', unit: 'kg/h', min: 100, max: 10000, step: 50, digits: 0 },
      { key: 'X1', label: 'Moisture in', symbol: 'X₁', unit: 'kg/kg', min: 0.1, max: 2, step: 0.01, digits: 2 },
      { key: 'X2', label: 'Moisture out', symbol: 'X₂', unit: 'kg/kg', min: 0.01, max: 0.5, step: 0.005, digits: 3 },
      { key: 'T0', label: 'Ambient air', symbol: 'T₀', unit: '°C', min: 0, max: 40, step: 1, digits: 0 },
      { key: 'RH0', label: 'Ambient humidity', symbol: 'φ₀', min: 0.05, max: 0.95, step: 0.01, digits: 2 },
      { key: 'Tin', label: 'Air into dryer', symbol: 'T_in', unit: '°C', min: 60, max: 250, step: 1, digits: 0 },
      { key: 'Tout', label: 'Air out of dryer', symbol: 'T_out', unit: '°C', min: 30, max: 120, step: 1, digits: 0 },
    ],
    defaults: { solids: 1000, X1: 0.4, X2: 0.05, T0: 20, RH0: 0.6, Tin: 150, Tout: 60 },
    solve: (s) => {
      if (!(n(s, 'X1') > n(s, 'X2'))) return { ok: false, error: 'Moisture in must exceed moisture out.', rows: [] };
      if (!(n(s, 'Tin') > n(s, 'Tout'))) return { ok: false, error: 'The air must cool down in the dryer (T_in > T_out).', rows: [] };
      const r = continuousDryer({ solids: n(s, 'solids'), X1: n(s, 'X1'), X2: n(s, 'X2'), T0: n(s, 'T0'), RH0: n(s, 'RH0'), Tin: n(s, 'Tin'), Tout: n(s, 'Tout') });
      return {
        ok: !r.saturated,
        error: r.saturated ? 'The outlet air would be saturated — raise T_out or T_in.' : undefined,
        rows: [
          ['Water removed', f(r.water, 0), 'kg/h'],
          ['Air', f(r.air, 0), 'kg/h'],
          ['Heater', f(r.heat, 0), 'kW'],
          ['Efficiency', f(r.efficiency * 100, 0), '%'],
        ],
      };
    },
  },
};
