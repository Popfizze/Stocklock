import type { AccountAdvice, Verdict } from '@/api/accounts'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { ProsCons } from './ProsCons'

const BADGES: Record<Verdict, 'default' | 'secondary' | 'outline'> = {
  best: 'default',
  close: 'secondary',
  behind: 'outline',
  ineligible: 'outline',
}

interface AccountAdviceListProps {
  accounts: AccountAdvice[]
}

/** One card per account: verdict, after-tax value, and the pros and cons for this profile and asset. */
export function AccountAdviceList({ accounts }: AccountAdviceListProps) {
  return (
    <ol className="grid gap-4 md:grid-cols-2" aria-label="Options de compte">
      {accounts.map((advice) => (
        <li
          key={advice.account}
          className={cn(
            'space-y-3 rounded-lg border p-4',
            advice.verdict === 'best' ? 'border-primary' : 'border-border',
            advice.verdict === 'ineligible' && 'bg-muted/50',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">
              {advice.rank !== null && <span className="sr-only">Rang {advice.rank} : </span>}
              <AccountLabel account={advice.account} />
            </h4>
            <Badge variant={BADGES[advice.verdict]}>{advice.verdict_label}</Badge>
          </div>
          <p className="text-sm font-medium">{advice.summary}</p>
          {advice.verdict !== 'ineligible' && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ProsCons title="Pour" items={advice.pros} positive />
              <ProsCons title="Contre" items={advice.cons} />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
