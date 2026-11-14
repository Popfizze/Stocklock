import type { HypeComponent, HypeComponentId, HypeSignal } from '@/api/persona'
import { Tile3D, seeded, type SceneTile, type TileTone } from '@/components/three'

const COLUMNS = 14
const ROWS = 2
/** Space between two bands, in tiles. */
const BAND_GAP = 0.7
const CALM = 0.14
/** How high a band's tiles can jump, by its points (0 calm, 1 notable, 2 strong). */
const AGITATION = [0.12, 1.1, 2.4]
/** Above this share of the band's range, a strong band's tiles turn to the warning tone. */
const WARN_FROM = 0.55

function bandTiles(component: HypeComponent, band: number): SceneTile[] {
  const points = component.points
  const random = seeded(31 + band * 17)
  const tiles: SceneTile[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const jump = random()
      const height = points === null ? CALM / 2 : CALM + jump * AGITATION[points]
      let tone: TileTone = 7
      if (points === 0) tone = 6
      if (points === 1) tone = jump > WARN_FROM ? 3 : 5
      if (points === 2) tone = jump > WARN_FROM ? 'warn' : 2
      tiles.push({
        id: component.id,
        x: column,
        // The first component is the band nearest to the viewer.
        z: -band * (ROWS + BAND_GAP) - row,
        h: height,
        tone,
        label: `${component.label} · ${points === null ? 'non évalué' : `${points} point${points > 1 ? 's' : ''} sur 2`}`,
      })
    }
  }
  return tiles
}

interface HypeFieldProps {
  hype: HypeSignal
  /** A band was clicked: the component the investor says tempts them. */
  onPick: (component: HypeComponentId) => void
}

// 3D — the warning before « Prendre du recul » : a field of tiles in three bands (traded volume, run-up,
// news attention); a calm band lies flat, a stirred one jumps and breathes, so the frenzy is seen
// before it is read. Clicking a band starts the bias analysis from what tempts the investor.
export function HypeField({ hype, onPick }: HypeFieldProps) {
  const reading = hype.components
    .map((component) =>
      component.points === null
        ? `${component.label} non évalué`
        : `${component.label} ${component.points} point${component.points > 1 ? 's' : ''} sur 2`,
    )
    .join(', ')

  return (
    <Tile3D
      tiles={hype.components.flatMap((component, band) => bandTiles(component, band))}
      motion="wave"
      view="front"
      onSelect={(tile) => tile.id && onPick(tile.id as HypeComponentId)}
      label={`Le signal de battage en champ de tuiles, une bande par composante, d’autant plus agitée qu’elle marque de points : ${reading}. Les mêmes composantes sont détaillées dans la liste qui suit.`}
      className="h-44 sm:h-52"
    />
  )
}
