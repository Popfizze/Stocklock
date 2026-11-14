import { useState } from 'react'
import { useAccountProjection } from '@/api/accounts'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { projectionErrorMessage } from './format'
import { LevelToggle } from './LevelToggle'
import { ProjectionResults } from './ProjectionResults'
import type { Level } from './viewOptions'

interface StockAccountOptionsProps {
  /** A ticker of the starter kit, e.g. `JNJ` or `RY.TO`. */
  ticker: string
  /** Pre-tax amount set aside each year (default 7 000 $). */
  annualContribution?: number
  /** Projection horizon (default 15 years). */
  years?: number
}

/**
 * « L'impôt selon le compte » — the account section of a stock's page: the
 * stock projected after tax in each account for the active profile, from the
 * one-sentence result (Simple) to every figure (Complexe). Facts, no pick.
 */
export function StockAccountOptions({ ticker, annualContribution = 7000, years = 15 }: StockAccountOptionsProps) {
  const { personaId } = useActivePersona()
  const [level, setLevel] = useState<Level>('simple')
  const request = personaId
    ? { persona_id: personaId, ticker, annual_contribution: annualContribution, years }
    : null
  const { data, error, isFetching } = useAccountProjection(request)

  return (
    <section className="space-y-5" aria-labelledby={`comptes-${ticker}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id={`comptes-${ticker}`} className="text-2xl font-semibold tracking-tight">
            L'impôt selon le compte
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {data?.asset ? `${data.asset.name} (${data.asset.ticker})` : ticker} placé dans un CELI, un REER, un
            CELIAPP ou un compte non enregistré
            {data ? `, pour le profil de ${data.profile.name} (${data.profile.age} ans, horizon de ${data.profile.horizon})` : ''}.
          </p>
        </div>
        <LevelToggle level={level} onLevelChange={setLevel} hideHint />
      </div>

      {error && (
        <p role="alert" className="text-destructive">
          {projectionErrorMessage(error)}
        </p>
      )}

      {!data && !error && (
        <div role="status" aria-label="Analyse des comptes" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && <ProjectionResults projection={data} level={level} stale={isFetching} />}
    </section>
  )
}
