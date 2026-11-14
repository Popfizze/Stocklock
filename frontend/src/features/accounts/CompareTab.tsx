import type { ReactNode } from 'react'
import { House, Scale, Table2 } from 'lucide-react'
import type { TaxProfile, TaxRules } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AssetLocationGrid } from './AssetLocationGrid'
import { BreakEvenChart } from './BreakEvenChart'
import { HomeDownPaymentBar } from './HomeDownPaymentBar'
import { IncomeTaxChart } from './IncomeTaxChart'
import { RulesComparison } from './RulesComparison'
import { SectionHeading } from './SectionHeading'
import { TfsaLimitsChart } from './TfsaLimitsChart'

interface CompareTabProps {
  rules: TaxRules
  /** The active profile's tax situation, for the personalised charts. */
  profile?: TaxProfile
}

/** « Comparer » : the rules side by side, then the charts that show why they matter. */
export function CompareTab({ rules, profile }: CompareTabProps) {
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="comparer-graphes">
        <SectionHeading
          id="comparer-graphes"
          icon={Scale}
          title="Ce qui fait vraiment la différence"
          lead={profile ? `Calculé aux taux de ${profile.name}.` : undefined}
        />
        <ChartCard
          title="REER ou CELI : tout dépend de votre taux à la retraite"
          description="Le REER ne gagne que si votre taux d'imposition baisse entre aujourd'hui et le retrait."
        >
          {profile ? <BreakEvenChart profile={profile} /> : <Skeleton className="h-64 w-full" />}
        </ChartCard>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="L'impôt hors abri dépend du type de revenu"
            description="Impôt sur 1 000 $ de revenu de placement, dans un compte non enregistré."
          >
            {profile ? <IncomeTaxChart profile={profile} rules={rules} /> : <Skeleton className="h-48 w-full" />}
          </ChartCard>
          <ChartCard title="Les plafonds du CELI depuis 2009" description="Les droits s'accumulent, même sans compte ouvert.">
            {profile ? <TfsaLimitsChart profile={profile} rules={rules} /> : <Skeleton className="h-56 w-full" />}
          </ChartCard>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="comparer-maison">
        <SectionHeading id="comparer-maison" icon={House} title="Première maison : deux comptes qui s'additionnent" />
        <Card>
          <CardContent className="pt-6">
            <HomeDownPaymentBar rules={rules} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="comparer-regles">
        <SectionHeading
          id="comparer-regles"
          icon={Table2}
          title="Les règles en détail"
          lead="Toutes les règles côte à côte, puis le meilleur compte pour chaque type de placement."
        />
        <RulesComparison rules={rules} />
        <AssetLocationGrid />
      </section>
    </div>
  )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
