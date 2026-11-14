import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStock, type StockRange } from '@/api/stocks'
import { AppLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { ArrowDown } from 'lucide-react'
// Straight from the component, not the feature's index: that would pull the whole Comptes tab in.
import { StockAccountOptions } from '@/features/accounts/StockAccountOptions'
import { DividendList } from './DividendList'
import { formatPrice, stockErrorMessage } from './format'
import { KeyFigures } from './KeyFigures'
import { PriceChange } from './PriceChange'
import { PriceChart } from './PriceChart'
import { StockBias } from './StockBias'

/**
 * A stock's page (`/titres/:ticker`): last close and day change, the closing
 * price chart over 1S/1M/3M/1A/Max, its key figures and its dividends, then
 * which registered account suits it for the active profile (step 3).
 */
export function StockPage() {
  const { ticker = '' } = useParams()
  const [range, setRange] = useState<StockRange>('1M')
  const { data: stock, error, isPending, isPlaceholderData } = useStock(ticker, range)

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          to="/"
          className="inline-block text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          ← Tableau de bord
        </Link>

        {isPending ? (
          <p role="status" className="text-muted-foreground">
            Chargement du titre…
          </p>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {stockErrorMessage(error)}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">{stock.name}</h1>
              <p className="text-muted-foreground">
                {stock.ticker} · {stock.market}
              </p>
              <p className="pt-2 text-4xl font-semibold tabular-nums">
                {formatPrice(stock.last_close, stock.currency)}
              </p>
              <PriceChange
                changeAbs={stock.change_abs}
                changePct={stock.change_pct}
                currency={stock.currency}
                className="block font-medium"
              />
              <div className="pt-2"><Button asChild variant="outline" size="sm"><a href="#prendre-du-recul">Prendre du recul <ArrowDown aria-hidden="true" /></a></Button></div>
            </div>

            <PriceChart
              points={stock.points}
              currency={stock.currency}
              range={range}
              onRangeChange={setRange}
              isUpdating={isPlaceholderData}
            />

            <div className="grid gap-6 md:grid-cols-2">
              <KeyFigures stock={stock} />
              <DividendList dividends={stock.stats.dividends} currency={stock.currency} />
            </div>

            <StockBias ticker={stock.ticker} />

            {/* Step 3: which registered account for this stock, for the active profile. */}
            <div className="border-t border-border pt-6">
              <StockAccountOptions ticker={stock.ticker} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
