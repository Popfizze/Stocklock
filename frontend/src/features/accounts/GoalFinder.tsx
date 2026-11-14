import { ArrowRight } from 'lucide-react'
import { AccountLabel } from './AccountLabel'
import { GOALS } from './learn'

/** « Mon objectif → le bon compte » : a goal, the account(s) for it, and why. */
export function GoalFinder() {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {GOALS.map(({ icon: Icon, goal, accounts, why }) => (
        <li key={goal} className="grid gap-2 p-4 sm:grid-cols-3 sm:items-center">
          <span className="flex items-center gap-3 font-medium">
            <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            {goal}
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
            {accounts.map((account, index) => (
              <span key={account} className="inline-flex items-center gap-2 font-semibold">
                {index > 0 && <span className="font-normal text-muted-foreground">puis</span>}
                <AccountLabel account={account} />
              </span>
            ))}
          </span>
          <span className="text-sm text-muted-foreground">{why}</span>
        </li>
      ))}
    </ul>
  )
}
