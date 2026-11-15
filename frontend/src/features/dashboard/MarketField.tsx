import { useNavigate } from 'react-router-dom'
import { useMarketSection, type MarketSectionInfo, type StockCardData } from '@/api/stocks'
import { Tile3D, greyTone, type SceneTile, type TileTone } from '@/components/three'
import { formatScore, formatSignedPercent } from '@/features/stocks/format'

/** Tiles from the front of the field to the back. */
const DEPTH = 3
/** A day change under this many percent is a flat session for the title: no colour. */
const FLAT_PCT = 0.05
/** A day change of this many percent (or more) gives the tallest tile. */
const FULL_SCALE_PCT = 8
const MAX_HEIGHT = 3
/** One title is named on the scene every this many columns. */
const NAMED_EVERY = 3

/**
 * One tile per title, best session on the left, worst on the right: it rises green with a gain and
 * hangs red under the waterline with a loss, as far as the move is large; a flat title stays grey.
 */
function marketTiles(unsorted: StockCardData[]): SceneTile[] {
  const stocks = [...unsorted].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))
  // The best and the worst title are named, and one title every few columns in between, so the slope
  // can be read; pointing names the others.
  const named = new Set(
    stocks
      .filter((_, index) => index === 0 || index === stocks.length - 1 || index % (DEPTH * NAMED_EVERY) === DEPTH - 1)
      .map((stock) => stock.ticker),
  )
  return stocks.map((stock, index) => {
    const change = stock.change_pct ?? 0
    const magnitude = Math.min(Math.abs(change), FULL_SCALE_PCT) / FULL_SCALE_PCT
    const height = Math.max(0.12, magnitude * MAX_HEIGHT) * (change < 0 ? -1 : 1)
    let tone: TileTone = greyTone(0.35)
    if (change > FLAT_PCT) tone = 'up'
    if (change < -FLAT_PCT) tone = 'down'
    const parts = [stock.ticker, stock.change_pct === null ? 'variation inconnue' : formatSignedPercent(stock.change_pct)]
    if (stock.score !== null) parts.push(`score ${formatScore(stock.score)}`)
    return {
      id: stock.ticker,
      x: Math.floor(index / DEPTH),
      z: index % DEPTH,
      h: height,
      tone,
      label: parts.join(' · '),
      tag: named.has(stock.ticker) ? `${stock.ticker}\n${formatSignedPercent(stock.change_pct ?? 0)}` : undefined,
      tagAt: change < 0 ? 'base' : 'top',
    }
  })
}

interface MarketFieldProps {
  /** The sections whose titles make the field (the profile's first ones). */
  sections: MarketSectionInfo[]
}

// 3D — « Le marché du jour » : the session at a glance, from its best title on the left to its worst on the
// right; a tile rises green with a gain and hangs red under the waterline with a loss, so the day's breadth
// is one shape. The biggest movers are named, pointing names the others, clicking opens the title's page.
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
        <h2 id="marche-du-jour" className="text-3xl leading-tight">
          Le marché <em>du jour</em>
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {stocks.length} titres de {titles} : {rising} en hausse, {falling} en baisse.
        </p>
      </div>
      <Tile3D
        tiles={marketTiles(stocks)}
        plane={{ y: 0 }}
        motion="wave"
        view="front"
        onSelect={(tile) => tile.id && navigate(`/titres/${encodeURIComponent(tile.id)}`)}
        label={`Le marché du jour en tuiles, de la meilleure séance à la pire : ${stocks.length} titres, ${rising} en hausse (tuiles vertes levées), ${falling} en baisse (tuiles rouges pendantes). Les mêmes titres sont listés dans les sections ci-dessous.`}
        className="h-52 sm:h-64"
      />
    </section>
  )
}
