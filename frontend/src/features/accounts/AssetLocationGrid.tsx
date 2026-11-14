import { CircleCheck, CircleMinus, CircleX } from 'lucide-react'
import { ACCOUNT_IDS } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { ASSET_LOCATION, FIT_LABELS, type Fit } from './comparison'

const FIT_ICONS: Record<Fit, { icon: typeof CircleCheck; className: string }> = {
  good: { icon: CircleCheck, className: 'text-success' },
  ok: { icon: CircleMinus, className: 'text-muted-foreground' },
  poor: { icon: CircleX, className: 'text-warning' },
}

/** Asset location: which kind of income is best sheltered in which account. */
export function AssetLocationGrid() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Quel actif dans quel compte ?</CardTitle>
        <CardDescription>
          Chaque type de revenu est imposé différemment : le bon compte dépend de ce que le titre
          verse.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type d'actif</TableHead>
              {ACCOUNT_IDS.map((account) => (
                <TableHead key={account}>
                  <AccountLabel account={account} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ASSET_LOCATION.map((row) => (
              <TableRow key={row.asset}>
                <TableHead scope="row" className="whitespace-normal">
                  <span className="block font-medium">{row.asset}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{row.example}</span>
                </TableHead>
                {ACCOUNT_IDS.map((account) => {
                  const cell = row.cells[account]
                  const { icon: Icon, className } = FIT_ICONS[cell.fit]
                  return (
                    <TableCell key={account} className="align-top whitespace-normal">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} />
                        {FIT_LABELS[cell.fit]}
                      </span>
                      <span className="block text-xs text-muted-foreground">{cell.why}</span>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Retenue américaine : pour un titre américain détenu directement. Un FNB canadien qui détient
          des titres américains la subit même dans un REER.
        </p>
      </CardContent>
    </Card>
  )
}
