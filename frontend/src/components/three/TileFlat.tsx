import { TONE_FILLS, type SceneTile } from './tileModel'

interface TileFlatProps {
  tiles: SceneTile[]
}

/**
 * The scene seen from above, as a flat SVG mosaic: what is drawn while
 * three.js loads, and all there is where WebGL is not available.
 */
export function TileFlat({ tiles }: TileFlatProps) {
  if (tiles.length === 0) return null
  const minX = Math.min(...tiles.map((tile) => tile.x - (tile.w ?? 1) / 2))
  const maxX = Math.max(...tiles.map((tile) => tile.x + (tile.w ?? 1) / 2))
  const minZ = Math.min(...tiles.map((tile) => tile.z - (tile.d ?? 1) / 2))
  const maxZ = Math.max(...tiles.map((tile) => tile.z + (tile.d ?? 1) / 2))

  return (
    <svg
      aria-hidden="true"
      viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
      preserveAspectRatio="xMidYMid meet"
      className="block size-full"
    >
      {tiles.map((tile, index) => {
        const w = (tile.w ?? 1) * 0.9
        const d = (tile.d ?? 1) * 0.9
        return (
          <rect
            key={index}
            x={tile.x - w / 2}
            y={tile.z - d / 2}
            width={w}
            height={d}
            className={TONE_FILLS[tile.tone]}
          />
        )
      })}
    </svg>
  )
}
