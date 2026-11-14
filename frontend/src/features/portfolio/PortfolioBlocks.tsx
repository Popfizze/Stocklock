import type { AnalyzedHolding, PortfolioHolding } from '@/api/persona'
import { Tile3D, type SceneTile, type TileTone } from '@/components/three'
import { formatShare, totalWeight } from './portfolioStore'

/** Height of a block that weighs exactly the profile's maximum position: the ceiling's height. */
const CEILING = 2
const COLUMNS = 6
const SECTOR_TONES: TileTone[] = [2, 4, 5, 3, 6, 7]

interface PortfolioBlocksProps {
  /** The holdings as typed or dragged: the blocks follow them at once, before the analysis is back. */
  holdings: PortfolioHolding[]
  /** What the analysis knows of each holding (sector, verdict), by symbol. */
  analyzed: Record<string, AnalyzedHolding>
  /** The profile's maximum position; unknown until the first analysis. */
  maxPosition: number | null
  onWeightChange: (ticker: string, weight: number) => void
}

// 3D — the portfolio's shape, and the handle on it: one block per title, as tall as its weight and shaded by
// sector, under a translucent ceiling at the profile's maximum position; what breaks the limit sticks out.
// Dragging a block up or down changes its weight, and the others rebalance at once.
export function PortfolioBlocks({ holdings, analyzed, maxPosition, onWeightChange }: PortfolioBlocksProps) {
  const total = totalWeight(holdings)
  if (holdings.length === 0 || total <= 0) return null
  const limit = maxPosition ?? 0.2
  const sectors = [...new Set(holdings.map((holding) => analyzed[holding.ticker]?.sector ?? 'Autre'))]
  const over: string[] = []

  const tiles: SceneTile[] = holdings.map((holding, index) => {
    const share = Math.max(0, holding.weight) / total
    const detail = analyzed[holding.ticker]
    const sector = detail?.sector ?? 'Autre'
    const aboveLimit = maxPosition !== null && share > maxPosition + 0.0005
    if (aboveLimit) over.push(holding.ticker)
    const verdict = detail?.fit.verdict
    return {
      id: holding.ticker,
      x: (index % COLUMNS) * 1.25,
      z: Math.floor(index / COLUMNS) * 1.25,
      h: Math.max(0.06, (share / limit) * CEILING),
      // One shade per sector; a title out of profile or over the limit takes the alert colour.
      tone:
        aboveLimit || verdict === 'hors_profil'
          ? 'alert'
          : verdict === 'a_surveiller'
            ? 'warn'
            : SECTOR_TONES[sectors.indexOf(sector) % SECTOR_TONES.length],
      label: `${holding.ticker} · ${formatShare(share)}${detail?.sector ? ` · ${detail.sector}` : ''}`,
    }
  })

  // A drag of one ceiling's height is worth the profile's maximum position.
  const handleAdjust = (tile: SceneTile, delta: number) => {
    const holding = holdings.find((candidate) => candidate.ticker === tile.id)
    if (!holding) return
    const next = Math.max(0, holding.weight + (delta / CEILING) * limit * total)
    onWeightChange(holding.ticker, Math.round(next * 10) / 10)
  }

  return (
    <section aria-label="Le portefeuille en blocs" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="eyebrow">
          Le portefeuille en blocs{maxPosition !== null && ` · plafond à ${formatShare(maxPosition)} par titre`}
        </p>
        <p className="text-sm text-muted-foreground">
          Glissez un bloc vers le haut ou le bas pour changer son poids ; les autres se rééquilibrent.
        </p>
      </div>
      <Tile3D
        tiles={tiles}
        plane={maxPosition !== null ? { y: CEILING } : null}
        onAdjust={handleAdjust}
        label={`Le portefeuille en blocs : ${holdings.length} titres, hauteur selon le poids${
          maxPosition !== null ? `, sous un plafond à ${formatShare(maxPosition)}` : ''
        }. ${over.length === 0 ? 'Aucun titre ne dépasse le plafond.' : `Au-dessus du plafond : ${over.join(', ')}.`} Les poids exacts se lisent et se modifient au clavier dans le tableau des titres.`}
        className="h-72 touch-none"
      />
    </section>
  )
}
