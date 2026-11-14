import type { StockDetail } from '@/api/stocks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ASSET_CLASS_LABELS } from '@/features/accounts/accountMeta'
import { formatInteger, formatPrice, formatRatio } from './format'

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chiffres clés</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {figures.map(([label, value]) => (
            <div key={label} className="space-y-0.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
