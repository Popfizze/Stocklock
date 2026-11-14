import { useNavigate } from 'react-router-dom'
import { useMarketSection, type MarketSectionInfo, type StockCardData } from '@/api/stocks'
import { Tile3D, greyTone, type SceneTile } from '@/components/three'
import { formatScore, formatSignedPercent } from '@/features/stocks/format'

const COLUMNS = 16
/** A day change of this many percent (or more) gives the tallest tile. */
const FULL_SCALE_PCT = 8
const MAX_HEIGHT = 3

/** One tile per title: height = day change (down moves hang under the plane), shade = score. */
function marketTiles(stocks: StockCardData[]): SceneTile[] {
  return stocks.map((stock, index) => {
    const change = stock.change_pct ?? 0
    const magnitude = Math.min(Math.abs(change), FULL_SCALE_PCT) / FULL_SCALE_PCT
    const height = Math.max(0.12, magnitude * MAX_HEIGHT) * (change < 0 ? -1 : 1)
    const parts = [stock.ticker, stock.change_pct === null ? 'variation inconnue' : formatSignedPercent(stock.change_pct)]
    if (stock.score !== null) parts.push(`score ${formatScore(stock.score)}`)
    return {
      id: stock.ticker,
      x: index % COLUMNS,
      z: Math.floor(index / COLUMNS),
      h: height,
      // Shade = score; while a title has none, the size of its move shades it instead.
      tone: greyTone(stock.score !== null ? stock.score / 100 : 0.12 + magnitude * 0.7),
      label: parts.join(' · '),
    }
  })
}

interface MarketFieldProps {
  /** The sections whose titles make the field (the profile's first ones). */
  sections: MarketSectionInfo[]
}

// 3D — « Le marché du jour » : the session at a glance; each title is a tile that rises with a gain and
// hangs with a loss, darker when its score is high. Pointing at one names it, clicking opens its page.
export function MarketField({ sections }: MarketFieldProps) {
  const navigate = useNavigate()
  // Same requests as the sections' own blocks: answered once.
  const first = useMarketSection(sections[0].id)
  const second = useMarketSection((sections[1] ?? sections[0]).id)
  const seen = new Set<string>()
  const stocks = [...(first.data?.items ?? []), ...(sections[1] ? (second.data?.items ?? []) : [])].filter((stock) => {
    if (seen.has(stock.ticker)) return false
    seen.add(stock.ticker)
    return true
  })
  if (stocks.length === 0) return null

  const rising = stocks.filter((stock) => (stock.change_pct ?? 0) > 0).length
  const falling = stocks.filter((stock) => (stock.change_pct ?? 0) < 0).length
  const titles = sections.slice(0, 2).map((section) => `« ${section.title} »`).join(' et ')

  return (
    <section aria-labelledby="marche-du-jour" className="fade-up space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="marche-du-jour" className="eyebrow">
          Le marché du jour
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {stocks.length} titres de {titles} : {rising} en hausse, {falling} en baisse.
        </p>
      </div>
      <Tile3D
        tiles={marketTiles(stocks)}
        motion="wave"
        view="front"
        onSelect={(tile) => tile.id && navigate(`/titres/${encodeURIComponent(tile.id)}`)}
        label={`Le marché du jour en tuiles : ${stocks.length} titres, ${rising} en hausse (tuiles levées), ${falling} en baisse (tuiles pendantes). Les mêmes titres sont listés dans les sections ci-dessous.`}
        className="h-52 sm:h-64"
      />
    </section>
  )
}
