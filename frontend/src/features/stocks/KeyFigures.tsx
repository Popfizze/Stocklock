import type { StockDetail } from '@/api/stocks'
import { Tile3D, type SceneTile, type TileTone } from '@/components/three'
import { ASSET_CLASS_LABELS } from '@/features/accounts/accountMeta'
import { formatInteger, formatPrice, formatRatio } from './format'

const NONE = '—'
/** Tiles between the 52-week low and high. */
const STEPS = 24
const VOLUME_HEIGHT = 2.4

/** The year's range as a strip, today's range raised in it, then today's volume beside its 3-month average. */
function yearTiles(stock: StockDetail): SceneTile[] {
  const { stats, currency } = stock
  const span = stats.high_52w - stats.low_52w
  if (span <= 0) return []
  const size = span / STEPS
  const stepOf = (price: number) => Math.min(STEPS - 1, Math.max(0, Math.floor((price - stats.low_52w) / size)))
  const last = stepOf(stock.last_close)
  const open = stepOf(stats.open)
  const tiles = Array.from({ length: STEPS }, (_, index): SceneTile => {
    const from = stats.low_52w + index * size
    let height = 0.25
    let tone: TileTone = 7
    let what = ''
    if (index >= stepOf(stats.low) && index <= stepOf(stats.high)) {
      height = 0.9
      tone = 5
      what = ' · dans la fourchette du jour'
    }
    if (index === open) {
      height = Math.max(height, 1.2)
      tone = 3
      what = ` · ouverture ${formatPrice(stats.open, currency)}`
    }
    if (index === last) {
      height = 2
      tone = 1
      what = ` · dernier cours ${formatPrice(stock.last_close, currency)}`
    }
    return { x: index, z: 0, h: height, tone, label: `${formatPrice(from, currency)} à ${formatPrice(from + size, currency)}${what}` }
  })
  const peak = Math.max(stats.volume, stats.avg_volume_3m ?? 0, 1)
  const column = (x: number, volume: number, tone: TileTone, label: string): SceneTile => ({
    x,
    z: 0,
    w: 1.5,
    d: 1.5,
    h: Math.max(0.1, (volume / peak) * VOLUME_HEIGHT),
    tone,
    label: `${label} · ${formatInteger(volume)}`,
  })
  tiles.push(column(STEPS + 2, stats.volume, 2, 'Volume de la séance'))
  if (stats.avg_volume_3m !== null) tiles.push(column(STEPS + 4, stats.avg_volume_3m, 6, 'Volume moyen sur 3 mois'))
  return tiles
}

interface KeyFiguresProps {
  stock: StockDetail
}

// 3D — where the price stands in its year: the 52-week range as a strip of tiles from the low to the
// high, today's range raised in it and the last price as the tall ink tile; beside it, today's volume
// against its three-month average. Every figure stays one click away.
export function KeyFigures({ stock }: KeyFiguresProps) {
  const { stats, currency } = stock
  const price = (value: number) => formatPrice(value, currency)
  const figures: Array<[string, string]> = [
    ['Ouverture', price(stats.open)],
    ['Haut du jour', price(stats.high)],
    ['Bas du jour', price(stats.low)],
    ['Volume', formatInteger(stats.volume)],
    ['Volume moyen (3 mois)', stats.avg_volume_3m === null ? NONE : formatInteger(stats.avg_volume_3m)],
    ['Haut 52 semaines', price(stats.high_52w)],
    ['Bas 52 semaines', price(stats.low_52w)],
    [
      'Rendement du dividende (12 mois)',
      stats.dividend_yield_ttm === null ? NONE : formatRatio(stats.dividend_yield_ttm),
    ],
    ['Devise', currency],
    ['Catégorie', ASSET_CLASS_LABELS[stock.asset_class] ?? stock.asset_class],
    ['Secteur', stock.sector],
  ]
  const tiles = yearTiles(stock)

  return (
    <section aria-labelledby="chiffres-cles" className="space-y-3">
      <h3 id="chiffres-cles" className="text-xl">
        Chiffres clés
      </h3>
      {tiles.length > 0 && (
        <>
          <Tile3D
            tiles={tiles}
            view="front"
            label={`Le dernier cours, ${price(stock.last_close)}, dans sa fourchette de 52 semaines, de ${price(stats.low_52w)} à ${price(stats.high_52w)} ; fourchette du jour de ${price(stats.low)} à ${price(stats.high)}, ouverture à ${price(stats.open)}. Volume de la séance : ${formatInteger(stats.volume)}${stats.avg_volume_3m === null ? '' : `, contre ${formatInteger(stats.avg_volume_3m)} en moyenne sur 3 mois`}.`}
            className="h-40 sm:h-48"
          />
          <p className="text-xs text-muted-foreground">
            Du plus bas au plus haut de 52 semaines : la tuile haute est le dernier cours, les tuiles levées la
            fourchette du jour. À droite, le volume de la séance et sa moyenne de 3 mois.
          </p>
        </>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Tous les chiffres</summary>
        <dl className="mt-3 divide-y divide-border border-y border-border">
          {figures.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}
