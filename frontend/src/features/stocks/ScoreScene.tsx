import type { ReweightedRow } from '@/api/scoring'
import type { ScoreRow } from '@/api/stocks'
import { Tile3D } from '@/components/three'
import { Button } from '@/components/ui/button'
import { formatScore } from './format'
import { MAX_HEIGHT, indicatorTiles, overviewTiles } from './scoreTiles'

interface ScoreSceneProps {
  row: ScoreRow
  /** The sub-score opened (its indicators are drawn instead of the six pillars), or `null`. */
  focus: string | null
  onFocus: (subScoreId: string | null) => void
  /** The title rescored with the user's own weights, when they have some. */
  personal?: ReweightedRow
}

// 3D — how the score is built: six pillars (height = sub-score, width = weight) and the tower their
// contributions stack into, level with a plane at the final score; a click on a pillar opens it into
// its raw indicators, each as tall as its rank. A partial score shows as pillars lying flat.
export function ScoreScene({ row, focus, onFocus, personal }: ScoreSceneProps) {
  const index = row.sub_scores.findIndex((subScore) => subScore.id === focus)
  const opened = index === -1 ? undefined : row.sub_scores[index]
  const drilled = opened !== undefined && opened.score !== null && opened.indicators.length > 0
  const reading = row.sub_scores
    .map((subScore) =>
      subScore.score === null ? `${subScore.label} non disponible` : `${subScore.label} ${formatScore(subScore.score)}`,
    )
    .join(', ')
  const own = personal?.custom_score != null ? `, et la tour de votre score, ${formatScore(personal.custom_score)}` : ''

  return (
    <div className="space-y-2">
      {drilled ? (
        <Tile3D
          tiles={indicatorTiles(opened, index)}
          plane={{ y: ((opened.score ?? 0) / 100) * MAX_HEIGHT }}
          view="front"
          label={`${opened.label} : ${opened.indicators.length} indicateur${opened.indicators.length > 1 ? 's' : ''} en colonnes, hauteur selon le rang sur 100 parmi les titres comparables. Le plan marque la note du sous-score, ${formatScore(opened.score ?? 0)}. Les valeurs et les rangs sont dans la liste du sous-score.`}
          className="h-56 sm:h-64"
        />
      ) : (
        <Tile3D
          tiles={overviewTiles(row, personal)}
          plane={{ y: (row.score / 100) * MAX_HEIGHT }}
          view="front"
          onSelect={(tile) => tile.id && onFocus(tile.id)}
          label={`Le score en construction : six piliers, hauteur selon la note sur 100 et largeur selon le poids (${reading}), puis la tour de leurs contributions, haute de ${formatScore(row.score)}${own}. Le plan marque le score. Les mêmes chiffres sont dans la liste des sous-scores.`}
          className="h-56 sm:h-64"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="max-w-md text-xs text-muted-foreground">
          {drilled
            ? `Les indicateurs de « ${opened.label} » : plus la colonne est haute, mieux le titre est classé. Le plan marque la note du sous-score.`
            : 'Six piliers (hauteur = note, largeur = poids) et, à droite, la tour de ce que chacun apporte : son sommet est le score. Cliquez un pilier pour voir ses indicateurs.'}
        </p>
        {drilled && (
          <Button type="button" variant="outline" size="xs" onClick={() => onFocus(null)}>
            Revenir aux six sous-scores
          </Button>
        )}
      </div>
    </div>
  )
}
