import type { ReactNode } from 'react'
import type { AccountId, TaxProfile, TaxRules } from '@/api/accounts'
import { Skeleton } from '@/components/ui/skeleton'
import { FeatureMatrix } from './FeatureMatrix'
import { IncomeTaxChart } from './IncomeTaxChart'
import { IncomeTreatmentGrid } from './IncomeTreatmentGrid'
import { RateFlow } from './RateFlow'
import { RulesComparison } from './RulesComparison'
import { SectionHeading } from './SectionHeading'
import { TfsaLimitsChart } from './TfsaLimitsChart'
import { atLeast, type Level } from './viewOptions'

interface CompareViewProps {
  rules: TaxRules
  level: Level
  accounts: AccountId[]
  profile?: TaxProfile
}

/** « Côte à côte » : what each account allows, the REER–CELI arithmetic, then income types and figures. */
export function CompareView({ rules, level, accounts, profile }: CompareViewProps) {
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="comparer-permet">
        <SectionHeading
          id="comparer-permet"
          title="Ce que chaque compte permet"
          lead="Oui, non ou en partie : chaque ligne décrit une règle, pas une préférence."
        />
        <FeatureMatrix level={level} accounts={accounts} />
      </section>

      <section className="space-y-4" aria-labelledby="comparer-ecart">
        <SectionHeading
          id="comparer-ecart"
          title="REER ou CELI : ce qui fait l'écart"
          lead="Pour le même montant avant impôt, le résultat dépend d'une seule comparaison."
        />
        <RateFlow level={level} profile={profile} />
      </section>

      {atLeast(level, 'normale') && (
        <section className="space-y-4" aria-labelledby="comparer-revenus">
          <SectionHeading
            id="comparer-revenus"
            title="Selon ce que verse le placement"
            lead="Intérêts, dividendes et gains ne sont pas imposés de la même façon d'un compte à l'autre."
          />
          <IncomeTreatmentGrid accounts={accounts} />
          {atLeast(level, 'complexe') && (
            <ChartBlock title="Impôt sur 1 000 $ de revenu, hors compte enregistré">
              {profile ? <IncomeTaxChart profile={profile} rules={rules} /> : <Skeleton className="h-48 w-full" />}
            </ChartBlock>
          )}
        </section>
      )}

      {atLeast(level, 'complexe') && (
        <section className="space-y-4" aria-labelledby="comparer-chiffres">
          <SectionHeading id="comparer-chiffres" title="Les règles en chiffres" />
          <RulesComparison rules={rules} accounts={accounts} />
          <ChartBlock title="Plafonds annuels du CELI depuis 2009">
            {profile ? <TfsaLimitsChart profile={profile} rules={rules} /> : <Skeleton className="h-56 w-full" />}
          </ChartBlock>
        </section>
      )}
    </div>
  )
}

function ChartBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4 sm:p-5">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  )
}
