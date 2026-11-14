import type { FitSeverity } from '@/api/persona'
import { cn } from '@/lib/utils'
import { SEVERITY_TEXT } from './fitMeta'

/** Each pictogram on a 5 × 5 grid of tiles, as [column, row] pairs. */
const SHAPES: Record<FitSeverity, Array<[number, number]>> = {
  // A check mark.
  ok: [[4, 0], [3, 1], [2, 2], [0, 2], [1, 3]],
  // The letter i.
  info: [[2, 0], [2, 2], [2, 3], [2, 4]],
  // An exclamation mark.
  attention: [[2, 0], [2, 1], [2, 2], [2, 4]],
  // A cross.
  bloquant: [[0, 0], [4, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [0, 4], [4, 4]],
}

interface SeverityPictoProps {
  severity: FitSeverity
  className?: string
}

/** A reason's severity drawn with square tiles: the shape says it, the colour only repeats it. */
export function SeverityPicto({ severity, className }: SeverityPictoProps) {
  return (
    <svg
      viewBox="0 0 5 5"
      aria-hidden="true"
      className={cn('size-3.5 shrink-0 fill-current', SEVERITY_TEXT[severity], className)}
    >
      {SHAPES[severity].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  )
}
