import type { AccountOutcome } from '@/api/accounts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AccountLabel } from './AccountLabel'
import { formatMoney } from './format'

interface ProjectionTableProps {
  accounts: AccountOutcome[]
  years: number
}

const COLUMNS = [
  'Versé dans le compte',
  'Excédent en non enregistré',
  'Valeur avant impôt',
  'Impôt à la sortie',
  'Impôt payé en cours de route',
  'Retenue américaine perdue',
  'Après impôt',
  'Fourchette',
]

/** The table view of the projection: every number behind the charts. */
export function ProjectionTable({ accounts, years }: ProjectionTableProps) {
  return (
    <Table>
      <caption className="sr-only">Détail de la projection sur {years} ans, par compte</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Compte</TableHead>
          {COLUMNS.map((column) => (
            <TableHead key={column} className="text-right">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((row) => (
          <TableRow key={row.account}>
            <TableHead scope="row">
              <AccountLabel account={row.account} />
            </TableHead>
            {row.eligible ? (
              <>
                <MoneyCell value={row.deposits} />
                <MoneyCell value={row.side_deposits} />
                <MoneyCell value={row.gross_value} />
                <MoneyCell value={row.tax_at_exit} />
                <MoneyCell value={row.annual_tax_paid} />
                <MoneyCell value={row.withholding_lost} />
                <MoneyCell value={row.after_tax} strong />
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatMoney(row.after_tax_low)} à {formatMoney(row.after_tax_high)}
                </TableCell>
              </>
            ) : (
              <TableCell colSpan={COLUMNS.length} className="text-muted-foreground">
                Non admissible : {row.notes.join(' ')}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MoneyCell({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <TableCell className={strong ? 'text-right font-semibold tabular-nums' : 'text-right tabular-nums'}>
      {formatMoney(value)}
    </TableCell>
  )
}
