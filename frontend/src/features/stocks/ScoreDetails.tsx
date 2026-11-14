import { useMemo, useState } from 'react'
import { useReweight } from '@/api/scoring'
import type { ScoreRow } from '@/api/stocks'
import { Badge } from '@/components/ui/badge'
import { useActivePersona } from '@/features/personas/activePersona'
import { isDefaultSetup, readScoreSetup, toScoringChoice } from '@/features/portfolio/scoreWeights'
import { formatLongDate, formatScore } from './format'
import { PersonalScore } from './PersonalScore'
import { ScoreGauge } from './ScoreGauge'
import { ScoreScene } from './ScoreScene'
import { SubScoreList } from './SubScoreList'

interface ScoreDetailsProps {
  ticker: string
  row: ScoreRow
  generatedAt: string | null
}

/**
 * A computed score: the figure (and the profile's own score when it set its
 * weights in « Mon portefeuille »), the tile gauge, the 3D scene of how the
 * score is built, then the sub-scores and their indicators.
 */
export function ScoreDetails({ ticker, row, generatedAt }: ScoreDetailsProps) {
  const { personaId } = useActivePersona()
  // The profile's own weights, kept in localStorage by « Mon portefeuille ».
  const setup = useMemo(() => (personaId ? readScoreSetup(personaId) : null), [personaId])
  const custom = setup !== null && !isDefaultSetup(setup)
  const reweight = useReweight(custom && setup ? { ...toScoringChoice(setup), tickers: [ticker] } : null)
  const personal = custom ? reweight.data?.items[0] : undefined
  // The sub-score opened, shared by the 3D scene (a click on a pillar) and the list.
  const [focus, setFocus] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <p className="flex items-baseline gap-2">
          <span className="display flip-in inline-block text-7xl sm:text-8xl">{formatScore(row.score)}</span>
          <span className="font-display text-xl text-muted-foreground">/ 100</span>
          {row.partiel && (
            <Badge variant="warning" className="ml-2 self-center">
              Partiel
            </Badge>
          )}
        </p>
        <PersonalScore custom={custom} row={personal} total={reweight.data?.total} />
      </div>

      <div className="grid gap-x-10 gap-y-6 md:grid-cols-3 md:items-end">
        <div className="space-y-4">
          <div className="flex items-end gap-5 md:block md:space-y-4">
            <ScoreGauge score={row.score} subScores={row.sub_scores} className="size-28" />
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Données au</dt>
                <dd className="font-medium">{formatLongDate(row.date)}</dd>
              </div>
              {row.comparison_set && (
                <div>
                  <dt className="text-xs text-muted-foreground">Comparé à</dt>
                  <dd className="font-medium">{row.comparison_set}</dd>
                </div>
              )}
              {generatedAt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Calculé le</dt>
                  <dd className="font-medium">{formatLongDate(generatedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
          <p className="text-xs text-muted-foreground">
            {row.partiel
              ? 'Score partiel : au moins un sous-score manque, son poids est redistribué sur les autres. '
              : ''}
            Une tuile par point : sa teinte est celle du sous-score qui l’apporte.
          </p>
        </div>
        <div className="md:col-span-2">
          <ScoreScene row={row} focus={focus} onFocus={setFocus} personal={personal} />
        </div>
      </div>

      <SubScoreList subScores={row.sub_scores} focus={focus} onFocus={setFocus} />

      {row.sources.length > 0 && (
        <div className="space-y-1.5 text-sm">
          <h3 className="eyebrow">Sources</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {row.sources.map((source) => (
              <li key={source.id}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="link">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {source.as_of && (
                  <span className="text-muted-foreground"> · au {formatLongDate(source.as_of)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
