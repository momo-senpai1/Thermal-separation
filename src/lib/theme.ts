import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'ts-theme';

/** Saved choice, else the operating-system preference. */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.classList.toggle('light', t === 'light');
  el.classList.toggle('dark', t === 'dark');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('light') ? 'light' : 'dark'));
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}
