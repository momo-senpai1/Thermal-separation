/**
 * Internationalisation: English (source), German, Kurdish (Kurmanji, Latin script).
 *
 * Strings are keyed by their English text, so untranslated text simply shows in
 * English. Lookup order: exact dictionary entry → English text with known
 * technical terms (chemical names, units of plant) substituted → English.
 */

import { create } from 'zustand';
import { DE, TERMS_DE } from './de';
import { KU, TERMS_KU } from './ku';

export type Lang = 'en' | 'de' | 'ku';
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'de', label: 'DE', name: 'Deutsch' },
  { id: 'ku', label: 'KU', name: 'Kurdî (Kurmancî)' },
];
const KEY = 'ts-lang';

function initialLang(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'de' || s === 'ku') return s;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  return nav.startsWith('de') ? 'de' : nav.startsWith('ku') ? 'ku' : 'en';
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>()((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

const DICTS: Record<Exclude<Lang, 'en'>, { exact: Record<string, string>; terms: [string, string][] }> = {
  de: { exact: DE, terms: sortTerms(TERMS_DE) },
  ku: { exact: KU, terms: sortTerms(TERMS_KU) },
};

function sortTerms(t: Record<string, string>): [string, string][] {
  // longest first so "Acetic acid" wins over "acid"
  return Object.entries(t).sort((a, b) => b[0].length - a[0].length);
}

const cache = new Map<string, string>();

/** Translate an English UI string into the current language; {name} placeholders are filled from vars. */
export function t(s: string, vars?: Record<string, string | number>): string {
  const lang = useLang.getState().lang;
  let out = s;
  if (lang !== 'en') {
    const k = `${lang}\u0000${s}`;
    const hit = cache.get(k);
    if (hit !== undefined) out = hit;
    else {
      const d = DICTS[lang];
      out = d.exact[s] ?? substitute(s, d.terms);
      cache.set(k, out);
    }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

function substitute(s: string, terms: [string, string][]): string {
  let out = s;
  for (const [en, tr] of terms) {
    if (!out.includes(en)) continue;
    out = out.replace(new RegExp(`(^|[^A-Za-zÀ-ÿ])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-zÀ-ÿ])`, 'g'), (_m, pre) => `${pre}${tr}`);
  }
  return out;
}

/** Translate if the value is a plain string (labels can also be React nodes). */
export const tx = <T,>(v: T): T => (typeof v === 'string' ? (t(v) as T) : v);

if (typeof document !== 'undefined') document.documentElement.lang = useLang.getState().lang;
