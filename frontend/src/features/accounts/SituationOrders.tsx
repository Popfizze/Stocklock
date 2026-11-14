import type { TaxProfile, TaxRules } from '@/api/accounts'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { matchingSituation, situations } from './learn'

interface SituationOrdersProps {
  rules: TaxRules
  profile?: TaxProfile
}

/** The usual order of accounts in four typical situations; the profile's one stands out. */
export function SituationOrders({ rules, profile }: SituationOrdersProps) {
  const match = profile ? matchingSituation(profile) : null
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {situations(rules).map(({ id, icon: Icon, title, who, order }) => {
        const active = id === match
        return (
          <li
            key={id}
            className={cn('rounded-xl border bg-card p-4', active ? 'border-primary ring-1 ring-primary' : 'border-border')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
              <h3 className="font-semibold">{title}</h3>
              {active && profile && <Badge>Situation de {profile.name}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{who}</p>
            <ol className="mt-3 space-y-2">
              {order.map((step, index) => (
                <li key={step.account} className="flex items-start gap-2 text-sm">
                  <span className="w-5 shrink-0 font-semibold text-muted-foreground">{index + 1}.</span>
                  <span>
                    <AccountLabel account={step.account} className="font-medium" />
                    <span className="block text-muted-foreground">{step.why}</span>
                  </span>
                </li>
              ))}
            </ol>
          </li>
        )
      })}
    </ul>
  )
}
