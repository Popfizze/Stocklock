import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStockScore, type ScoreRow } from '@/api/stocks'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLongDate, formatScore } from './format'
import { ScoreGauge } from './ScoreGauge'
import { ScorePillars } from './ScorePillars'
import { BlockError, StockSection } from './StockSection'
import { SubScoreList } from './SubScoreList'

interface StockScoreProps {
  ticker: string
}

/**
 * « Score StockLock » of a title (step 1), read from the gold table: the score
 * 0-100, how its six sub-scores add up to it, and the raw indicators behind
 * each — or, while the score pipeline has not produced it, a plain « Score pas
 * encore calculé ».
 */
export function StockScore({ ticker }: StockScoreProps) {
  const { data, error, isPending, refetch } = useStockScore(ticker)

  return (
    <StockSection
      id="score"
      eyebrow="Étape 1 · Score d’entreprise"
      title="Score"
      accent="StockLock"
      description="Une note de 0 à 100 : la somme de six sous-scores pondérés, chacun calculé à partir d’indicateurs publics et classé parmi des titres comparables."
    >
      {isPending ? (
        <div role="status" aria-label="Chargement du score" className="space-y-3">
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <BlockError error={error} subject="Score" onRetry={() => refetch()} />
      ) : data.status === 'available' && data.score ? (
        <ScoreDetails row={data.score} generatedAt={data.generated_at} />
      ) : (
        <div className="rounded-3xl border border-border p-6">
          <p className="font-display text-xl">
            {data.status === 'unavailable' ? 'Score indisponible' : 'Score pas encore calculé'}
          </p>
          {data.message && <p className="mt-1 text-sm text-muted-foreground">{data.message}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            Le score combine six sous-scores : rentabilité, solidité financière, croissance,
            valorisation, momentum et risque, événements. Le pipeline se lance depuis le{' '}
            <Link to="/labo" className="link text-foreground">
              Labo
            </Link>
            .
          </p>
        </div>
      )}
    </StockSection>
  )
}

interface ScoreDetailsProps {
  row: ScoreRow
  generatedAt: string | null
}

function ScoreDetails({ row, generatedAt }: ScoreDetailsProps) {
  // The sub-scores whose indicators are open: from the list itself, or from a pillar of the 3D scene.
  const [open, setOpen] = useState<string[]>([])
  const openOne = (id: string) => setOpen((current) => (current.includes(id) ? current : [...current, id]))

  return (
    <div className="space-y-6">
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 md:items-end">
        <div className="space-y-5">
          <p className="flex items-baseline gap-2">
            <span className="display flip-in inline-block text-7xl sm:text-8xl">{formatScore(row.score)}</span>
            <span className="font-display text-xl text-muted-foreground">/ 100</span>
            {row.partiel && (
              <Badge variant="warning" className="ml-2 self-center">
                Partiel
              </Badge>
            )}
          </p>
          <div className="flex items-end gap-6">
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
          <p className="text-sm text-muted-foreground">
            {row.partiel
              ? 'Score partiel : au moins un sous-score manque, son poids est redistribué sur les autres. '
              : ''}
            Une tuile par point : sa teinte est celle du sous-score qui l’apporte.
          </p>
        </div>
        <ScorePillars row={row} onSelect={openOne} />
      </div>

      <SubScoreList subScores={row.sub_scores} open={open} onOpenChange={setOpen} />

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
