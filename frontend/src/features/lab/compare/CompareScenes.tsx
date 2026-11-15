import { useMemo } from 'react'
import { Tile3D } from '@/components/three'
import { Card, CardContent } from '@/components/ui/card'
import type { RunView } from '../run/runView'
import type { CompareSide } from './compareModel'
import { conveyorComparison, measureComparison } from './compareScene'

interface CompareScenesProps {
  views: [RunView, RunView]
  sides: readonly [CompareSide, CompareSide]
}

const LEGEND: Array<[swatch: string, text: string]> = [
  ['bg-tile-2', 'A'],
  ['bg-tile-5', 'B'],
  ['bg-warning', 'ce qui a changé'],
  ['bg-tile-7', 'identique'],
]

/** The comparison in 3D: where the two runs part ways on the conveyor, then by how much, measure by measure. */
export function CompareScenes({ views, sides }: CompareScenesProps) {
  const conveyors = useMemo(() => conveyorComparison(views[0], views[1], sides), [views, sides])
  const measures = useMemo(() => measureComparison(sides[0], sides[1]), [sides])
  const count = conveyors.differing.length
  const reading = conveyors.same
    ? count === 0
      ? 'Les deux exécutions ont suivi les mêmes étapes, avec le même état.'
      : `${count} étape${count > 1 ? 's diffèrent' : ' diffère'} : ${conveyors.differing.join(' ; ')}.`
    : `Deux pipelines différents (${views[0].pipelineLabel} et ${views[1].pipelineLabel}) : leurs étapes ne se comparent pas une à une. Se comparent : la durée, le statut, le nombre d'étapes et de titres, et le coût quand les deux le mesurent.`

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="space-y-3">
          <h2 className="eyebrow">Les deux convoyeurs, face à face</h2>
          {/* 3D — where two runs part ways: A's conveyor in front, B's behind; a stage that differs rises on a lit plate with what changed, the others lie flat. */}
          <Tile3D
            tiles={conveyors.tiles}
            view="front"
            label={`Les deux exécutions en convoyeurs face à face, des entrées à la sortie, A devant et B derrière. ${reading} Le détail suit en texte.`}
            className="h-60 sm:h-72"
          />
          <p role="note" className="text-sm text-muted-foreground">
            {reading}
          </p>
        </CardContent>
      </Card>
      {measures.shared.length + measures.params.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="eyebrow">Les écarts, mesure par mesure</h2>
            {/* 3D — by how much they differ: one pair of towers per shared measure (A ink, B grey) with the gap on top, and a split tile per parameter that changed. */}
            <Tile3D
              tiles={measures.tiles}
              view="front"
              label={`Les mesures communes aux deux exécutions en tours jumelles (${measures.shared.join(', ') || 'aucune'}) : A en encre, B en gris, chaque paire à l'échelle de sa plus grande valeur, l'écart écrit au sommet. Les paramètres modifiés sont des tuiles fendues. Les valeurs sont dans les listes qui suivent.`}
              className="h-60 sm:h-72"
            />
            <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {LEGEND.map(([swatch, text]) => (
                <li key={text} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-3 ${swatch}`} /> {text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
