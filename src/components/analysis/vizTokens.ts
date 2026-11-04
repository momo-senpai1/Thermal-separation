/**
 * Chart palette — validated with the dataviz palette validator on the dark
 * chart surface #0a0f15, all pairs (every line is on screen together):
 * lightness band, chroma, CVD ΔE ≥ 9.4, normal-vision ΔE ≥ 20.9, contrast ≥ 3:1.
 * Rectifying vs stripping share a hue and are separated by dash + direct label.
 */
export const VIZ = {
  surface: '#0a0f15',
  grid: '#1b2633',
  axis: '#273546',
  /** text tokens — never the series colour */
  text: '#dbe3ec',
  textMuted: '#8798ad',
  textFaint: '#5c7089',

  equilibrium: '#3987e5', // blue
  operating: '#d95926', // orange (rectifying solid, stripping dashed)
  qLine: '#199e70', // aqua
  /** neutral construction ink: stage steps, diagonal */
  steps: '#b6c2d1',
  diagonal: '#3a4b60',

  bubble: '#3987e5', // liquid curve
  dew: '#d95926', // vapour curve
} as const;

export const STRIPPING_DASH = '7 4';
export const axisTick = { fill: VIZ.textMuted, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' };
