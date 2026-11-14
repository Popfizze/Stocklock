import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useUniverseSearch } from '@/api/stocks'
import { Input } from '@/components/ui/input'
import { displayName } from '@/features/stocks/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

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
  const { data, isFetching } = useUniverseSearch(debounced, RESULT_LIMIT)

  const typed = query.trim().length > 0
  const matches = typed
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
        <ul aria-label="Titres à ajouter" className="max-w-md divide-y divide-border rounded-xl border border-border">
          {matches.slice(0, RESULT_LIMIT).map((match) => (
            <li key={match.ticker}>
              <button
                type="button"
                onClick={() => handleAdd(match.ticker)}
                aria-label={`Ajouter ${match.ticker}`}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="w-20 shrink-0 truncate font-semibold">{match.ticker}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{displayName(match.name)}</span>
                <Plus aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
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
