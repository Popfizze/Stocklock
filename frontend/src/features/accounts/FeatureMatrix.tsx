import { Check, CircleDashed, Minus, X } from 'lucide-react'
import type { AccountId } from '@/api/accounts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { FEATURES, type Has } from './comparison'
import { atLeast, type Level } from './viewOptions'

const MARKS: Record<Has, { icon: typeof Check; label: string; className: string }> = {
  yes: { icon: Check, label: 'Oui', className: 'text-foreground' },
  no: { icon: X, label: 'Non', className: 'text-muted-foreground' },
  partial: { icon: CircleDashed, label: 'En partie', className: 'text-foreground' },
  na: { icon: Minus, label: 'Sans objet', className: 'text-muted-foreground' },
}

interface FeatureMatrixProps {
  level: Level
  accounts: AccountId[]
}

/**
 * What each account allows, as yes / no / in part. A check states a property,
 * not a preference. Normale adds the short note behind each « en partie ».
 */
export function FeatureMatrix({ level, accounts }: FeatureMatrixProps) {
  const notes = atLeast(level, 'normale')
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">
            <span className="sr-only">Propriété</span>
          </TableHead>
          {accounts.map((account) => (
            <TableHead key={account}>
              <AccountLabel account={account} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {FEATURES.map((feature) => (
          <TableRow key={feature.label}>
            <TableHead scope="row" className="font-medium whitespace-normal">
              {feature.label}
            </TableHead>
            {accounts.map((account) => {
              const { has, note } = feature.values[account]
              const { icon: Icon, label, className } = MARKS[has]
              return (
                <TableCell key={account} className="align-top whitespace-normal">
                  <span className={cn('flex items-center gap-1.5', className)}>
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className={cn(has === 'yes' || has === 'partial' ? 'font-medium' : '')}>{label}</span>
                  </span>
                  {notes && note && <span className="block text-xs text-muted-foreground">{note}</span>}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
