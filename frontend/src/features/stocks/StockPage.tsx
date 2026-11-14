import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useFit } from '@/api/persona'
import { useStock, type StockRange } from '@/api/stocks'
import { AppLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { DecisionSummary } from './DecisionSummary'
import { DividendList } from './DividendList'
import { stockErrorMessage } from './format'
import { KeyFigures } from './KeyFigures'
import { PriceChart } from './PriceChart'
import { ProfileFit } from './ProfileFit'
import { StockAccount } from './StockAccount'
import { StockEsg } from './StockEsg'
import { BackLink, StockHeader } from './StockHeader'
import { StockMoves } from './StockMoves'
import { StockRecul } from './StockRecul'
import { StockScore } from './StockScore'
import { StockSection } from './StockSection'

/**
 * A title's page (`/titres/:ticker`, any title of the universe), built as a
 * decision page for the active investor profile. Top to bottom: who the title
 * is and its price chart; « Pour {profil} », the profile's verdict with its
 * reasons and a one-line summary of every block (a rail beside the page on
 * wide screens); the StockLock score (step 1); the hype signal and the bias
 * analysis (step 4); why it moved (step 2); the best account (step 3); ESG
 * and controversies; then the reference figures. Each block loads, fails and
 * stays empty on its own.
 */
export function StockPage() {
  const { ticker = '' } = useParams()
  const [range, setRange] = useState<StockRange>('1M')
  const { data: stock, error, isPending, isPlaceholderData, refetch } = useStock(ticker, range)
  const { persona, personaId } = useActivePersona()
  const fit = useFit(stock?.ticker ?? '', personaId)

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <BackLink />

        {isPending ? (
          <div role="status" aria-label="Chargement du titre" className="space-y-4">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-destructive">{stockErrorMessage(error)}</p>
            {error.status !== 404 && (
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Réessayer
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              <StockHeader stock={stock} />
              <PriceChart
                points={stock.points}
                currency={stock.currency}
                range={range}
                onRangeChange={setRange}
                isUpdating={isPlaceholderData}
              />
            </div>

            {/* The decision first: right after the chart on a phone, a rail that follows the page on wide screens. */}
            {persona && (
              <aside className="min-w-0 lg:col-start-3 lg:row-span-2 lg:row-start-1">
                <div className="lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto">
                  <ProfileFit
                    persona={persona}
                    fit={fit.data}
                    error={fit.error}
                    isPending={fit.isPending}
                    onRetry={() => fit.refetch()}
                  >
                    <DecisionSummary ticker={stock.ticker} starterKit={stock.starter_kit} fit={fit.data} />
                  </ProfileFit>
                </div>
              </aside>
            )}

            <div className="min-w-0 space-y-10 lg:col-span-2">
              <StockScore ticker={stock.ticker} />
              {persona && <StockRecul ticker={stock.ticker} personaName={persona.name} fit={fit.data} />}
              <StockMoves ticker={stock.ticker} />
              <StockAccount ticker={stock.ticker} starterKit={stock.starter_kit} />
              {persona && <StockEsg ticker={stock.ticker} personaName={persona.name} fit={fit.data} />}
              <StockSection
                id="details"
                title="Détails"
                description="Les chiffres de référence de la dernière séance et de l’année, et les dividendes versés."
              >
                <div className="space-y-10">
                  <KeyFigures stock={stock} />
                  <DividendList dividends={stock.stats.dividends} currency={stock.currency} />
                </div>
              </StockSection>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
