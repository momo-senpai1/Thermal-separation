import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Kelvin → °C */
export const kToC = (k: number) => k - 273.15;
/** °C → Kelvin */
export const cToK = (c: number) => c + 273.15;

export const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);
