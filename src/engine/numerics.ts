/**
 * Scalar root finding used by the thermodynamics engine.
 * Brent's method: guaranteed convergence on a sign-changing bracket with
 * super-linear speed (inverse quadratic interpolation + secant + bisection).
 */

export class ConvergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConvergenceError';
  }
}

export interface RootOptions {
  /** absolute tolerance on x */
  tol?: number;
  maxIter?: number;
}

export function brent(f: (x: number) => number, a: number, b: number, opts: RootOptions = {}): number {
  const tol = opts.tol ?? 1e-10;
  const maxIter = opts.maxIter ?? 200;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) {
    throw new ConvergenceError(`brent: root not bracketed on [${a}, ${b}] (f=${fa}, ${fb})`);
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a;
      fa = fb; fb = fc; fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) return b;

    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : m > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  throw new ConvergenceError(`brent: no convergence after ${maxIter} iterations`);
}

/** Evenly spaced grid of n points on [a, b]. */
export const linspace = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));

export const sum = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0);
