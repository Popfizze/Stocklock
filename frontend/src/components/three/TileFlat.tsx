import { TONE_FILLS, type SceneTile } from './tileModel'

interface TileFlatProps {
  tiles: SceneTile[]
}

/** Width of a character against the font size, for a rough text width. */
const CHAR = 0.58

/**
 * The tags kept on the flat mosaic: one line each, `tagFirst` ones first, and none that
 * would run into a tag already kept on the same row.
 */
function keptTags(tiles: SceneTile[], fontSize: number): Array<{ tile: SceneTile; text: string }> {
  const tagged = tiles.filter((tile) => tile.tag)
  const ordered = [...tagged.filter((tile) => tile.tagFirst), ...tagged.filter((tile) => !tile.tagFirst)]
  const kept: Array<{ tile: SceneTile; text: string; half: number }> = []
  for (const tile of ordered) {
    const text = (tile.tag ?? '').replace(/\n/g, ' ')
    const half = (text.length * fontSize * CHAR) / 2
    const row = tile.z - (tile.d ?? 1) / 2
    const clash = kept.some(
      (other) =>
        Math.abs(other.tile.z - (other.tile.d ?? 1) / 2 - row) < fontSize * 1.2 && Math.abs(other.tile.x - tile.x) < other.half + half + fontSize * 0.4,
    )
    if (!clash) kept.push({ tile, text, half })
  }
  return kept
}

/**
 * The scene seen from above, as a flat SVG mosaic: what is drawn while
 * three.js loads, and all there is where WebGL is not available. Heights are
 * lost in this view, so the tags carry the figures.
 */
export function TileFlat({ tiles }: TileFlatProps) {
  if (tiles.length === 0) return null
  const left = Math.min(...tiles.map((tile) => tile.x - (tile.w ?? 1) / 2))
  const right = Math.max(...tiles.map((tile) => tile.x + (tile.w ?? 1) / 2))
  const top = Math.min(...tiles.map((tile) => tile.z - (tile.d ?? 1) / 2))
  const bottom = Math.max(...tiles.map((tile) => tile.z + (tile.d ?? 1) / 2))

  // Tags are sized against the mosaic's extent, so they stay readable whatever the scene's scale.
  const fontSize = Math.max(right - left, (bottom - top) * 2.5) / 58
  const tags = keptTags(tiles, fontSize)
  // Room around the tiles for the tags above them and for the ones that stick out at both ends.
  const overhang = Math.max(0, ...tags.map(({ tile, text }) => (text.length * fontSize * CHAR) / 2 - (tile.w ?? 1) / 2))
  const minX = left - overhang
  const width = right - left + overhang * 2
  const minZ = tags.length > 0 ? top - fontSize * 1.6 : top

  return (
    <svg
      aria-hidden="true"
      viewBox={`${minX} ${minZ} ${width} ${bottom - minZ}`}
      preserveAspectRatio="xMidYMid meet"
      className="block size-full"
    >
      {/* From the ground up: a slab under a group of tiles is drawn before them, not over them. */}
      {[...tiles].sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).map((tile, index) => {
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
      {tags.map(({ tile, text }, index) => (
        <text
          key={`tag-${index}`}
          x={tile.x}
          y={tile.z - (tile.d ?? 1) / 2 - fontSize * 0.4}
          fontSize={fontSize}
          textAnchor="middle"
          className="fill-foreground font-medium"
        >
          {text}
        </text>
      ))}
    </svg>
  )
}
