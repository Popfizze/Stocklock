import type { AccountId, TaxRules } from '@/api/accounts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AccountLabel } from './AccountLabel'
import { ruleRows } from './comparison'

interface RulesComparisonProps {
  rules: TaxRules
  accounts: AccountId[]
}

/** The rules with their figures, side by side (Complexe level). */
export function RulesComparison({ rules, accounts }: RulesComparisonProps) {
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">Règle</TableHead>
            {accounts.map((account) => (
              <TableHead key={account}>
                <AccountLabel account={account} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ruleRows(rules).map((row) => (
            <TableRow key={row.criterion}>
              <TableHead scope="row" className="font-medium whitespace-normal">
                {row.criterion}
              </TableHead>
              {accounts.map((account) => (
                <TableCell key={account} className="align-top whitespace-normal">
                  {row.values[account]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Règles fiscales {rules.year}, fédérales et québécoises, pour un résident du Québec.
      </p>
    </div>
  )
}
