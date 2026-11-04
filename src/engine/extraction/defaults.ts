import { counterMinRatio } from './cascade';
import { equilibriumCurve, type LLESystem } from './lle';

/** Default specification per system — shared by all three extraction tools. */
const PRESET: Record<string, { X0: number; XN: number }> = {
  'aa-ipe': { X0: 0.43, XN: 0.0204 },
  'nicotine-kerosene': { X0: 0.0101, XN: 0.001 },
  'acetone-toluene': { X0: 0.25, XN: 0.01 },
  'acetone-benzene': { X0: 0.25, XN: 0.01 },
  'acetone-mibk': { X0: 0.25, XN: 0.01 },
  'ethanol-toluene': { X0: 0.1, XN: 0.03 },
  'ethanol-benzene': { X0: 0.1, XN: 0.03 },
};

const nice = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.round((v / p) * 100) / 100 * p;
};

export function extractionDefaults(sys: LLESystem) {
  const p = PRESET[sys.id] ?? { X0: sys.loading.X.at(-1)! * 0.3, XN: sys.loading.X.at(-1)! * 0.01 };
  const c = equilibriumCurve(sys);
  const rMin = counterMinRatio(c, p.X0, 0, p.XN);
  return { X0: p.X0, Y0: 0, XN: p.XN, r: nice(rMin * 1.4) };
}
