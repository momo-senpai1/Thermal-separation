/**
 * Chart palette as CSS variables, so charts follow the theme.
 *
 * Dark values were validated with the dataviz palette validator on the dark
 * surface (#0a0f15, all pairs): CVD ΔE ≥ 9.4, normal-vision ΔE ≥ 20.9, contrast ≥ 3:1.
 * Light values are the same hues stepped for a white surface (reference
 * palette's light column); aqua sits below 3:1 there, so every series also
 * carries a legend entry / direct label.
 * Rectifying vs stripping share a hue and are separated by dash + direct label.
 */
export const VIZ = {
  surface: 'var(--viz-surface)',
  grid: 'var(--viz-grid)',
  axis: 'var(--viz-axis)',
  /** text tokens — never the series colour */
  text: 'var(--viz-text)',
  textMuted: 'var(--viz-text-muted)',
  textFaint: 'var(--viz-text-faint)',

  equilibrium: 'var(--viz-eq)', // blue
  operating: 'var(--viz-op)', // orange (rectifying solid, stripping dashed)
  qLine: 'var(--viz-q)', // aqua
  /** neutral construction ink: stage steps, diagonal */
  steps: 'var(--viz-steps)',
  diagonal: 'var(--viz-diag)',

  bubble: 'var(--viz-eq)', // liquid curve
  dew: 'var(--viz-op)', // vapour curve
} as const;

export const STRIPPING_DASH = '7 4';
export const axisTick = { fill: VIZ.textMuted, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' };
