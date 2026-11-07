/** LaTeX for balance equations: symbolic form, substituted form, results. */

import type { BProblem, Equation, Step, VarKey } from '@/engine/balance/types';
import { t, useLang } from '@/i18n';

const ESC: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};
export const texText = (s: string) => `\\text{${s.replace(/[\\{}$&#%_^~]/g, (c) => ESC[c]!)}}`;

/** Stream / unit labels: plain letters+digits as roman, anything else as text. */
const label = (s: string) => (/^[A-Za-z0-9]+$/.test(s) ? `\\mathrm{${s}}` : texText(s));
/** Chemical formulas: digits become subscripts (H2O → H₂O). */
export const compTex = (s: string) => (/^[A-Za-z0-9()]+$/.test(s) ? `\\mathrm{${s.replace(/(\d+)/g, '_{$1}')}}` : texText(s));

export function names(p: BProblem) {
  const stream = new Map(p.streams.map((s) => [s.id, s.name]));
  const unit = new Map(p.units.map((u) => [u.id, u.name]));
  return { stream: (id: string) => stream.get(id) ?? id, unit: (id: string) => unit.get(id) ?? id };
}

export function varTex(key: VarKey, p: BProblem): string {
  const nm = names(p);
  const [kind, id, i] = key.split(':') as [string, string, string?];
  switch (kind) {
    case 'n':
      return `\\dot n_{${label(nm.stream(id))}}`;
    case 'x':
      return `x_{${label(nm.stream(id))},${compTex(p.components[Number(i)] ?? '?')}}`;
    case 'q':
      return `q_{${label(nm.stream(id))}}`;
    case 'Q':
      return `\\dot Q_{${label(nm.unit(id))}}`;
    case 'H':
      return `\\Delta h_{v}`;
    default:
      return key;
  }
}

/** Plain-text name of a variable (for lists and tables). */
export function varName(key: VarKey, p: BProblem): string {
  const nm = names(p);
  const [kind, id, i] = key.split(':') as [string, string, string?];
  switch (kind) {
    case 'n':
      return `ṅ ${nm.stream(id)}`;
    case 'x':
      return `x ${nm.stream(id)}, ${p.components[Number(i)] ?? '?'}`;
    case 'q':
      return `q ${nm.stream(id)}`;
    case 'Q':
      return `Q̇ ${nm.unit(id)}`;
    case 'H':
      return `Δh_v ${nm.unit(id)}`;
    default:
      return key;
  }
}

export function unitOf(key: VarKey): string {
  if (key.startsWith('n:')) return 'kmol/h';
  if (key.startsWith('Q:')) return 'kJ/h';
  if (key.startsWith('H:')) return 'kJ/kmol';
  return '';
}

/** Number for display: up to 4 decimals (6 significant), decimal comma in DE/KU. */
export function num(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '—';
  let s: string;
  if (v !== 0 && Math.abs(v) < 1e-3) s = v.toExponential(3);
  else s = String(Number(v.toFixed(Math.abs(v) >= 1000 ? 2 : digits)));
  return useLang.getState().lang === 'en' ? s : s.replace('.', ',');
}
const numTex = (v: number) => num(v).replace(',', '{,}').replace(/e([+-]?\d+)/, '\\cdot 10^{$1}');

function side(eq: Equation, positive: boolean, p: BProblem, known?: Map<VarKey, number>): string {
  const parts: string[] = [];
  for (const term of eq.terms) {
    if (term.c > 0 !== positive) continue;
    const c = Math.abs(term.c);
    const f = term.f.map((k) => {
      const v = known?.get(k);
      return v === undefined ? varTex(k, p) : numTex(v);
    });
    if (c !== 1) f.unshift(numTex(c));
    parts.push(f.join(known ? ' \\cdot ' : '\\,'));
  }
  if (eq.k !== 0 && eq.k > 0 === positive) parts.push(numTex(Math.abs(eq.k)));
  return parts.length ? parts.join(' + ') : '0';
}

export function eqTex(eq: Equation, p: BProblem, known?: Map<VarKey, number>): string {
  return `${side(eq, true, p, known)} = ${side(eq, false, p, known)}`;
}

export function eqTitle(eq: Equation, p: BProblem): string {
  const nm = names(p);
  const where = eq.scope.map(nm.unit).join(' + ');
  switch (eq.kind) {
    case 'total':
      return t('Total balance around {unit}', { unit: where });
    case 'comp':
      return t('{comp} balance around {unit}', { comp: p.components[eq.comp ?? 0] ?? '?', unit: where });
    case 'sum':
      return t('Mole fractions of {stream} add up to 1', { stream: nm.stream(eq.stream ?? '') });
    case 'identity':
      return t('{unit}: composition unchanged ({comp})', { unit: where, comp: p.components[eq.comp ?? 0] ?? '?' });
    case 'energy':
      return t('Energy balance at {unit}', { unit: where });
  }
}

export function resultTex(step: Step, p: BProblem): string {
  return step.solved
    .map((s) => {
      const u = unitOf(s.key);
      return `${varTex(s.key, p)} = ${numTex(s.value)}${u ? `\\ \\mathrm{${u.replace('/', '/')}}` : ''}`;
    })
    .join(',\\quad ');
}
