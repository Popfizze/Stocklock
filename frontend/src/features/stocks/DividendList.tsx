import type { Dividend } from '@/api/stocks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDividend, formatLongDate } from './format'

interface DividendListProps {
  dividends: Dividend[]
  currency: string
}

/** « Dividendes » : ex-dividend date and amount per share, most recent first. */
export function DividendList({ dividends, currency }: DividendListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dividendes</CardTitle>
      </CardHeader>
      <CardContent>
        {dividends.length === 0 ? (
          <p className="text-muted-foreground">Aucun dividende</p>
        ) : (
          <ul className="divide-y divide-border">
            {dividends.map((dividend) => (
              <li key={dividend.ex_date} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <span>{formatLongDate(dividend.ex_date)}</span>
                <span className="font-medium tabular-nums">
                  {formatDividend(dividend.value, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
