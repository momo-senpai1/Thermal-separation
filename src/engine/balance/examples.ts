/**
 * Worked example: RWTH AVT, Thermische Trennverfahren, 2. Vorrechenübung
 * (exam SS16) — THF/H₂O/butanediol, BD removal followed by pressure-swing
 * distillation. Equilibrium curves are taken from the exercise's x,y diagrams.
 */

import { PRESET_CURVES } from './columnMT';
import type { BProblem } from './types';

export interface ExampleLayout {
  problem: BProblem;
  /** canvas positions per unit */
  pos: Record<string, { x: number; y: number }>;
}

export function thfPressureSwing(): ExampleLayout {
  const problem: BProblem = {
    components: ['THF', 'H2O', 'BD'],
    units: [
      { id: 'R', kind: 'source', name: 'Reaktor' },
      { id: 'K1', kind: 'column', name: 'Kolonne 1 (1 bar)' },
      {
        id: 'K2',
        kind: 'column',
        name: 'Kolonne 2 (20 bar)',
        column: { mt: true, v: 4, condenser: 'partial', key: 0, curve: { kind: 'table', preset: 'vr02-20bar', points: PRESET_CURVES['vr02-20bar']!.points } },
      },
      { id: 'WT', kind: 'exchanger', name: 'Wärmeverlust', Q: 16500, dHv: 90 },
      {
        id: 'K3',
        kind: 'column',
        name: 'Kolonne 3 (10 bar)',
        column: { mt: true, v: 0.33, condenser: 'total', key: 0, curve: { kind: 'table', preset: 'vr02-10bar', points: PRESET_CURVES['vr02-10bar']!.points } },
      },
      { id: 'P1', kind: 'sink', name: 'Butandiol' },
      { id: 'P2', kind: 'sink', name: 'THF' },
      { id: 'P3', kind: 'sink', name: 'Wasser' },
    ],
    streams: [
      { id: 'F', name: 'F', from: 'R', fromPort: 'out', to: 'K1', n: 1000, x: [0.75, 0.15, 0.1], q: null },
      { id: 'D1', name: 'D1', from: 'K1', fromPort: 'top', to: 'K2', n: null, x: [null, null, 0], q: 1 },
      { id: 'B1', name: 'B1', from: 'K1', fromPort: 'bottom', to: 'P1', n: null, x: [0, 0, 1], q: null },
      { id: 'D2', name: 'D2', from: 'K2', fromPort: 'top', to: 'WT', n: null, x: [0.5, null, 0], q: 0 },
      { id: 'B2', name: 'B2', from: 'K2', fromPort: 'bottom', to: 'P2', n: null, x: [0.98, null, 0], q: null },
      { id: 'F3', name: 'F3', from: 'WT', fromPort: 'out', to: 'K3', n: null, x: [null, null, null], q: null },
      { id: 'D3', name: 'D3', from: 'K3', fromPort: 'top', to: 'K2', n: null, x: [0.8, null, 0], q: 1 },
      { id: 'B3', name: 'B3', from: 'K3', fromPort: 'bottom', to: 'P3', n: null, x: [null, 0.99, 0], q: null },
    ],
  };
  const pos = {
    R: { x: 0, y: 200 },
    K1: { x: 200, y: 140 },
    P1: { x: 380, y: 420 },
    K2: { x: 470, y: 140 },
    P2: { x: 650, y: 420 },
    WT: { x: 700, y: 20 },
    K3: { x: 900, y: 140 },
    P3: { x: 1080, y: 420 },
  };
  problem.units.forEach((u) => (u.order = pos[u.id as keyof typeof pos].x));
  return { problem, pos };
}
