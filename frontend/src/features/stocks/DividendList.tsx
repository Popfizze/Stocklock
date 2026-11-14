import type { Dividend } from '@/api/stocks'
import { formatDividend, formatLongDate } from './format'

interface DividendListProps {
  dividends: Dividend[]
  currency: string
}

/** « Dividendes » : ex-dividend date and amount per share, most recent first. */
export function DividendList({ dividends, currency }: DividendListProps) {
  return (
    <section aria-labelledby="dividendes" className="space-y-3">
      <h3 id="dividendes" className="text-xl">
        Dividendes
      </h3>
      {dividends.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun dividende</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Date ex-dividende et montant par action</p>
          <ul className="divide-y divide-border border-y border-border text-sm">
            {dividends.map((dividend) => (
              <li key={dividend.ex_date} className="flex justify-between gap-4 py-2">
                <span>{formatLongDate(dividend.ex_date)}</span>
                <span className="font-medium tabular-nums">{formatDividend(dividend.value, currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
