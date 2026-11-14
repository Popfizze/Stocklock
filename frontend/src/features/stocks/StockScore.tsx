import { Link } from 'react-router-dom'
import { useStockScore, type ScoreRow } from '@/api/stocks'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatLongDate, formatScore, marketErrorMessage } from './format'
import { SubScoreList } from './SubScoreList'

interface StockScoreProps {
  ticker: string
}

/**
 * « Score StockLock » of a title, read from the gold table: the score 0-100,
 * its six sub-scores and their raw indicators — or, while the score pipeline
 * has not produced it, a plain « Score pas encore calculé ».
 */
export function StockScore({ ticker }: StockScoreProps) {
  const { data, error, isPending } = useStockScore(ticker)

  return (
    <section aria-labelledby="score-titre" className="space-y-5">
      <h2 id="score-titre" className="text-xl font-semibold tracking-tight">
        Score StockLock
      </h2>

      {isPending ? (
        <div role="status" aria-label="Chargement du score" className="space-y-3">
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {marketErrorMessage(error)}
        </p>
      ) : data.status === 'available' && data.score ? (
        <ScoreDetails row={data.score} generatedAt={data.generated_at} />
      ) : (
        <div className="rounded-xl border border-border p-5">
          <p className="font-medium">
            {data.status === 'unavailable' ? 'Score indisponible' : 'Score pas encore calculé'}
          </p>
          {data.message && <p className="mt-1 text-sm text-muted-foreground">{data.message}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            Le score (0 à 100) combine six sous-scores : rentabilité, solidité financière,
            croissance, valorisation, momentum et risque, événements. Le pipeline se lance depuis
            le{' '}
            <Link to="/labo" className="link text-foreground">
              Labo
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  )
}

interface ScoreDetailsProps {
  row: ScoreRow
  generatedAt: string | null
}

function ScoreDetails({ row, generatedAt }: ScoreDetailsProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <p className="flex items-baseline gap-2">
          <span className="text-6xl font-semibold tracking-tight tabular-nums">
            {formatScore(row.score)}
          </span>
          <span className="text-lg text-muted-foreground">/ 100</span>
          {row.partiel && (
            <Badge variant="warning" className="ml-2 self-center">
              Partiel
            </Badge>
          )}
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
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

      {row.partiel && (
        <p className="text-sm text-muted-foreground">
          Score partiel : au moins un sous-score manque, son poids est redistribué sur les autres.
        </p>
      )}

      <SubScoreList subScores={row.sub_scores} />

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
