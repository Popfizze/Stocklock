import { ArrowDown, ChevronRight } from 'lucide-react'
import type { AccountId, TaxProfile, TaxRules } from '@/api/accounts'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { FLOW_STEPS, journey, type FlowNode } from './comparison'
import { ToneLegend } from './ToneLegend'
import { TONES } from './tones'
import { atLeast, type Level } from './viewOptions'

/** Label column, then the four steps of the flow. */
const GRID = 'lg:grid lg:grid-cols-[8.5rem_repeat(4,minmax(0,1fr))] lg:gap-x-6'

interface FlowLanesProps {
  rules: TaxRules
  level: Level
  accounts: AccountId[]
  /** The active profile, to say which accounts it can open; absent while loading. */
  profile?: TaxProfile
}

/**
 * Flowchart: one lane per account, from who can open it to the withdrawal.
 * Simple shows a few words per step, Normale adds the explanation, Complexe the figures.
 */
export function FlowLanes({ rules, level, accounts, profile }: FlowLanesProps) {
  const lanes = journey(rules)
  return (
    <figure className="space-y-4" aria-label="Le parcours de l'argent dans chaque compte">
      <div aria-hidden="true" className={cn('hidden', GRID)}>
        <span />
        {FLOW_STEPS.map(({ id, label, icon: Icon }) => (
          <span key={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="size-4" />
            {label}
          </span>
        ))}
      </div>

      <ol className="space-y-4 lg:space-y-3" aria-label="Un parcours par compte">
        {accounts.map((account) => (
          <li
            key={account}
            className={cn('space-y-5 rounded-xl border border-border p-4 lg:items-stretch lg:space-y-0 lg:border-0 lg:p-0', GRID)}
          >
            <div className="flex flex-col justify-center gap-0.5">
              <AccountLabel account={account} className="font-semibold" />
              {profile && <Access account={account} profile={profile} rules={rules} />}
            </div>
            {lanes[account].map((node, index) => (
              <Step key={FLOW_STEPS[index].id} node={node} index={index} level={level} />
            ))}
          </li>
        ))}
      </ol>

      <ToneLegend />
    </figure>
  )
}

function Step({ node, index, level }: { node: FlowNode; index: number; level: Level }) {
  const { icon: Icon, iconClass, box, label } = TONES[node.tone]
  return (
    <div className={cn('relative flex gap-2.5 rounded-lg border px-3 py-2.5', box)}>
      {index > 0 && (
        <>
          <ChevronRight aria-hidden="true" className="absolute top-1/2 -left-5 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block" />
          <ArrowDown aria-hidden="true" className="absolute -top-4.5 left-4 size-3.5 text-muted-foreground lg:hidden" />
        </>
      )}
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground lg:sr-only">{FLOW_STEPS[index].label}</p>
        <p className="text-sm font-medium">
          {node.label}
          <span className="sr-only"> ({label})</span>
        </p>
        {atLeast(level, 'normale') && <p className="text-xs text-muted-foreground">{node.detail}</p>}
        {atLeast(level, 'complexe') && node.figure && (
          <p className="mt-1 text-xs font-medium tabular-nums">{node.figure}</p>
        )}
      </div>
    </div>
  )
}

function canOpen(account: AccountId, profile: TaxProfile, rules: TaxRules): boolean {
  if (account === 'CELIAPP') return profile.fhsa_eligible
  if (account === 'CELI') return profile.age >= rules.tfsa.eligibility_age
  if (account === 'REER') return profile.income > 0
  return true
}

/** « Amira : admissible » — a fact about the active profile, not a suggestion. */
function Access({ account, profile, rules }: { account: AccountId; profile: TaxProfile; rules: TaxRules }) {
  const open = canOpen(account, profile, rules)
  return (
    <span className={cn('text-xs', open ? 'text-muted-foreground' : 'text-warning')}>
      {profile.name} : {open ? 'admissible' : 'non admissible'}
    </span>
  )
}
