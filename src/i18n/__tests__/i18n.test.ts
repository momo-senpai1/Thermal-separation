import { afterEach, describe, expect, it } from 'vitest';
import { t, useLang } from '@/i18n';
import { DE } from '@/i18n/de';
import { KU } from '@/i18n/ku';

afterEach(() => useLang.setState({ lang: 'en' }));

describe('i18n', () => {
  it('returns English unchanged', () => {
    useLang.setState({ lang: 'en' });
    expect(t('Reflux ratio')).toBe('Reflux ratio');
  });
  it('translates exact keys into German and Kurmanji', () => {
    useLang.setState({ lang: 'de' });
    expect(t('Reflux ratio')).toBe('Rücklaufverhältnis');
    useLang.setState({ lang: 'ku' });
    expect(t('Reflux ratio')).toBe('Rêjeya refluksê');
  });
  it('substitutes chemical names inside system labels and keeps unknown text', () => {
    useLang.setState({ lang: 'de' });
    expect(t('Benzene / Toluene · 1.013 bar (Raoult)')).toBe('Benzol / Toluol · 1.013 bar (Raoult)');
    expect(t('Something new')).toBe('Something new');
    useLang.setState({ lang: 'ku' });
    expect(t('Ethanol / Water')).toBe('Etanol / Av');
  });
  it('does not substitute inside longer words', () => {
    useLang.setState({ lang: 'de' });
    expect(t('Waterfall')).toBe('Waterfall');
  });
  it('fills placeholders', () => {
    expect(t('{n} stages', { n: 4 })).toBe('4 stages');
  });
  it('has no empty translations', () => {
    for (const d of [DE, KU]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });
});
