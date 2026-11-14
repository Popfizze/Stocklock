import { useState } from 'react'
import { useStocks } from '@/api/stocks'
import { AppLayout } from '@/components/layout'
import { Input } from '@/components/ui/input'
import { formatLongDate, stockErrorMessage } from '@/features/stocks/format'
import { StockList } from '@/features/stocks/StockList'

/**
 * « Tableau de bord » : the starter kit's 31 assets at their last close, by
 * section, with a search on name or symbol. A row opens the stock's page.
 */
export function DashboardPage() {
  const { data: stocks, error, isPending } = useStocks()
  const [query, setQuery] = useState('')

  // Every series ends on the same day; the latest one names the closes shown.
  const asOf = stocks?.reduce((latest, stock) => (stock.as_of > latest ? stock.as_of : latest), '')

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Tableau de bord</h1>
          {asOf && (
            <p className="text-muted-foreground">
              Cours de clôture au {formatLongDate(asOf)} (données du datathon)
            </p>
          )}
        </div>

        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher par nom ou symbole"
          aria-label="Rechercher un titre par nom ou symbole"
        />

        {isPending ? (
          <p role="status" className="text-muted-foreground">
            Chargement des cours…
          </p>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {stockErrorMessage(error)}
          </p>
        ) : (
          <StockList stocks={stocks} query={query} />
        )}
      </div>
    </AppLayout>
  )
}
