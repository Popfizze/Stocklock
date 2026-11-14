import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ACCOUNT_IDS, type AccountId, useAccountProjection, useAccountRules } from '@/api/accounts'
import { AppLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActivePersona } from '@/features/personas/activePersona'
import { AccountsTab } from './AccountsTab'
import { ChooseTab } from './ChooseTab'
import { CompareTab } from './CompareTab'
import { EssentialsTab } from './EssentialsTab'
import { FaqTab } from './FaqTab'
import { projectionErrorMessage } from './format'
import { ProjectionSimulator } from './ProjectionSimulator'
import { DEFAULT_DRAFT, toProjectionRequest, type SimulatorDraft } from './simulatorForm'
import { StockAccountsTab } from './StockAccountsTab'

/** The sub-tabs, in learning order: understand, choose, compare, project, apply, ask. */
const TABS = [
  { value: 'essentiel', label: "L'essentiel" },
  { value: 'comptes', label: 'Les 4 comptes' },
  { value: 'choisir', label: 'Lequel choisir ?' },
  { value: 'comparer', label: 'Comparer' },
  { value: 'projection', label: 'Projection 15 ans' },
  { value: 'titre', label: 'Par titre' },
  { value: 'faq', label: 'Questions fréquentes' },
] as const

const DEFAULT_TICKER = 'JNJ'

/**
 * « Comptes » (step 3): the Canadian registered accounts explained, chosen,
 * compared and projected after tax for the active profile. The open sub-tab,
 * the account and the stock live in the URL (`?onglet=comptes&compte=REER`),
 * so any view can be linked.
 */
export function AccountsPage() {
  const { persona, personaId } = useActivePersona()
  const { data: rules, error, isPending } = useAccountRules()
  // The profile's generic projection (rates, room, ranking) feeds several
  // sub-tabs; it is the simulator's default request, so it is computed once.
  const { data: generic } = useAccountProjection(
    personaId ? toProjectionRequest(personaId, DEFAULT_DRAFT).request : null,
  )
  const [draft, setDraft] = useState<SimulatorDraft>(DEFAULT_DRAFT)
  const [params, setParams] = useSearchParams()

  const tabParam = params.get('onglet')
  const tab = TABS.some((candidate) => candidate.value === tabParam) ? (tabParam as string) : 'essentiel'
  const accountParam = params.get('compte')
  const account = ACCOUNT_IDS.find((id) => id === accountParam) ?? 'CELI'
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
            CELI, REER, CELIAPP ou compte non enregistré : comprendre chaque compte, savoir lequel remplir en premier,
            et voir ce qu'il resterait après impôt dans 15 ans{persona ? ` pour ${persona.name}` : ''}.
          </p>
          <p className="text-xs text-muted-foreground">
            Simulation éducative fondée sur les règles fiscales publiques{rules ? ` ${rules.year}` : ''} (fédéral et
            Québec), pas un conseil financier personnalisé. Le calcul pas à pas est dans l'onglet « 3. Fiscalité » du{' '}
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

            <TabsContent value="essentiel" className="pt-2">
              <EssentialsTab rules={rules} />
            </TabsContent>

            <TabsContent value="comptes" className="pt-2">
              <AccountsTab
                rules={rules}
                account={account}
                onAccountChange={(next: AccountId) => updateParams({ compte: next })}
              />
            </TabsContent>

            <TabsContent value="choisir" className="pt-2">
              <ChooseTab rules={rules} projection={generic} />
            </TabsContent>

            <TabsContent value="comparer" className="pt-2">
              <CompareTab rules={rules} profile={generic?.profile} />
            </TabsContent>

            <TabsContent value="projection" className="pt-2">
              {personaId && (
                <ProjectionSimulator personaId={personaId} draft={draft} onDraftChange={setDraft} />
              )}
            </TabsContent>

            <TabsContent value="titre" className="pt-2">
              <StockAccountsTab ticker={ticker} onTickerChange={(next) => updateParams({ titre: next })} />
            </TabsContent>

            <TabsContent value="faq" className="pt-2">
              <FaqTab rules={rules} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  )
}
