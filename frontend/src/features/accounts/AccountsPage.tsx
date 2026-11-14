import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAccountProjection, useAccountRules } from '@/api/accounts'
import { AppLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { CompareView } from './CompareView'
import { FaqSection } from './FaqSection'
import { projectionErrorMessage } from './format'
import { GoalsView } from './GoalsView'
import { JourneyView } from './JourneyView'
import { NumbersView } from './NumbersView'
import { DEFAULT_DRAFT, toProjectionRequest, type SimulatorDraft } from './simulatorForm'
import { ViewControls } from './ViewControls'
import { formatAccounts, parseAccounts, parseLens, parseLevel } from './viewOptions'

/**
 * « Comptes » (step 3): the Canadian registered accounts, seen four ways
 * (the path of the money, side by side, by goal, in figures) at three levels
 * of detail, for the accounts picked. Facts and rules only, no advice. The
 * view lives in the URL (`?vue=comparer&niveau=normale&comptes=CELI,REER`).
 */
export function AccountsPage() {
  const { personaId } = useActivePersona()
  const { data: rules, error, isPending } = useAccountRules()
  // The profile's default projection gives its rates and eligibility to every view;
  // it is also « En chiffres »'s first request, so it is computed once.
  const { data: generic } = useAccountProjection(
    personaId ? toProjectionRequest(personaId, DEFAULT_DRAFT).request : null,
  )
  const [draft, setDraft] = useState<SimulatorDraft>(DEFAULT_DRAFT)
  const [params, setParams] = useSearchParams()

  const lens = parseLens(params.get('vue'))
  const level = parseLevel(params.get('niveau'))
  const accounts = parseAccounts(params.get('comptes'))
  const ticker = params.get('titre')
  const profile = generic?.profile

  /** Sets (or, with null, removes) URL parameters; the defaults stay out of the URL. */
  const update = (patch: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="fade-up space-y-3">
          <p className="eyebrow">Étape 3 · Optimiser fiscalement</p>
          <h1 className="text-4xl leading-none sm:text-5xl lg:text-6xl">
            Comptes enregistrés <em>au Canada</em>
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            CELI, REER, CELIAPP et compte non enregistré : comment chacun fonctionne, ce qu'il permet et ce qu'il
            resterait après impôt.
          </p>
          <p className="text-xs text-muted-foreground">
            Des faits et des règles fiscales publiques (fédéral et Québec), sans recommandation : aucun conseil
            financier. Le calcul pas à pas est dans le{' '}
            <Link to="/labo" className="link">
              Labo
            </Link>
            .
          </p>
        </header>

        <ViewControls
          lens={lens}
          level={level}
          accounts={accounts}
          onLensChange={(next) => update({ vue: next === 'parcours' ? null : next })}
          onLevelChange={(next) => update({ niveau: next === 'simple' ? null : next })}
          onAccountsChange={(next) => update({ comptes: formatAccounts(next) })}
        />

        {isPending && (
          <div role="status" aria-label="Chargement des règles fiscales" className="space-y-3">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {projectionErrorMessage(error)}
          </p>
        )}

        {rules && (
          <div className="space-y-12 pt-2">
            {lens === 'parcours' && <JourneyView rules={rules} level={level} accounts={accounts} profile={profile} />}
            {lens === 'comparer' && <CompareView rules={rules} level={level} accounts={accounts} profile={profile} />}
            {lens === 'objectifs' && <GoalsView rules={rules} level={level} accounts={accounts} />}
            {lens === 'chiffres' && personaId && (
              <NumbersView
                personaId={personaId}
                level={level}
                accounts={accounts}
                draft={draft}
                onDraftChange={setDraft}
                ticker={ticker}
                onTickerChange={(next) => update({ titre: next })}
              />
            )}
            <FaqSection rules={rules} accounts={accounts} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
