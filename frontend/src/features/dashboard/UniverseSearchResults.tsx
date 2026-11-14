import { Link } from 'react-router-dom'
import { useUniverseSearch } from '@/api/stocks'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { displayName, formatInteger, marketErrorMessage } from '@/features/stocks/format'

const SEARCH_LIMIT = 30

const COUNTRY_LABELS: Record<string, string> = { US: 'États-Unis', CA: 'Canada' }

interface UniverseSearchResultsProps {
  /** The debounced, non-blank query. */
  query: string
}

/** The titles of the whole universe (SEC + TMX) matching `query`; a row opens the title's page. */
export function UniverseSearchResults({ query }: UniverseSearchResultsProps) {
  const { data, error, isPending, isPlaceholderData } = useUniverseSearch(query, SEARCH_LIMIT)
  const shown = query.trim()

  if (isPending) {
    return (
      <div role="status" aria-label="Recherche en cours" className="space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {marketErrorMessage(error)}
      </p>
    )
  }

  if (data.results.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        Aucun titre ne correspond à « {shown} ».
      </p>
    )
  }

  return (
    <section aria-label="Résultats de la recherche" className="space-y-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {data.total > data.results.length
          ? `${formatInteger(data.total)} titres correspondent à « ${data.query} » ; les ${data.results.length} premiers sont affichés.`
          : `${formatInteger(data.total)} ${data.total > 1 ? 'titres correspondent' : 'titre correspond'} à « ${data.query} ».`}
      </p>
      <ul
        className={cn(
          'divide-y divide-border border-y border-border transition-opacity',
          isPlaceholderData && 'opacity-60',
        )}
      >
        {data.results.map((match) => (
          <li key={match.ticker}>
            <Link
              to={`/titres/${encodeURIComponent(match.ticker)}`}
              className="flex items-center gap-4 px-2 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="w-24 shrink-0 truncate font-semibold">{match.ticker}</span>
              <span className="min-w-0 flex-1 truncate">{displayName(match.name)}</span>
              <span className="shrink-0 text-right text-sm text-muted-foreground">
                {match.exchange} · {COUNTRY_LABELS[match.country] ?? match.country}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
