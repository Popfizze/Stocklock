import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAccountProjection, useAccountRules } from '@/api/accounts'
import { AppLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActivePersona } from '@/features/personas/activePersona'
import { AccountGuideCard } from './AccountGuideCard'
import { AssetLocationGrid } from './AssetLocationGrid'
import { accountGuides } from './content'
import { DecisionGuide } from './DecisionGuide'
import { DollarJourney } from './DollarJourney'
import { projectionErrorMessage } from './format'
import { ProjectionSimulator } from './ProjectionSimulator'
import { RulesComparison } from './RulesComparison'
import { DEFAULT_DRAFT, toProjectionRequest, type SimulatorDraft } from './simulatorForm'
import { StockAccountsTab } from './StockAccountsTab'

const TABS = [
  { value: 'comptes', label: 'Les comptes' },
  { value: 'comparer', label: 'Comparer' },
  { value: 'projection', label: 'Projection sur 15 ans' },
  { value: 'titre', label: 'Par titre' },
] as const

const DEFAULT_TICKER = 'JNJ'

/**
 * « Comptes » : the Canadian registered accounts explained (CELI, REER,
 * CELIAPP, non-registered), compared, and projected after tax over 15 years
 * for the active profile — generically or for one stock. The open tab and the
 * stock are kept in the URL (`?onglet=titre&titre=JNJ`) so a view can be linked.
 */
export function AccountsPage() {
  const { persona, personaId } = useActivePersona()
  const { data: rules, error, isPending } = useAccountRules()
  // The generic projection gives the profile's rates for the decision guide;
  // it is the simulator's default request, so the two share one computation.
  const { data: generic } = useAccountProjection(
    personaId ? toProjectionRequest(personaId, DEFAULT_DRAFT).request : null,
  )
  const [draft, setDraft] = useState<SimulatorDraft>(DEFAULT_DRAFT)
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('onglet')
  const tab = TABS.some((candidate) => candidate.value === tabParam) ? (tabParam as string) : 'comptes'
  const ticker = params.get('titre') ?? DEFAULT_TICKER

  const updateParams = (patch: Record<string, string>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(patch)) next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Étape 3 · Optimiser fiscalement</p>
          <h1 className="text-3xl font-bold tracking-tight">Comptes enregistrés au Canada</h1>
          <p className="max-w-3xl text-muted-foreground">
            CELI, REER, CELIAPP ou compte non enregistré : ce que chaque compte représente, ses règles,
            et ce qu'il resterait après impôt dans 15 ans
            {persona ? ` selon le profil de ${persona.name}` : ''}.
          </p>
          <p className="text-xs text-muted-foreground">
            Simulation éducative fondée sur les règles fiscales publiques
            {rules ? ` ${rules.year}` : ''} (fédéral et Québec). Pas un conseil financier personnalisé.
            Chaque étape du calcul est détaillée dans l'onglet « 3. Fiscalité » du{' '}
            <Link to="/labo" className="text-primary hover:underline">
              Labo
            </Link>
            .
          </p>
        </header>

        {isPending && (
          <div role="status" aria-label="Chargement des règles fiscales" className="space-y-3">
            <Skeleton className="h-10 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {projectionErrorMessage(error)}
          </p>
        )}

        {rules && (
          <Tabs value={tab} onValueChange={(value) => updateParams({ onglet: value })}>
            <TabsList className="max-w-full justify-start overflow-x-auto">
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="comptes" className="space-y-6">
              <DollarJourney />
              <div className="grid gap-4 xl:grid-cols-2">
                {accountGuides(rules).map((guide) => (
                  <AccountGuideCard key={guide.id} guide={guide} sources={rules.sources} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="comparer" className="space-y-6">
              <RulesComparison rules={rules} />
              <DecisionGuide rules={rules} profile={generic?.profile} />
              <AssetLocationGrid />
            </TabsContent>

            <TabsContent value="projection">
              {personaId && (
                <ProjectionSimulator personaId={personaId} draft={draft} onDraftChange={setDraft} />
              )}
            </TabsContent>

            <TabsContent value="titre">
              <StockAccountsTab ticker={ticker} onTickerChange={(next) => updateParams({ titre: next })} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  )
}
