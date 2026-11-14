import type { ScoreRow, SubScore } from '@/api/stocks'
import { Tile3D, type SceneTile, type TileTone } from '@/components/three'
import { formatPoints, formatScore, formatWeight } from './format'

/** Height of a sub-score of 100, in tile units. */
const MAX_HEIGHT = 5
const SPACING = 2
/** A pillar's side: a base, plus what its weight adds (the square root keeps areas honest). */
const BASE_SIDE = 0.7
const WEIGHT_SIDE = 1.4
const FLAT = 0.06
/** The sub-scores' tile steps, in the API's order: the same as the gauge and the list. */
const TONES: TileTone[] = [1, 2, 3, 4, 5, 6]

/** One pillar per sub-score: height = its score, footprint = its weight after redistribution. */
function pillarTiles(subScores: SubScore[]): SceneTile[] {
  return subScores.map((subScore, index) => {
    const missing = subScore.score === null
    const side = missing ? BASE_SIDE : BASE_SIDE + Math.sqrt(subScore.effective_weight) * WEIGHT_SIDE
    return {
      id: subScore.id,
      x: index * SPACING,
      z: 0,
      w: side,
      d: side,
      h: missing ? FLAT : Math.max(FLAT, ((subScore.score ?? 0) / 100) * MAX_HEIGHT),
      tone: missing ? 7 : TONES[index % TONES.length],
      label: missing
        ? `${subScore.label} · non disponible`
        : `${subScore.label} · ${formatScore(subScore.score ?? 0)} / 100 · poids ${formatWeight(subScore.effective_weight)} · +${formatPoints(subScore.contribution)} pts`,
    }
  })
}

interface ScorePillarsProps {
  row: ScoreRow
  /** A pillar was clicked: its sub-score's id. */
  onSelect: (subScoreId: string) => void
}

// 3D — what carries the score: each sub-score is a pillar as tall as its score and as wide as its weight,
// and a plane marks the final score; the pillars that pierce it lift the score, the others hold it down.
export function ScorePillars({ row, onSelect }: ScorePillarsProps) {
  const reading = row.sub_scores
    .map((subScore) =>
      subScore.score === null ? `${subScore.label} non disponible` : `${subScore.label} ${formatScore(subScore.score)}`,
    )
    .join(', ')

  return (
    <div className="space-y-2">
      <Tile3D
        tiles={pillarTiles(row.sub_scores)}
        plane={{ y: (row.score / 100) * MAX_HEIGHT }}
        view="front"
        onSelect={(tile) => tile.id && onSelect(tile.id)}
        label={`Les sous-scores en piliers, hauteur selon la note sur 100 et largeur selon le poids : ${reading}. Le plan marque le score de ${formatScore(row.score)}. Les mêmes chiffres sont dans la liste des sous-scores.`}
        className="h-56 sm:h-64"
      />
      <p className="text-xs text-muted-foreground">
        Un pilier par sous-score : sa hauteur est sa note, sa largeur son poids. Le plan marque le score ;
        les piliers qui le dépassent le tirent vers le haut. Cliquez un pilier pour ouvrir ses indicateurs.
      </p>
    </div>
  )
}
