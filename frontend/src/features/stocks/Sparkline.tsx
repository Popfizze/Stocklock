import { cn } from '@/lib/utils'
import { TREND_TEXT, trendOf } from './format'

const WIDTH = 100
const HEIGHT = 32

interface SparklineProps {
  values: number[]
  className?: string
}

/**
 * Mini closing-price curve of a list row, colored by its own trend (last vs
 * first point). Decorative: the row already states the price and the change.
 * Plain SVG so the list does not pull the charting library into the home page.
 */
export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH
      const y = HEIGHT - ((value - min) / span) * HEIGHT
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const trend = trendOf(values[values.length - 1] - values[0])

  return (
    <svg
      viewBox={`0 -2 ${WIDTH} ${HEIGHT + 4}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('h-8 w-24', TREND_TEXT[trend], className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
