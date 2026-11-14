import { cn } from '@/lib/utils'

/** A tile and the gap after it, in the strip's own units. */
const PITCH = 10
const TILE = 8

interface TileStripProps {
  /** Share of the strip that is filled, 0 to 1 (the last tile can be partly filled). */
  value: number
  /** Number of square tiles. */
  tiles?: number
  /** `fill`: every tile up to `value`; `spot`: only the tile `value` falls in. */
  mode?: 'fill' | 'spot'
  /** A limit drawn as a tick across the strip, 0 to 1. */
  mark?: number
  /** Fill class of the lit tiles. */
  tone?: string
  className?: string
}

/**
 * A measure as a row of square tiles — the tile language's bar. Decorative:
 * the figure it draws is always written next to it.
 */
export function TileStrip({ value, tiles = 10, mode = 'fill', mark, tone = 'fill-tile-1', className }: TileStripProps) {
  const lit = Math.min(Math.max(value, 0), 1) * tiles
  const spot = Math.min(Math.floor(lit), tiles - 1)
  const width = tiles * PITCH - (PITCH - TILE)

  return (
    <svg
      viewBox={`0 -2 ${width} ${TILE + 4}`}
      aria-hidden="true"
      className={cn('block h-auto w-full', className)}
    >
      {Array.from({ length: tiles }, (_, index) => {
        const share = mode === 'spot' ? (index === spot ? 1 : 0) : Math.min(Math.max(lit - index, 0), 1)
        return (
          <g key={index}>
            <rect x={index * PITCH} width={TILE} height={TILE} className="fill-tile-7" />
            {share > 0 && <rect x={index * PITCH} width={TILE * share} height={TILE} className={tone} />}
          </g>
        )
      })}
      {mark !== undefined && (
        <rect x={Math.min(Math.max(mark, 0), 1) * width - 0.75} y={-2} width={1.5} height={TILE + 4} className="fill-foreground" />
      )}
    </svg>
  )
}
