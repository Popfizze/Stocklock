import { Link } from 'react-router-dom'
import type { StockSummary } from '@/api/stocks'
import { formatPrice } from './format'
import { groupStocks } from './groups'
import { PriceChange } from './PriceChange'
import { Sparkline } from './Sparkline'

interface StockRowProps {
  stock: StockSummary
}

function StockRow({ stock }: StockRowProps) {
  return (
    <li>
      <Link
        to={`/titres/${encodeURIComponent(stock.ticker)}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:gap-6"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{stock.ticker}</span>
          <span className="block truncate text-sm text-muted-foreground">{stock.name}</span>
        </span>
        <Sparkline values={stock.sparkline} className="w-16 shrink-0 sm:w-24" />
        <span className="w-32 shrink-0 text-right sm:w-44">
          <span className="block font-medium tabular-nums">
            {formatPrice(stock.last_close, stock.currency)}
          </span>
          <PriceChange
            changeAbs={stock.change_abs}
            changePct={stock.change_pct}
            currency={stock.currency}
            className="block text-sm"
          />
        </span>
      </Link>
    </li>
  )
}

interface StockListProps {
  stocks: StockSummary[]
  query: string
}

/** The assets matching `query`, by section: « Actions canadiennes », « Actions américaines », « FNB », « Cryptomonnaies ». */
export function StockList({ stocks, query }: StockListProps) {
  const groups = groupStocks(stocks, query)

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        Aucun titre ne correspond à « {query.trim()} ».
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`groupe-${group.id}`}>
          <h2 id={`groupe-${group.id}`} className="mb-2 text-lg font-semibold">
            {group.label}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {group.stocks.map((stock) => (
              <StockRow key={stock.ticker} stock={stock} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
