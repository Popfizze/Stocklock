import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { fitByTicker, useFitBatch } from '@/api/persona'
import { SECTION_MAX_LIMIT, useMarketSection, type MarketSectionInfo } from '@/api/stocks'
import { useActivePersona } from '@/features/personas/activePersona'
import { Button } from '@/components/ui/button'
import { formatLongDate, marketErrorMessage } from '@/features/stocks/format'
import { STOCK_GRID, StockCard, StockCardSkeleton } from '@/features/stocks/StockCard'

const INITIAL_LIMIT = 24
const SKELETON_COUNT = 12

/** Cards shown before « Afficher plus » : two rows for a section of the profile, one for a general section. */
const PREVIEW = { persona: 12, general: 6 }

interface MarketSectionBlockProps {
  section: MarketSectionInfo
}

/**
 * One section of the Tableau de bord (« Les plus populaires », « Meilleurs
 * scores »…): its own request, so it loads, fails or stays empty on its own.
 */
export function MarketSectionBlock({ section }: MarketSectionBlockProps) {
  const [limit, setLimit] = useState(INITIAL_LIMIT)
  const [isOpen, setIsOpen] = useState(true)
  // The page stays short: a section opens on its first cards, and shows the rest on demand.
  const [expanded, setExpanded] = useState(false)
  const preview = section.persona_reason ? PREVIEW.persona : PREVIEW.general
  const { data, error, isPending, isFetching, refetch } = useMarketSection(section.id, limit)
  const headingId = `section-${section.id}`
  const contentId = `${headingId}-content`
  // Arriving on `/#section-<id>` (e.g. from a finished score run) brings the section into view.
  const { hash } = useLocation()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (hash !== `#${headingId}`) return
    setIsOpen(true)
    ref.current?.scrollIntoView({ block: 'start' })
  }, [hash, headingId])
  const items = data?.items ?? []
  // The cards' verdict for the active profile: one batch per section, quietly absent if it fails.
  const { personaId } = useActivePersona()
  const { data: fitBatch } = useFitBatch(personaId, items.map((item) => item.ticker))
  const fits = fitByTicker(fitBatch)
  // The server served as many cards as asked: there may be more.
  const canShowMore = data?.status === 'ok' && items.length >= limit && limit < SECTION_MAX_LIMIT
  const shown = expanded ? items : items.slice(0, preview)
  const hidden = items.length - shown.length

  return (
    <section ref={ref} aria-labelledby={headingId} className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} aria-label={section.title} className="text-3xl leading-tight">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpen((open) => !open)}
            className="group flex w-full items-center justify-between gap-4 text-left hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span>{section.title}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-6 shrink-0 transition-transform group-aria-expanded:rotate-180"
            />
            <span className="sr-only">{isOpen ? 'Masquer la section' : 'Afficher la section'}</span>
          </button>
        </h2>
        {isOpen && (
          <div id={contentId} className="space-y-4">
            {section.persona_reason && (
              <p className="eyebrow">
                Pour vous · {section.persona_reason}
              </p>
            )}
            <p className="max-w-3xl text-sm text-muted-foreground">{section.description}</p>
          </div>
        )}
      </div>

      {isOpen && (isPending ? (
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
            {shown.map((stock) => (
              <li key={stock.ticker}>
                <StockCard stock={stock} fit={fits[stock.ticker]} />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {hidden > 0 ? `${shown.length} titres affichés sur ${items.length}` : `${items.length} titre${items.length > 1 ? 's' : ''}`} · {section.source}
              {data.as_of ? ` · au ${formatLongDate(data.as_of)}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {expanded && items.length > preview && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                  Afficher moins
                </Button>
              )}
              {(hidden > 0 || canShowMore) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFetching}
                  // First the cards already loaded, then more from the server.
                  onClick={() => (hidden > 0 ? setExpanded(true) : setLimit((current) => Math.min(current * 2, SECTION_MAX_LIMIT)))}
                >
                  {isFetching ? 'Chargement…' : 'Afficher plus'}
                </Button>
              )}
            </div>
          </div>
        </>
      ))}
    </section>
  )
}
