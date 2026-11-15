import { Link } from 'react-router-dom'
import type { FitResult } from '@/api/persona'
import type { StockCardData } from '@/api/stocks'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FitBadge } from './FitBadge'
import { TREND_TEXT, formatCardPrice, formatSignedPercent, trendOf } from './format'
import { ScoreBadge } from './ScoreBadge'
import { Sparkline } from './Sparkline'

interface StockCardProps {
  stock: StockCardData
  /** The title's fit for the active profile, once known. */
  fit?: FitResult
}

/** A compact card of the Tableau de bord's grid: symbol, name, month curve, price, day change, score and profile fit when known. */
export function StockCard({ stock, fit }: StockCardProps) {
  return (
    <Link
      to={`/titres/${encodeURIComponent(stock.ticker)}`}
      className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/40 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{stock.ticker}</span>
          <span className="block truncate text-xs text-muted-foreground">{stock.name}</span>
        </span>
        {stock.score !== null && <ScoreBadge score={stock.score} partiel={stock.score_partiel} />}
      </span>
      {/* The curve keeps its place when a title has none, so prices line up across a row. */}
      <span className="block h-9">
        <Sparkline values={stock.sparkline} className="h-9 w-full" />
      </span>
      <span className="mt-auto flex items-baseline justify-between gap-2 text-sm tabular-nums">
        <span className="truncate font-medium">{formatCardPrice(stock.price, stock.currency)}</span>
        {stock.change_pct !== null && (
          <span className={cn('shrink-0', TREND_TEXT[trendOf(stock.change_pct)])}>
            {formatSignedPercent(stock.change_pct)}
          </span>
        )}
      </span>
      {/* The pastille keeps its line while the verdicts load, so the cards do not jump. */}
      <span className="flex h-4 items-center gap-2">
        {fit && <FitBadge verdict={fit.verdict} summary={fit.summary} />}
        {/* Hype is only flagged when it is high: a quiet word, the detail is on the title's page. */}
        {fit?.hype?.level === 'eleve' && (
          <span title={fit.hype.reasons.join(' ')} className="ml-auto text-xs text-warning">
            Tendance élevée
          </span>
        )}
      </span>
    </Link>
  )
}

/** Placeholder of a card while its section loads. */
export function StockCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

/** The responsive grid every section and skeleton shares. */
export const STOCK_GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
