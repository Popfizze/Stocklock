import type { StockDetail } from '@/api/stocks'
import { ASSET_CLASS_LABELS } from '@/features/accounts/accountMeta'
import { formatInteger, formatPrice, formatRatio } from './format'
import { TileStrip } from './TileStrip'

const NONE = '—'

interface KeyFiguresProps {
  stock: StockDetail
}

/** « Chiffres clés » : the last session, 3-month and 52-week figures, dividend yield and identity. */
export function KeyFigures({ stock }: KeyFiguresProps) {
  const { stats, currency } = stock
  const figures: Array<[string, string]> = [
    ['Ouverture', formatPrice(stats.open, currency)],
    ['Haut du jour', formatPrice(stats.high, currency)],
    ['Bas du jour', formatPrice(stats.low, currency)],
    ['Volume', formatInteger(stats.volume)],
    ['Volume moyen (3 mois)', stats.avg_volume_3m === null ? NONE : formatInteger(stats.avg_volume_3m)],
    ['Haut 52 semaines', formatPrice(stats.high_52w, currency)],
    ['Bas 52 semaines', formatPrice(stats.low_52w, currency)],
    [
      'Rendement du dividende (12 mois)',
      stats.dividend_yield_ttm === null ? NONE : formatRatio(stats.dividend_yield_ttm),
    ],
    ['Devise', currency],
    ['Catégorie', ASSET_CLASS_LABELS[stock.asset_class] ?? stock.asset_class],
    ['Secteur', stock.sector],
  ]
  const span = stats.high_52w - stats.low_52w
  // Where the last price sits between the year's low (0) and high (1).
  const position = span > 0 ? Math.min(Math.max((stock.last_close - stats.low_52w) / span, 0), 1) : null

  return (
    <section aria-labelledby="chiffres-cles" className="space-y-3">
      <h3 id="chiffres-cles" className="text-xl">
        Chiffres clés
      </h3>
      {position !== null && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Le dernier cours dans sa fourchette de 52 semaines
          </p>
          {/* The low, the high and the last price are in the list below and the header. */}
          <TileStrip value={position} mode="spot" tiles={24} />
        </div>
      )}
      <dl className="divide-y divide-border border-y border-border text-sm">
        {figures.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
