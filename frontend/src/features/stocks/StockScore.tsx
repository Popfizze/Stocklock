import { Link } from 'react-router-dom'
import { useStockScore } from '@/api/stocks'
import { Skeleton } from '@/components/ui/skeleton'
import { ScoreDetails } from './ScoreDetails'
import { BlockError, StockSection } from './StockSection'

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
        <ScoreDetails ticker={ticker} row={data.score} generatedAt={data.generated_at} />
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
