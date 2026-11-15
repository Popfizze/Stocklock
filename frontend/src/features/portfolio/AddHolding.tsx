import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useUniverseSearch } from '@/api/stocks'
import { Input } from '@/components/ui/input'
import { displayName } from '@/features/stocks/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { TICKER_MIME } from './portfolioStore'

const RESULT_LIMIT = 8

interface AddHoldingProps {
  /** Symbols already held: they are not offered again. */
  held: string[]
  onAdd: (ticker: string) => void
  disabled?: boolean
}

/** Adds a title to the portfolio from a search over the whole universe (and the cryptocurrencies). */
export function AddHolding({ held, onAdd, disabled }: AddHoldingProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const { data, isFetching, isPlaceholderData } = useUniverseSearch(debounced, RESULT_LIMIT)

  const typed = query.trim().length > 0
  // The list is only shown once it answers what is typed now, not the previous query.
  const settled = debounced.trim() === query.trim() && !isPlaceholderData
  const matches = typed && settled
    ? [...(data?.results ?? []), ...(data?.crypto ?? [])].filter((match) => !held.includes(match.ticker))
    : []

  const handleAdd = (ticker: string) => {
    onAdd(ticker)
    setQuery('')
  }

  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ajouter un titre : nom ou symbole"
          aria-label="Ajouter un titre au portefeuille"
          className="pl-10"
        />
      </div>
      {disabled && (
        <p className="text-xs text-muted-foreground">Le portefeuille a atteint son maximum de titres.</p>
      )}
      {typed && matches.length > 0 && (
        <p className="text-xs text-muted-foreground">Cliquez un titre pour l'ajouter, ou glissez-le sur les blocs.</p>
      )}
      {typed && matches.length > 0 && (
        <ul aria-label="Titres à ajouter" className="max-w-md divide-y divide-border rounded-xl border border-border">
          {matches.slice(0, RESULT_LIMIT).map((match) => (
            // The row itself is what is dragged onto the blocks (a button does not start a drag in every browser).
            <li
              key={match.ticker}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(TICKER_MIME, match.ticker)
                event.dataTransfer.setData('text/plain', match.ticker)
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onDragEnd={(event) => {
                // Dropped on the blocks: the title is in, the search is done.
                if (event.dataTransfer.dropEffect === 'copy') setQuery('')
              }}
              // A click anywhere on the row adds it too; the button is the keyboard's and the screen reader's way.
              onClick={() => handleAdd(match.ticker)}
              className="flex cursor-grab items-center gap-3 py-1 pr-1.5 pl-3 text-sm transition-colors hover:bg-muted/60 active:cursor-grabbing"
            >
              <span className="w-20 shrink-0 truncate font-semibold">{match.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{displayName(match.name)}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  handleAdd(match.ticker)
                }}
                aria-label={`Ajouter ${match.ticker}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {typed && matches.length === 0 && data && !isFetching && debounced.trim() === query.trim() && (
        <p className="text-sm text-muted-foreground">Aucun titre à ajouter pour « {query.trim()} ».</p>
      )}
    </div>
  )
}
