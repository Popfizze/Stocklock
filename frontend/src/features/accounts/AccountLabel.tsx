import type { AccountId } from '@/api/accounts'
import { cn } from '@/lib/utils'
import { ACCOUNTS } from './accountMeta'

interface AccountSwatchProps {
  account: AccountId
  className?: string
}

/** The account's color mark. Decorative: the name next to it carries the meaning. */
export function AccountSwatch({ account, className }: AccountSwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-sm', ACCOUNTS[account].swatch, className)}
    />
  )
}

interface AccountLabelProps {
  account: AccountId
  className?: string
}

/** Swatch + short name: identity never rests on color alone. */
export function AccountLabel({ account, className }: AccountLabelProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <AccountSwatch account={account} />
      {ACCOUNTS[account].short}
    </span>
  )
}
