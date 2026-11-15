import { useId, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useUniverseSearch } from '@/api/stocks'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

interface TickerTilesProps {
  /** Names the set: « Titres du groupe ». */
  label: string
  tickers: string[]
  /** Most tickers the set accepts. */
  cap: number
  onChange: (tickers: string[]) => void
}

/** A set of titles as tiles: press one to remove it; search the universe (stocks, ETFs, crypto) to add more. */
export function TickerTiles({ label, tickers, cap, onChange }: TickerTilesProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query)
  const search = useUniverseSearch(debounced, 8)
  const full = tickers.length >= cap
  // While the answer on screen is still the previous query's, nothing is offered (Enter would add the wrong title).
  const settled = debounced.trim() === query.trim() && !search.isPlaceholderData && !search.isFetching
  const matches = query.trim() && settled
    ? [...(search.data?.results ?? []), ...(search.data?.crypto ?? [])].filter((match) => !tickers.includes(match.ticker))
    : []
  const add = (ticker: string) => {
    if (!full && !tickers.includes(ticker)) onChange([...tickers, ticker])
  }

  return (
    <div className="space-y-3">
      {tickers.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          {tickers.map((ticker) => (
            <li key={ticker}>
              <button
                type="button"
                aria-label={`Retirer ${ticker}`}
                onClick={() => onChange(tickers.filter((candidate) => candidate !== ticker))}
                className="tile-in group flex h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground outline-none hover:bg-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {ticker}
                <X aria-hidden="true" className="size-3.5 opacity-60 group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor={id} className="sr-only">
          Chercher un titre à ajouter à : {label}
        </label>
        <Input
          id={id}
          type="search"
          value={query}
          disabled={full}
          placeholder={full ? `Plafond atteint (${cap} titres)` : 'Chercher un titre, un FNB, une crypto…'}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the best match.
            if (event.key === 'Enter' && matches[0]) {
              event.preventDefault()
              add(matches[0].ticker)
              setQuery('')
            }
          }}
          className="pl-10"
        />
      </div>

      {matches.length > 0 && (
        <ul aria-label="Titres trouvés" className="flex flex-wrap gap-2">
          {matches.map((match) => (
            <li key={match.ticker}>
              <button
                type="button"
                disabled={full}
                aria-label={`Ajouter ${match.ticker}, ${match.name}`}
                onClick={() => add(match.ticker)}
                className={cn(
                  'flex h-11 max-w-64 items-center gap-2 rounded-xl border border-border px-3.5 text-left text-sm outline-none hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
                )}
              >
                <Plus aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="font-medium">{match.ticker}</span>
                <span className="truncate text-muted-foreground">{match.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== '' && !settled && (
        <p role="status" className="text-sm text-muted-foreground">
          Recherche…
        </p>
      )}
      {query.trim() !== '' && settled && search.isSuccess && matches.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun titre de l'univers ne correspond à « {query.trim()} ».</p>
      )}
    </div>
  )
}
