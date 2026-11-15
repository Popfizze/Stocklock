import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { usePortfolioAnalysis, type AnalyzedHolding, type PortfolioHolding } from '@/api/persona'
import type { Persona } from '@/api/personas'
import { AppLayout, PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { marketErrorMessage } from '@/features/stocks/format'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import { AddHolding } from './AddHolding'
import { DiversificationView } from './DiversificationView'
import { HoldingsList } from './HoldingsList'
import { ScoreMixer } from './ScoreMixer'
import {
  explainChange,
  isDefaultSetup,
  readScoreSetup,
  storeScoreSetup,
  toScoringChoice,
  type ScoreSetup,
} from './scoreWeights'
import { PortfolioBlocks } from './PortfolioBlocks'
import { PortfolioFindings, PortfolioSuggestionList } from './PortfolioInsights'
import {
  MAX_HOLDINGS,
  clearPortfolio,
  examplePortfolio,
  readPortfolio,
  storePortfolio,
  totalWeight,
} from './portfolioStore'

/** Weight a newly added title starts with (same unit as the example portfolios: percent). */
const NEW_WEIGHT = 5

/** « Mon portefeuille » of the active profile; switching profile opens that profile's own holdings. */
export function PortfolioPage() {
  const { persona, personaId } = useActivePersona()
  return (
    <AppLayout>
      {personaId && <PortfolioView key={personaId} personaId={personaId} persona={persona} />}
    </AppLayout>
  )
}

interface PortfolioViewProps {
  personaId: string
  persona: Persona | undefined
}

function PortfolioView({ personaId, persona }: PortfolioViewProps) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(() => readPortfolio(personaId))
  // The analysis waits for the changes to pause; the list itself follows every step.
  const settled = useDebouncedValue(holdings, 400)
  // The user's own score: six weights and the indicators switched off, kept per profile.
  const [setup, setSetup] = useState<ScoreSetup>(() => readScoreSetup(personaId))
  const settledSetup = useDebouncedValue(setup, 300)
  const { data, error, isPending, isFetching, isPlaceholderData } = usePortfolioAnalysis(
    personaId,
    settled,
    toScoringChoice(settledSetup),
  )
  const handleSetup = (next: ScoreSetup) => {
    setSetup(next)
    storeScoreSetup(personaId, next)
  }

  const update = (next: PortfolioHolding[]) => {
    setHoldings(next)
    storePortfolio(personaId, next)
  }
  const handleAdd = (ticker: string) => {
    if (holdings.some((holding) => holding.ticker === ticker) || holdings.length >= MAX_HOLDINGS) return
    update([...holdings, { ticker, weight: NEW_WEIGHT }])
  }
  const handleWeight = (ticker: string, weight: number) =>
    update(
      holdings.map((holding) =>
        holding.ticker === ticker ? { ...holding, weight: Number.isFinite(weight) ? weight : 0 } : holding,
      ),
    )
  const handleReset = () => {
    clearPortfolio(personaId)
    setHoldings(examplePortfolio(personaId))
  }

  const analyzed: Record<string, AnalyzedHolding> = Object.fromEntries(
    (data?.holdings ?? []).map((holding) => [holding.ticker, holding]),
  )
  const hasWeights = settled.some((holding) => holding.weight > 0)

  return (
    <div className="space-y-10">
      <PageHeader
        title="Mon"
        accent="portefeuille"
        eyebrow={persona ? `Profil de ${persona.name}` : undefined}
        description="Vos titres en blocs : glissez-les pour changer leur poids. L'analyse dit si le portefeuille est diversifié, si chaque titre convient à votre profil, et propose des pistes. Tout est gardé dans ce navigateur."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw aria-hidden="true" /> Revenir à l'exemple
          </Button>
        }
      />

      <section aria-labelledby="titres-portefeuille" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="titres-portefeuille" className="text-3xl leading-tight">
            Titres ({holdings.length})
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            Total des poids saisis : {totalWeight(holdings).toLocaleString('fr-CA', { maximumFractionDigits: 2 })} — les
            parts sont ramenées à 100 %.
          </p>
        </div>
        {/* Above the blocks: a result is dragged down onto them, both in view. */}
        <AddHolding
          held={holdings.map((holding) => holding.ticker)}
          onAdd={handleAdd}
          disabled={holdings.length >= MAX_HOLDINGS}
        />
        {holdings.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Aucun titre : ajoutez-en un par la recherche, ou revenez à l'exemple du profil.
          </p>
        ) : (
          <>
            <PortfolioBlocks
              holdings={holdings}
              analyzed={analyzed}
              maxPosition={data?.diversification.max_position ?? null}
              suggestions={data?.suggestions.items ?? []}
              ranked={!isDefaultSetup(setup)}
              onWeightChange={handleWeight}
              onRemove={(ticker) => update(holdings.filter((holding) => holding.ticker !== ticker))}
              onAdd={handleAdd}
            />
            {/* The same holdings as a list of tile sliders: the keyboard and screen-reader way to read and set them. */}
            <details className="rounded-3xl border border-border px-5 py-4">
              <summary className="cursor-pointer text-sm font-medium">
                Liste des titres : lire et régler les poids au clavier
              </summary>
              <div className="pt-4">
                <HoldingsList
                  holdings={holdings}
                  analyzed={analyzed}
                  maxPosition={data?.diversification.max_position ?? null}
                  onWeightChange={handleWeight}
                  onRemove={(ticker) => update(holdings.filter((holding) => holding.ticker !== ticker))}
                />
              </div>
            </details>
          </>
        )}
        {data && data.missing.length > 0 && (
          <p className="text-sm text-warning">
            Sans données chez Yahoo Finance, laissés hors de l'analyse : {data.missing.join(', ')}.
          </p>
        )}
      </section>

      {!hasWeights ? null : isPending ? (
        <div role="status" aria-label="Analyse du portefeuille en cours" className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="text-destructive">
          Analyse du portefeuille indisponible : {marketErrorMessage(error)}
        </p>
      ) : (
        <div
          aria-busy={isFetching}
          className={cn('space-y-10 transition-opacity', isPlaceholderData && 'opacity-60')}
        >
          <ScoreMixer
            setup={setup}
            settled={settledSetup}
            onChange={handleSetup}
            explanation={explainChange(data, settledSetup)}
            scored={data.holdings.filter((holding) => holding.score !== null).map((holding) => holding.ticker)}
          />
          <PortfolioFindings findings={data.findings} />
          <DiversificationView diversification={data.diversification} />
          <PortfolioSuggestionList suggestions={data.suggestions} onAdd={handleAdd} />
        </div>
      )}
    </div>
  )
}
