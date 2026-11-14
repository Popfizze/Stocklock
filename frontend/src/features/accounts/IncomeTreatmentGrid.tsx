import type { AccountId } from '@/api/accounts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { INCOME_TREATMENT } from './comparison'
import { ToneLegend } from './ToneLegend'
import { TONES } from './tones'

interface IncomeTreatmentGridProps {
  accounts: AccountId[]
}

/** How each kind of investment income is taxed in each account. */
export function IncomeTreatmentGrid({ accounts }: IncomeTreatmentGridProps) {
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">Ce que verse le placement</TableHead>
            {accounts.map((account) => (
              <TableHead key={account}>
                <AccountLabel account={account} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {INCOME_TREATMENT.map((row) => (
            <TableRow key={row.income}>
              <TableHead scope="row" className="whitespace-normal">
                <span className="block font-medium">{row.income}</span>
                <span className="block text-xs font-normal text-muted-foreground">Ex. : {row.example}</span>
              </TableHead>
              {accounts.map((account) => {
                const cell = row.cells[account]
                const { icon: Icon, iconClass, label } = TONES[cell.tone]
                return (
                  <TableCell key={account} className="align-top whitespace-normal">
                    <span className="flex items-start gap-1.5">
                      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
                      <span>
                        {cell.text}
                        <span className="sr-only"> ({label})</span>
                      </span>
                    </span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ToneLegend />
      <p className="text-xs text-muted-foreground">
        Retenue américaine : pour un titre américain détenu directement. Un FNB canadien qui détient des titres
        américains la subit même dans un REER.
      </p>
    </div>
  )
}
