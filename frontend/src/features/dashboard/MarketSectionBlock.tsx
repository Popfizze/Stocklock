import { useState } from 'react'
import { SECTION_MAX_LIMIT, useMarketSection, type MarketSectionInfo } from '@/api/stocks'
import { Button } from '@/components/ui/button'
import { formatLongDate, marketErrorMessage } from '@/features/stocks/format'
import { STOCK_GRID, StockCard, StockCardSkeleton } from '@/features/stocks/StockCard'

const INITIAL_LIMIT = 24
const SKELETON_COUNT = 12

interface MarketSectionBlockProps {
  section: MarketSectionInfo
}

/**
 * One section of the Tableau de bord (« Les plus populaires », « Meilleurs
 * scores »…): its own request, so it loads, fails or stays empty on its own.
 */
export function MarketSectionBlock({ section }: MarketSectionBlockProps) {
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const { data, error, isPending, isFetching, refetch } = useMarketSection(section.id, limit)
  const headingId = `section-${section.id}`
  const items = data?.items ?? []
  // The server served as many cards as asked: there may be more.
  const canShowMore = data?.status === 'ok' && items.length >= limit && limit < SECTION_MAX_LIMIT

  return (
    <section aria-labelledby={headingId} className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {section.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{section.description}</p>
      </div>

      {isPending ? (
        <div role="status" aria-label={`Chargement de « ${section.title} »`} className={STOCK_GRID}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <StockCardSkeleton key={index} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4 text-sm">
          <p className="text-destructive">{marketErrorMessage(error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Réessayer
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          {data.message ?? 'Aucun titre dans cette section pour le moment.'}
        </p>
      ) : (
        <>
          <ul className={STOCK_GRID}>
            {items.map((stock) => (
              <li key={stock.ticker}>
                <StockCard stock={stock} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {items.length} titres · {section.source}
              {data.as_of ? ` · au ${formatLongDate(data.as_of)}` : ''}
            </p>
            {canShowMore && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isFetching}
                onClick={() => setLimit((current) => Math.min(current * 2, SECTION_MAX_LIMIT))}
              >
                {isFetching ? 'Chargement…' : 'Afficher plus'}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
