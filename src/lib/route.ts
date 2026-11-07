import { useEffect, useState } from 'react';

export type Route =
  | 'flowsheet'
  | 'mccabe-thiele'
  | 'batch'
  | 'distillation-lines'
  | 'extraction'
  | 'absorption'
  | 'evaporation'
  | 'crystallization'
  | 'drying';
const ROUTES: readonly Route[] = ['flowsheet', 'mccabe-thiele', 'batch', 'distillation-lines', 'extraction', 'absorption', 'evaporation', 'crystallization', 'drying'];

function parse(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : 'flowsheet';
  return { route, params: new URLSearchParams(query) };
}

/** Hash-based routing: works on static hosting (GitHub Pages) without rewrites. */
export function useRoute() {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const on = () => setState(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return state;
}

export function navigate(route: Route, params?: Record<string, string | number>) {
  const q = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}` : '';
  window.location.hash = `/${route}${q}`;
}

/** Read a numeric query parameter with a fallback. */
export const num = (p: URLSearchParams, key: string, fallback: number) => {
  const v = Number(p.get(key));
  return p.has(key) && Number.isFinite(v) ? v : fallback;
};
