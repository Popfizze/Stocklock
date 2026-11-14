import type { Dividend } from '@/api/stocks'
import { Tile3D, type SceneTile } from '@/components/three'
import { formatDividend, formatLongDate } from './format'

const HEIGHT = 2.4
const SPACING = 1.3

interface DividendListProps {
  dividends: Dividend[]
  currency: string
}

// 3D — the dividends as a timeline: one column per payment, oldest on the left, as tall as the amount
// per share, so a growing, flat or cut dividend is seen at once. The dated list stays one click away.
export function DividendList({ dividends, currency }: DividendListProps) {
  const amount = (value: number) => formatDividend(value, currency)
  // The API lists the most recent first; time runs left to right.
  const timeline = [...dividends].reverse()
  const peak = Math.max(...timeline.map((dividend) => dividend.value), 0)
  const tiles = timeline.map(
    (dividend, index): SceneTile => ({
      x: index * SPACING,
      z: 0,
      h: Math.max(0.12, peak > 0 ? (dividend.value / peak) * HEIGHT : 0.12),
      tone: index === timeline.length - 1 ? 1 : 4,
      label: `${formatLongDate(dividend.ex_date)} · ${amount(dividend.value)} par action`,
    }),
  )
  const latest = dividends[0]
  const oldest = timeline[0]

  return (
    <section aria-labelledby="dividendes" className="space-y-3">
      <h3 id="dividendes" className="text-xl">
        Dividendes
      </h3>
      {dividends.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun dividende</p>
      ) : (
        <>
          <Tile3D
            tiles={tiles}
            view="front"
            label={`${dividends.length} dividende${dividends.length > 1 ? 's' : ''} en colonnes, du ${formatLongDate(oldest.ex_date)} au ${formatLongDate(latest.ex_date)}, hauteur selon le montant par action ; le dernier : ${amount(latest.value)}. La liste datée est sous la scène.`}
            className="h-40 sm:h-48"
          />
          <p className="text-xs text-muted-foreground">
            Une colonne par versement, du plus ancien au plus récent (en noir), haute selon le montant par action.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Dates et montants</summary>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {dividends.map((dividend) => (
                <li key={dividend.ex_date} className="flex justify-between gap-4 py-2">
                  <span>{formatLongDate(dividend.ex_date)}</span>
                  <span className="font-medium tabular-nums">{amount(dividend.value)}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
