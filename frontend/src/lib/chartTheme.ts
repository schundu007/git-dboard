// Single source of truth for Recharts series colors. Tooltip/grid/axis chrome is
// handled globally + theme-aware in index.css (.recharts-* overrides), so charts
// should NOT pass a hardcoded white contentStyle. Series colors, however, are set
// per-<Bar>/<Area>/<Line>; import these so "success" is one green everywhere.
// See DESIGN.md -> Color.
export const chartColors = {
  success: '#76b900', // brand green — never lime (#84cc16)
  failure: '#ff1b2d', // chart red (brighter than accent-red for data legibility)
  info:    '#0a66c2', // info blue
  neutral: '#a1a1aa', // zinc-400
  warning: '#d97706', // amber
} as const

// Ordered palette for categorical series (e.g. pie slices) — deliberate roles,
// no rainbow. Extend intentionally, don't reach for a random hue.
export const chartSeries = [
  chartColors.success,
  chartColors.info,
  chartColors.neutral,
  chartColors.warning,
  chartColors.failure,
] as const
