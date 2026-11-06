/**
 * Pure transforms from solver output to plot-ready series.
 * Kept free of React so the geometry can be unit-tested.
 */

import type { BinarySystem } from '@/engine/components';
import { linspace } from '@/engine/numerics';
import { binaryComponents, bubbleTemperature, dewTemperature, yFromAlpha } from '@/engine/thermodynamics';
import type { ColumnResults } from '@/types/process';

export interface Pt {
  x: number;
  y: number;
}

export interface StageCorner extends Pt {
  stage: number;
  section: ColumnResults['steps'][number]['section'];
  isFeed: boolean;
}

export interface McCabeThieleSeries {
  equilibrium: Pt[];
  diagonal: Pt[];
  rectifying: Pt[];
  stripping: Pt[];
  qLine: Pt[];
  /** stage-stepping polyline: horizontal to the equilibrium curve, vertical to the operating line */
  staircase: Pt[];
  /** equilibrium-curve corners, one per stage (hover targets) */
  corners: StageCorner[];
  xD: number;
  xB: number;
  zF: number;
}

export function buildMcCabeThiele(c: ColumnResults, n = 121): McCabeThieleSeries {
  const equilibrium = c.curve
    ? c.curve.x.map((x, i) => ({ x, y: c.curve!.y[i]! }))
    : linspace(0, 1, n).map((x) => ({ x, y: yFromAlpha(c.alpha, x) }));
  const { xD, xB, zF, intersection: I } = c;

  const staircase: Pt[] = [{ x: xD, y: xD }];
  c.steps.forEach((s, i) => {
    staircase.push({ x: s.x, y: s.y }); // horizontal step onto the equilibrium curve
    const next = c.steps[i + 1];
    staircase.push({ x: s.x, y: next ? next.y : s.x }); // vertical drop to operating line (or diagonal at the end)
  });

  return {
    equilibrium,
    diagonal: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    rectifying: [
      { x: xD, y: xD },
      { x: I.x, y: I.y },
    ],
    stripping: [
      { x: I.x, y: I.y },
      { x: xB, y: xB },
    ],
    // q-line from the diagonal at z_F through the operating-line intersection to the equilibrium curve
    qLine: [
      { x: zF, y: zF },
      { x: c.pinch.x, y: c.pinch.y },
    ],
    staircase,
    corners: c.steps.map((s) => ({
      x: s.x,
      y: s.y,
      stage: s.stage,
      section: s.section,
      isFeed: s.stage === c.feedStage,
    })),
    xD,
    xB,
    zF,
  };
}

export interface TxyRow {
  /** light-key mole fraction (liquid for bubble curve, vapour for dew curve) */
  x: number;
  /** bubble temperature of a liquid of composition x, °C */
  bubble: number;
  /** dew temperature of a vapour of composition x, °C */
  dew: number;
}

/** Isobaric T–x–y envelope on a shared composition grid (one row per x → crosshair tooltip). */
export function buildTxy(sys: BinarySystem, P: number, n = 61): TxyRow[] {
  const comps = binaryComponents(sys);
  return linspace(0, 1, n).map((x) => ({
    x,
    bubble: bubbleTemperature(comps, [x, 1 - x], P).T - 273.15,
    dew: dewTemperature(comps, [x, 1 - x], P).T - 273.15,
  }));
}

export interface StageRow {
  stage: number;
  section: string;
  x: number;
  y: number;
  /** stage temperature (bubble point of the stage liquid), °C */
  T: number;
}

export function buildStageTable(c: ColumnResults, sys: BinarySystem, P: number): StageRow[] {
  const comps = binaryComponents(sys);
  const label = (s: ColumnResults['steps'][number]) =>
    s.section === 'condenser'
      ? 'Partial condenser'
      : s.stage === c.steps.at(-1)?.stage
        ? 'Reboiler'
        : s.stage === c.feedStage
          ? 'Feed stage'
          : s.section === 'rectifying'
            ? 'Rectifying'
            : 'Stripping';
  return c.steps.map((s) => ({
    stage: s.stage,
    section: label(s),
    x: s.x,
    y: s.y,
    T: bubbleTemperature(comps, [s.x, 1 - s.x], P).T - 273.15,
  }));
}
