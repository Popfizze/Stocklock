import type { SubScore } from '@/api/stocks'
import { cn } from '@/lib/utils'
import { SUB_SCORE_FILL } from './scoreMeta'

const SIDE = 10
const PITCH = 10
const TILE = 8

interface ScoreGaugeProps {
  score: number
  subScores: SubScore[]
  className?: string
}

/**
 * The score as a hundred tiles, one per point, lit from the bottom row up;
 * each lit tile takes the step of the sub-score whose contribution it belongs
 * to, so the gauge also shows what the score is made of. Decorative: the
 * figure and every contribution are written beside it.
 */
export function ScoreGauge({ score, subScores, className }: ScoreGaugeProps) {
  // Upper bound of each sub-score's run of tiles, in points.
  const bounds = subScores.reduce<number[]>(
    (ends, subScore) => [...ends, (ends[ends.length - 1] ?? 0) + Math.max(subScore.contribution, 0)],
    [],
  )
  const lit = Math.round(Math.min(Math.max(score, 0), 100))

  return (
    <svg
      viewBox={`0 0 ${SIDE * PITCH - (PITCH - TILE)} ${SIDE * PITCH - (PITCH - TILE)}`}
      aria-hidden="true"
      className={cn('block size-32 shrink-0', className)}
    >
      {Array.from({ length: SIDE * SIDE }, (_, index) => {
        const owner = bounds.findIndex((end) => index + 0.5 < end)
        const fill =
          index >= lit ? 'fill-tile-8' : SUB_SCORE_FILL[(owner === -1 ? bounds.length - 1 : owner) % SUB_SCORE_FILL.length]
        return (
          <rect
            key={index}
            x={(index % SIDE) * PITCH}
            y={(SIDE - 1 - Math.floor(index / SIDE)) * PITCH}
            width={TILE}
            height={TILE}
            className={fill}
          />
        )
      })}
    </svg>
  )
}
