import type { AccountFacts } from '@/api/accounts'
import { Badge } from '@/components/ui/badge'
import { AccountLabel } from './AccountLabel'
import { ProsCons } from './ProsCons'

interface AccountFactsListProps {
  accounts: AccountFacts[]
}

/** Each account in the projection: where its amount stands, then its pros and cons for this profile and asset. */
export function AccountFactsList({ accounts }: AccountFactsListProps) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background" aria-label="Compte par compte">
      {accounts.map((item) => (
        <li key={item.account} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 className="font-semibold">
              <AccountLabel account={item.account} />
            </h4>
            <Badge variant={item.standing === 'highest' ? 'secondary' : 'outline'}>{item.standing_label}</Badge>
            <span className="text-sm text-muted-foreground">{item.summary}</span>
          </div>
          {item.standing !== 'ineligible' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ProsCons title="Avantages" items={item.pros} positive />
              <ProsCons title="Inconvénients" items={item.cons} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
