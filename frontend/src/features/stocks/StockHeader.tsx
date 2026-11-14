import { Link } from 'react-router-dom'
import type { StockDetail } from '@/api/stocks'
import { ASSET_CLASS_LABELS } from '@/features/accounts/accountMeta'
import { formatLongDate, formatPrice } from './format'
import { PriceChange } from './PriceChange'

/** Back to the Tableau de bord, above every state of the page. */
export function BackLink() {
  return (
    <Link
      to="/"
      className="inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      ← Tableau de bord
    </Link>
  )
}

interface StockHeaderProps {
  stock: StockDetail
}

/** Who the title is and what it is worth: name, symbol and exchange, last price, day change, date and source. */
export function StockHeader({ stock }: StockHeaderProps) {
  const assetClass = ASSET_CLASS_LABELS[stock.asset_class]
  // The API writes a French note when there is no sector (« Non applicable (FNB) »): the details list keeps it.
  const sector = stock.sector.startsWith('Non ') ? null : stock.sector
  const kind = [assetClass, sector].filter(Boolean).join(' · ')

  return (
    <header className="stagger space-y-6">
      <div className="space-y-2">
        <p className="eyebrow">
          {stock.ticker} · {stock.market}
        </p>
        <h1 className="text-4xl sm:text-5xl">{stock.name}</h1>
        {kind && <p className="text-sm text-muted-foreground">{kind}</p>}
      </div>
      <div className="space-y-2">
        <p className="display text-6xl sm:text-7xl">{formatPrice(stock.last_close, stock.currency)}</p>
        <p className="font-medium">
          <PriceChange changeAbs={stock.change_abs} changePct={stock.change_pct} currency={stock.currency} />
          <span className="font-normal text-muted-foreground"> sur la séance</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Cours au {formatLongDate(stock.as_of)}
          {stock.source && (
            <>
              {' · '}
              {stock.source.url ? (
                <a href={stock.source.url} target="_blank" rel="noopener noreferrer" className="link">
                  {stock.source.title}
                </a>
              ) : (
                stock.source.title
              )}
            </>
          )}
          {!stock.in_universe && ' · hors de l’univers SEC + TMX'}
        </p>
      </div>
    </header>
  )
}
