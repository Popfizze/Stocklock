import { ACCOUNT_IDS, type TaxRules } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AccountLabel } from './AccountLabel'
import { comparisonRows } from './comparison'

interface RulesComparisonProps {
  rules: TaxRules
}

/** The four accounts' rules side by side. */
export function RulesComparison({ rules }: RulesComparisonProps) {
  const rows = comparisonRows(rules)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Les règles côte à côte</CardTitle>
        <CardDescription>
          Règles fiscales {rules.year}, fédérales et québécoises, pour un résident du Québec.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Critère</TableHead>
              {ACCOUNT_IDS.map((account) => (
                <TableHead key={account}>
                  <AccountLabel account={account} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.criterion}>
                <TableHead scope="row" className="font-medium whitespace-normal">
                  {row.criterion}
                </TableHead>
                {ACCOUNT_IDS.map((account) => (
                  <TableCell key={account} className="whitespace-normal">
                    {row.values[account]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
