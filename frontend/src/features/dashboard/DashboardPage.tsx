import { useState } from 'react'
import { Search } from 'lucide-react'
import { useMarketSections } from '@/api/stocks'
import { AppLayout, PageHeader } from '@/components/layout'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { marketErrorMessage } from '@/features/stocks/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { KpiStrip } from './KpiStrip'
import { MarketSectionBlock } from './MarketSectionBlock'
import { UniverseSearchResults } from './UniverseSearchResults'

/**
 * « Tableau de bord » : the live market as a grid of compact cards, in the
 * sections the API lists (most popular, best scores, gainers, losers,
 * Canada…), and a search over the whole SEC + TMX universe. A card or a
 * result opens the title's page.
 */
export function DashboardPage() {
  const { persona, personaId } = useActivePersona()
  // The profile's own sections come first, then the general ones.
  const { data: sections, error, isPending } = useMarketSections(personaId)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const searching = query.trim().length > 0

  return (
    <AppLayout>
      <div className="space-y-8">
        <PageHeader
          title="Tableau de bord"
          eyebrow={persona ? `Bonjour ${persona.name}` : undefined}
          description={
            persona
              ? `Le marché en direct, lu pour votre profil : tolérance au risque ${persona.risk_tolerance.toLowerCase()}, horizon ${persona.horizon.toLowerCase()}. Vos sections viennent en premier et chaque titre porte son verdict.`
              : 'Le marché en direct : cours différés, sections mises à jour pendant la séance.'
          }
        />

        <div className="relative max-w-xl">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un titre : nom ou symbole"
            aria-label="Rechercher un titre par nom ou symbole"
            className="h-11 pl-10"
          />
        </div>

        {searching ? (
          <UniverseSearchResults query={debouncedQuery.trim() ? debouncedQuery : query} />
        ) : isPending ? (
          <div role="status" aria-label="Chargement du tableau de bord" className="space-y-4">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {marketErrorMessage(error)}
          </p>
        ) : (
          <>
            <KpiStrip section={sections[0]} />
            <div className="space-y-12">
              {sections.map((section) => (
                <MarketSectionBlock key={section.id} section={section} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
