import { useAccountProjection } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import { AccountAdviceList } from './AccountAdviceList'
import { AssetSnapshot } from './AssetSnapshot'
import { projectionErrorMessage } from './format'
import { ProjectionResults } from './ProjectionResults'

interface StockAccountOptionsProps {
  /** A ticker of the starter kit, e.g. `JNJ` or `RY.TO`. */
  ticker: string
  /** Pre-tax amount set aside each year (default 7 000 $). */
  annualContribution?: number
  /** Projection horizon (default 15 years). */
  years?: number
}

/**
 * « Quel compte pour ce titre ? » — the account section of a stock's page:
 * the asset's income profile, each account's verdict for the active profile,
 * and the projection over 15 years. Drop it in the stock detail view as is.
 */
export function StockAccountOptions({ ticker, annualContribution = 7000, years = 15 }: StockAccountOptionsProps) {
  const { personaId } = useActivePersona()
  const request = personaId
    ? { persona_id: personaId, ticker, annual_contribution: annualContribution, years }
    : null
  const { data, error, isFetching } = useAccountProjection(request)
  const asset = data?.asset

  return (
    <section className="space-y-4" aria-labelledby={`comptes-${ticker}`}>
      <div>
        <h2 id={`comptes-${ticker}`} className="text-2xl font-semibold tracking-tight">
          Quel compte pour {asset ? `${asset.name} (${asset.ticker})` : ticker} ?
        </h2>
        {data && (
          <p className="text-muted-foreground">
            Selon le profil de {data.profile.name} : {data.profile.age} ans, horizon de{' '}
            {data.profile.horizon}, tolérance au risque {data.profile.risk_tolerance}.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive">
          {projectionErrorMessage(error)}
        </p>
      )}

      {!data && !error && (
        <div role="status" aria-label="Analyse des comptes" className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {data && asset && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">Ce que verse ce titre</CardTitle>
              <CardDescription>
                Le type de revenu décide du traitement fiscal dans chaque compte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssetSnapshot asset={asset} />
            </CardContent>
          </Card>
          <ProjectionResults projection={data} stale={isFetching}>
            <AccountAdviceList accounts={data.recommendations.accounts} />
          </ProjectionResults>
        </>
      )}
    </section>
  )
}
