import { ArrowDown } from 'lucide-react'
import type { TaxProfile } from '@/api/accounts'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { BreakEvenChart } from './BreakEvenChart'
import { formatPercent } from './format'
import { atLeast, type Level } from './viewOptions'

type Branch = 'lower' | 'equal' | 'higher'

const BRANCHES: Array<{ id: Branch; when: string; result: string; account?: 'REER' | 'CELI' }> = [
  { id: 'lower', when: 'Plus bas', result: 'laisse plus après impôt', account: 'REER' },
  { id: 'equal', when: 'Égal', result: 'Même montant dans les deux comptes' },
  { id: 'higher', when: 'Plus haut', result: 'laisse plus après impôt', account: 'CELI' },
]

function branchOf(profile: TaxProfile): Branch {
  const gap = profile.rate_retirement - profile.rate_now
  if (Math.abs(gap) < 0.0005) return 'equal'
  return gap < 0 ? 'lower' : 'higher'
}

interface RateFlowProps {
  level: Level
  /** The active profile; its branch is marked from the Normale level. */
  profile?: TaxProfile
}

/**
 * Flowchart of the REER–CELI arithmetic: for the same pre-tax effort, the
 * result depends only on the tax rate at withdrawal compared with today's.
 */
export function RateFlow({ level, profile }: RateFlowProps) {
  const showProfile = atLeast(level, 'normale') && profile
  const active = profile ? branchOf(profile) : null

  return (
    <figure className="space-y-3" aria-label="REER ou CELI : ce qui fait l'écart">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-muted/40 px-4 py-3 text-center">
        <p className="text-sm font-medium">Le taux d'imposition au retrait, comparé à celui d'aujourd'hui, est…</p>
        {showProfile && (
          <p className="mt-1 text-xs text-muted-foreground">
            {profile.name} : {formatPercent(profile.rate_now)} aujourd'hui, environ{' '}
            {formatPercent(profile.rate_retirement)} prévu à la retraite (valeurs de démonstration).
          </p>
        )}
      </div>
      <ArrowDown aria-hidden="true" className="mx-auto size-4 text-muted-foreground" />
      <ol className="grid gap-3 sm:grid-cols-3">
        {BRANCHES.map((branch) => {
          const mine = showProfile && branch.id === active
          return (
            <li
              key={branch.id}
              className={cn('rounded-lg border px-4 py-3 text-sm', mine ? 'border-foreground/50 bg-secondary' : 'border-border')}
            >
              <p className="font-semibold">{branch.when}</p>
              <p className="text-muted-foreground">
                {branch.account ? (
                  <>
                    <AccountLabel account={branch.account} className="font-medium text-foreground" /> {branch.result}
                  </>
                ) : (
                  branch.result
                )}
              </p>
              {mine && <p className="mt-1 text-xs font-medium">Cas de {profile.name}</p>}
            </li>
          )
        })}
      </ol>
      {atLeast(level, 'complexe') &&
        (profile ? <BreakEvenChart profile={profile} /> : <Skeleton className="h-64 w-full" />)}
    </figure>
  )
}
