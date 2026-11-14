import { seeded } from '@/components/three/tileModel'
import { cn } from '@/lib/utils'

const FILLS = [
  'fill-tile-1',
  'fill-tile-2',
  'fill-tile-3',
  'fill-tile-4',
  'fill-tile-5',
  'fill-tile-6',
  'fill-tile-6',
  'fill-tile-7',
  'fill-tile-7',
  'fill-tile-8',
]

interface TileMosaicProps {
  columns?: number
  rows?: number
  /** Same seed, same mosaic. */
  seed?: number
  className?: string
}

/** A decorative band of square tiles in the grey scale; identical on every load. */
export function TileMosaic({ columns = 24, rows = 3, seed = 7, className }: TileMosaicProps) {
  const random = seeded(seed)
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${columns} ${rows}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('block w-full', className)}
    >
      {Array.from({ length: columns * rows }, (_, index) => (
        <rect
          key={index}
          x={(index % columns) + 0.04}
          y={Math.floor(index / columns) + 0.04}
          width={0.92}
          height={0.92}
          className={FILLS[Math.floor(random() * FILLS.length)]}
        />
      ))}
    </svg>
  )
}
