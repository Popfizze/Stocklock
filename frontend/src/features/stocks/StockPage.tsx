import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown } from 'lucide-react'
import { useStock, type StockRange } from '@/api/stocks'
import { AppLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
// Straight from the component, not the feature's index: that would pull the whole Comptes tab in.
import { StockAccountOptions } from '@/features/accounts/StockAccountOptions'
import { DividendList } from './DividendList'
import { formatLongDate, formatPrice, stockErrorMessage } from './format'
import { KeyFigures } from './KeyFigures'
import { PriceChange } from './PriceChange'
import { PriceChart } from './PriceChart'
import { StockBias } from './StockBias'
import { StockScore } from './StockScore'

/**
 * A title's page (`/titres/:ticker`, any title of the universe): last price
 * and day change, the price chart over 1S/1M/3M/1A/Max, the StockLock score,
 * key figures, dividends and bias analysis. The account comparison covers the
 * datathon's 31 assets.
 */
export function StockPage() {
  const { ticker = '' } = useParams()
  const [range, setRange] = useState<StockRange>('1M')
  const { data: stock, error, isPending, isPlaceholderData } = useStock(ticker, range)

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <Link
          to="/"
          className="inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Tableau de bord
        </Link>

        {isPending ? (
          <div role="status" aria-label="Chargement du titre" className="space-y-4">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {stockErrorMessage(error)}
          </p>
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">{stock.name}</h1>
              <p className="text-muted-foreground">
                {stock.ticker} · {stock.market}
              </p>
              <p className="pt-3 text-5xl font-semibold tracking-tight tabular-nums">
                {formatPrice(stock.last_close, stock.currency)}
              </p>
              <PriceChange
                changeAbs={stock.change_abs}
                changePct={stock.change_pct}
                currency={stock.currency}
                className="block font-medium"
              />
              <p className="pt-1 text-xs text-muted-foreground">
                Cours au {formatLongDate(stock.as_of)}
                {stock.source ? ` · ${stock.source.title}` : ''}
              </p>
              <div className="pt-3">
                <Button asChild variant="outline" size="sm">
                  <a href="#prendre-du-recul">
                    Prendre du recul <ArrowDown aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </header>

            <PriceChart
              points={stock.points}
              currency={stock.currency}
              range={range}
              onRangeChange={setRange}
              isUpdating={isPlaceholderData}
            />

            <StockScore ticker={stock.ticker} />

            <div className="grid gap-4 md:grid-cols-2">
              <KeyFigures stock={stock} />
              <DividendList dividends={stock.stats.dividends} currency={stock.currency} />
            </div>

            <StockBias ticker={stock.ticker} />

            {stock.starter_kit ? (
              <div className="border-t border-border pt-8">
                <StockAccountOptions ticker={stock.ticker} />
              </div>
            ) : (
              <p className="border-t border-border pt-6 text-sm text-muted-foreground">
                La comparaison des comptes (étape 3) couvre les 31 titres du jeu de données du
                datathon ; ce titre n'en fait pas partie.
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
