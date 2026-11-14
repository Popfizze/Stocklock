import type { ReactNode } from 'react'
import { ACCOUNT_IDS, type AccountId } from '@/api/accounts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import { LevelToggle } from './LevelToggle'
import { LENSES, parseLens, type Lens, type Level } from './viewOptions'

interface ViewControlsProps {
  lens: Lens
  level: Level
  accounts: AccountId[]
  onLensChange: (lens: Lens) => void
  onLevelChange: (level: Level) => void
  onAccountsChange: (accounts: AccountId[]) => void
}

/** The three viewing filters: the way of looking, the level of detail, the accounts shown. */
export function ViewControls(props: ViewControlsProps) {
  const { lens, level, accounts, onLensChange, onLevelChange, onAccountsChange } = props
  return (
    <div className="space-y-4 border-y border-border bg-background/95 py-4 backdrop-blur lg:sticky lg:top-0 lg:z-20">
      <Control label="Voir par">
        <ToggleGroup
          type="single"
          value={lens}
          onValueChange={(value) => value && onLensChange(parseLens(value))}
          aria-label="Voir par"
          className="grid w-full grid-cols-2 rounded-2xl sm:inline-flex sm:w-fit sm:rounded-full"
        >
          {LENSES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} className="rounded-xl sm:rounded-full">
              <Icon aria-hidden="true" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Control>

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Control label="Niveau de détail">
          <LevelToggle level={level} onLevelChange={onLevelChange} />
        </Control>
        <Control label="Comptes affichés">
          <ToggleGroup
            type="multiple"
            variant="chips"
            value={accounts}
            // At least one account stays shown; the fixed order never follows the clicks.
            onValueChange={(value) => {
              const next = ACCOUNT_IDS.filter((account) => value.includes(account))
              if (next.length > 0) onAccountsChange(next)
            }}
            aria-label="Comptes affichés"
          >
            {ACCOUNT_IDS.map((account) => (
              <ToggleGroupItem key={account} value={account}>
                <AccountSwatch account={account} />
                {ACCOUNTS[account].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Control>
      </div>
    </div>
  )
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="eyebrow">{label}</p>
      {children}
    </div>
  )
}
