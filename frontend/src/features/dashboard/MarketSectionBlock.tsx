import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { fitByTicker, useFitBatch } from '@/api/persona'
import { SECTION_MAX_LIMIT, useMarketSection, type MarketSectionInfo } from '@/api/stocks'
import { useActivePersona } from '@/features/personas/activePersona'
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
  // Arriving on `/#section-<id>` (e.g. from a finished score run) brings the section into view.
  const { hash } = useLocation()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (hash === `#${headingId}`) ref.current?.scrollIntoView({ block: 'start' })
  }, [hash, headingId])
  const items = data?.items ?? []
  // The cards' verdict for the active profile: one batch per section, quietly absent if it fails.
  const { personaId } = useActivePersona()
  const { data: fitBatch } = useFitBatch(personaId, items.map((item) => item.ticker))
  const fits = fitByTicker(fitBatch)
  // The server served as many cards as asked: there may be more.
  const canShowMore = data?.status === 'ok' && items.length >= limit && limit < SECTION_MAX_LIMIT

  return (
    <section ref={ref} aria-labelledby={headingId} className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        {section.persona_reason && (
          <p className="eyebrow">
            Pour vous · {section.persona_reason}
          </p>
        )}
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
                <StockCard stock={stock} fit={fits[stock.ticker]} />
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
