import { useState } from 'react'
import { useStockMoves, type MovesPeriod, type StockMovesResult } from '@/api/moves'
import type { Persona } from '@/api/personas'
import { Button } from '@/components/ui/button'
import { useActivePersona } from '@/features/personas/activePersona'
import { cn } from '@/lib/utils'
import { BiasNarrative } from './BiasNarrative'
import { KeyEvents } from './KeyEvents'
import { MoveList } from './MoveList'
import { MovesChart } from './MovesChart'
import { MovesSources } from './MovesSources'
import { METHODS, PERIODS, signedRatio } from './movesMeta'
import { TREND_TEXT, formatLongDate, trendOf } from './format'
import { StockSection } from './StockSection'

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow truncate">{label}</dt>
      <dd className={cn('display mt-1.5 text-3xl', tone)}>{value}</dd>
    </div>
  )
}

const ratioOrDash = (value: number | null) => (value === null ? '—' : signedRatio(value))
const toneOf = (value: number | null) => (value === null ? undefined : TREND_TEXT[trendOf(value)])

function MovesResult({ result, persona }: { result: StockMovesResult; persona: Persona }) {
  const benchmark = result.benchmark ?? 'l’indice'
  const { returns } = result
  return (
    <div className="space-y-6" aria-live="polite">
      <div className="space-y-2">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
          <Figure label={result.ticker} value={ratioOrDash(returns.asset)} tone={toneOf(returns.asset)} />
          <Figure label={`Indice ${benchmark}`} value={ratioOrDash(returns.benchmark)} tone={toneOf(returns.benchmark)} />
          <Figure label="Écart avec l’indice" value={ratioOrDash(returns.abnormal)} tone={toneOf(returns.abnormal)} />
          <Figure label="Confiance" value={result.confidence ?? '—'} />
        </dl>
        <p className="text-xs text-muted-foreground">
          Du {formatLongDate(result.window.start)} au {formatLongDate(result.window.end)} · écart calculé par{' '}
          {METHODS[result.method ?? ''] ?? 'comparaison avec l’indice'} · données du jeu du datathon, pas des cours en direct.
        </p>
      </div>

      {result.series.length > 1 && <MovesChart result={result} />}

      <section className="space-y-2">
        <h3 className="text-xl">Ce qu’on peut en dire</h3>
        <BiasNarrative answer={result.analysis.answer} />
        {!result.analysis.governance.passed && (
          <p role="alert" className="text-sm text-destructive">
            Certains contrôles de l’analyse ont échoué. Consultez les limites avant de l’interpréter.
          </p>
        )}
      </section>

      {result.profile_flags.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-xl">Écart avec le profil de {persona.name}</h3>
          <ul className="list-disc pl-5 text-sm">
            {result.profile_flags.map((flag) => <li key={flag}>{flag}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-xl">Mouvements marquants</h3>
        <p className="text-sm text-muted-foreground">
          Séances où le titre s’écarte de plus de 2 σ de ce que prévoit {benchmark}, chacune avec ses faits datés
          (entreprise, direction, décisions politiques et de taux) et son explication : fait daté, hypothèse ou aucun
          événement. Une coïncidence dans le temps n’est pas une preuve.
        </p>
        <MoveList moves={result.moves} benchmark={benchmark} />
        <KeyEvents events={result.key_events} benchmark={benchmark} />
      </section>

      <MovesSources result={result} />
    </div>
  )
}

function MovesSection({ ticker, persona }: { ticker: string; persona: Persona }) {
  const [period, setPeriod] = useState<MovesPeriod>('1y')
  const [started, setStarted] = useState(false)
  const query = useStockMoves(ticker, persona.id, period, started)
  const periodName = PERIODS.find((candidate) => candidate.value === period)?.name ?? period

  return (
    <StockSection
      id="comprendre"
      eyebrow="Étape 2 · Événements politiques et économiques"
      title="Comprendre"
      accent="les fluctuations"
      description={
        <>
          Pourquoi le titre a bougé : {ticker} comparé à son indice sur {periodName}, et les événements datés
          (décisions politiques et de taux, dépôts SEC, changements de direction, articles) qui précèdent ses plus
          grands écarts.
        </>
      }
    >

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Période analysée" className="flex flex-wrap gap-1">
          {PERIODS.map((candidate) => (
            <Button
              key={candidate.value}
              type="button"
              size="sm"
              variant={candidate.value === period ? 'secondary' : 'ghost'}
              aria-pressed={candidate.value === period}
              disabled={query.isFetching}
              onClick={() => setPeriod(candidate.value)}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
        {!started && (
          <Button type="button" onClick={() => setStarted(true)}>Expliquer les mouvements</Button>
        )}
      </div>

      {query.isFetching && (
        <div role="status" className="rounded-2xl border border-border p-5 text-sm">
          <p className="font-medium">Analyse en cours…</p>
          <p className="mt-1 text-muted-foreground">Elle peut prendre une demi-minute :</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Comparaison du titre à son indice et repérage des séances marquantes</li>
            <li>Recherche des décisions de taux, des décrets de la présidence américaine, des dépôts SEC et des pics de couverture médiatique</li>
            <li>Lecture des articles et communiqués, résumés et datés par Claude Haiku</li>
            <li>Jugement de chaque lien et rédaction de l’explication</li>
          </ul>
        </div>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Impossible d’expliquer les mouvements.{' '}
          {query.error.status === 0 ? 'Vérifiez la connexion au serveur.' : query.error.message}
        </p>
      )}
      {query.data && !query.isFetching && <MovesResult result={query.data} persona={persona} />}
    </StockSection>
  )
}

/** Step 2 on a stock page, for the active profile: why the title moved over a period. */
export function StockMoves({ ticker }: { ticker: string }) {
  const { personaId, persona } = useActivePersona()
  if (!personaId || !persona) return null
  return <MovesSection key={`${ticker}:${personaId}`} ticker={ticker} persona={persona} />
}
