import { ArrowDown } from 'lucide-react'
import type { TaxProfile, TaxRules } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney, formatPercent } from './format'

interface DecisionGuideProps {
  rules: TaxRules
  /** The active profile's tax situation, to highlight its path; absent while loading. */
  profile?: TaxProfile
}

interface Branch {
  answer: string
  outcome: string
}

/** Flowchart: which account to fill first, with the active profile's path highlighted. */
export function DecisionGuide({ rules, profile }: DecisionGuideProps) {
  const ratesFavourRrsp = profile ? profile.rate_now > profile.rate_retirement : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Par quel compte commencer ?</CardTitle>
        <CardDescription>
          Une règle de pouce, pas un conseil : la projection sur 15 ans chiffre ensuite chaque
          option.
          {profile && ` Le chemin de ${profile.name} est surligné.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Question
          number={1}
          text="Prévoyez-vous acheter une première propriété ?"
          why={profile ? `${profile.name} : ${profile.fhsa_reason}` : undefined}
          yes={{
            answer: 'Oui',
            outcome: `CELIAPP d'abord : ${formatMoney(rules.fhsa.annual_limit)} par an, déductibles et retirés sans impôt.`,
          }}
          no={{ answer: 'Non', outcome: 'Passez à la question 2.' }}
          chosen={profile ? profile.fhsa_eligible : undefined}
        />
        <Connector />
        <Question
          number={2}
          text="Votre taux d'imposition actuel dépasse-t-il celui prévu à la retraite ?"
          why={
            profile
              ? `${profile.name} : ${formatPercent(profile.rate_now)} aujourd'hui, environ ${formatPercent(profile.rate_retirement)} à la retraite.`
              : undefined
          }
          yes={{ answer: 'Oui', outcome: 'REER : la déduction vaut plus que l’impôt au retrait.' }}
          no={{ answer: 'Non ou incertain', outcome: 'CELI : aucun impôt au retrait, quoi qu’il arrive.' }}
          chosen={ratesFavourRrsp}
        />
        <Connector />
        <div className="rounded-lg border border-border p-4">
          <p className="font-medium">3. Plafonds atteints ?</p>
          <p className="text-sm text-muted-foreground">
            Complétez avec l'autre compte enregistré, puis le compte non enregistré. Placez-y en
            priorité les actions canadiennes à dividendes, qui y profitent d'un crédit d'impôt.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Connector() {
  return <ArrowDown aria-hidden="true" className="mx-auto size-4 text-muted-foreground" />
}

interface QuestionProps {
  number: number
  text: string
  why?: string
  yes: Branch
  no: Branch
  /** true: the profile answers yes; false: no; undefined: unknown. */
  chosen?: boolean
}

function Question({ number, text, why, yes, no, chosen }: QuestionProps) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-medium">
        {number}. {text}
      </p>
      {why && <p className="text-sm text-muted-foreground">{why}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BranchBox branch={yes} active={chosen === true} />
        <BranchBox branch={no} active={chosen === false} />
      </div>
    </div>
  )
}

function BranchBox({ branch, active }: { branch: Branch; active: boolean }) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        active ? 'border-primary bg-primary/10' : 'border-border',
      )}
    >
      <p className="font-semibold">
        {branch.answer}
        {active && <span className="ml-2 text-xs font-medium text-primary">Votre réponse</span>}
      </p>
      <p className="text-muted-foreground">{branch.outcome}</p>
    </div>
  )
}
