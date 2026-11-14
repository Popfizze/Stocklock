import { cn } from '@/lib/utils'

const SIDE = 10
const CELL = 22
const TILE = 18

interface TileGaugeProps {
  /** 0-100: how many of the hundred tiles are filled, from the bottom row up. */
  value: number
  /** What the gauge says, with its number: « Score 65 sur 100 ». */
  label: string
  className?: string
}

/** A hundred tiles, `value` of them in ink: a score or a percentage at a glance. */
export function TileGauge({ value, label, className }: TileGaugeProps) {
  const filled = Math.round(Math.min(100, Math.max(0, value)))
  const size = SIDE * CELL - (CELL - TILE)
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} className={cn('h-auto w-28', className)}>
      {Array.from({ length: SIDE * SIDE }, (_, index) => {
        const row = Math.floor(index / SIDE)
        const column = index % SIDE
        return (
          <rect
            key={index}
            x={column * CELL}
            y={(SIDE - 1 - row) * CELL}
            width={TILE}
            height={TILE}
            className={index < filled ? 'fill-tile-1' : 'fill-tile-7'}
          />
        )
      })}
    </svg>
  )
}
