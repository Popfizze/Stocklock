import { useState } from 'react'
import type { AnalyzedHolding, PortfolioHolding, PortfolioSuggestion } from '@/api/persona'
import { Tile3D, type SceneTile, type TileTone } from '@/components/three'
import { cn } from '@/lib/utils'
import { TICKER_MIME, formatShare, totalWeight } from './portfolioStore'

/** Height of a block that weighs exactly the profile's maximum position: the ceiling's height. */
const CEILING = 2
const COLUMNS = 6
const GAP = 1.25
const SECTOR_TONES: TileTone[] = [2, 4, 5, 3, 6, 7]
/** Suggestions wait at the edge of the scene under this id prefix. */
const SUGGESTION = '+'
/** A suggestion dragged at least this far (in pixels) is taken into the portfolio. */
const DRAG_IN_PX = 24
const SCORE = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })

interface PortfolioBlocksProps {
  /** The holdings as typed or dragged: the blocks follow them at once, before the analysis is back. */
  holdings: PortfolioHolding[]
  /** What the analysis knows of each holding (sector, verdict, score), by symbol. */
  analyzed: Record<string, AnalyzedHolding>
  /** The profile's maximum position; unknown until the first analysis. */
  maxPosition: number | null
  /** Titles waiting at the edge of the scene, to drag (or click) into the portfolio. */
  suggestions: PortfolioSuggestion[]
  /** Orders the blocks by their score with the user's weights, best first. */
  ranked: boolean
  onWeightChange: (ticker: string, weight: number) => void
  onRemove: (ticker: string) => void
  onAdd: (ticker: string) => void
}

// 3D — the portfolio's shape, and the handle on it: one block per title, as tall as its weight and shaded by
// sector, under a translucent ceiling at the profile's maximum position; what breaks the limit sticks out.
// Drag a block up or down to change its weight, out of the scene to remove it; the suggestions wait at the
// edge as low blocks to drag in. With the user's own weights the blocks line up by their new score.
export function PortfolioBlocks({
  holdings,
  analyzed,
  maxPosition,
  suggestions,
  ranked,
  onWeightChange,
  onRemove,
  onAdd,
}: PortfolioBlocksProps) {
  // A search result is being dragged over the scene.
  const [receiving, setReceiving] = useState(false)
  const total = totalWeight(holdings)
  if (holdings.length === 0 || total <= 0) return null
  const limit = maxPosition ?? 0.2
  const sectors = [...new Set(holdings.map((holding) => analyzed[holding.ticker]?.sector ?? 'Autre'))]
  const over: string[] = []
  const customScore = (holding: PortfolioHolding) => analyzed[holding.ticker]?.score?.custom_score ?? -1
  const ordered = ranked ? [...holdings].sort((a, b) => customScore(b) - customScore(a)) : holdings

  const tiles: SceneTile[] = ordered.map((holding, index) => {
    const share = Math.max(0, holding.weight) / total
    const detail = analyzed[holding.ticker]
    const aboveLimit = maxPosition !== null && share > maxPosition + 0.0005
    if (aboveLimit) over.push(holding.ticker)
    const verdict = detail?.fit.verdict
    const score = detail?.score
    const parts = [holding.ticker, formatShare(share)]
    if (detail?.sector) parts.push(detail.sector)
    if (score?.custom_score != null) parts.push(`score ${SCORE.format(score.custom_score)}${score.partiel ? ' (partiel)' : ''}`)
    return {
      id: holding.ticker,
      x: (index % COLUMNS) * GAP,
      z: Math.floor(index / COLUMNS) * GAP,
      h: Math.max(0.06, (share / limit) * CEILING),
      // One shade per sector; a title out of profile or over the limit takes the alert colour.
      tone:
        aboveLimit || verdict === 'hors_profil'
          ? 'alert'
          : verdict === 'a_surveiller'
            ? 'warn'
            : SECTOR_TONES[sectors.indexOf(detail?.sector ?? 'Autre') % SECTOR_TONES.length],
      label: parts.join(' · '),
      tag: `${holding.ticker}\n${formatShare(share)}`,
    }
  })

  const held = new Set(holdings.map((holding) => holding.ticker))
  const waiting = suggestions.filter((item) => !held.has(item.ticker)).slice(0, COLUMNS)
  const edge = (Math.floor((ordered.length - 1) / COLUMNS) + 1) * GAP + 0.9
  waiting.forEach((item, index) => {
    tiles.push({
      id: SUGGESTION + item.ticker,
      x: index * GAP,
      z: edge,
      h: 0.4,
      tone: 7,
      tag: `+ ${item.ticker}`,
      tagAt: 'base',
      label: `À ajouter : ${item.ticker}${item.score !== null ? ` · score ${SCORE.format(item.score)}` : ''}${
        item.ranking?.partiel ? ' (partiel)' : ''
      } — glissez-le ou cliquez`,
    })
  })

  // A drag of one ceiling's height is worth the profile's maximum position.
  const handleAdjust = (tile: SceneTile, delta: number) => {
    const holding = holdings.find((candidate) => candidate.ticker === tile.id)
    if (!holding) return
    const next = Math.max(0, holding.weight + (delta / CEILING) * limit * total)
    onWeightChange(holding.ticker, Math.round(next * 10) / 10)
  }
  const suggested = (tile: SceneTile) => (tile.id?.startsWith(SUGGESTION) ? tile.id.slice(SUGGESTION.length) : null)

  return (
    <section aria-label="Le portefeuille en blocs" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="eyebrow">
          Le portefeuille en blocs{maxPosition !== null && ` · plafond à ${formatShare(maxPosition)} par titre`}
        </p>
        <p className="text-sm text-muted-foreground">
          Glissez un bloc vers le haut ou le bas pour changer son poids, hors de la scène pour le
          retirer{waiting.length > 0 && ' ; les blocs bas au bord sont des suggestions à glisser dedans'}.
        </p>
      </div>
      <div
        data-testid="portfolio-drop"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(TICKER_MIME)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setReceiving(true)
        }}
        onDragLeave={() => setReceiving(false)}
        onDrop={(event) => {
          const ticker = event.dataTransfer.getData(TICKER_MIME)
          setReceiving(false)
          if (!ticker) return
          event.preventDefault()
          onAdd(ticker)
        }}
        className={cn('rounded-3xl border border-transparent transition-colors', receiving && 'border-dashed border-foreground bg-muted/40')}
      >
        <Tile3D
          tiles={tiles}
          plane={maxPosition !== null ? { y: CEILING } : null}
        onAdjust={handleAdjust}
        onDrop={(tile, drop) => {
          const ticker = suggested(tile)
          if (ticker !== null) {
            if (drop.distance >= DRAG_IN_PX) onAdd(ticker)
          } else if (drop.outside && tile.id) {
            onRemove(tile.id)
          }
        }}
        onSelect={(tile) => {
          const ticker = suggested(tile)
          if (ticker !== null) onAdd(ticker)
        }}
        label={`Le portefeuille en blocs : ${holdings.length} titres, hauteur selon le poids${
          maxPosition !== null ? `, sous un plafond à ${formatShare(maxPosition)}` : ''
        }. ${over.length === 0 ? 'Aucun titre ne dépasse le plafond.' : `Au-dessus du plafond : ${over.join(', ')}.`}${
          waiting.length > 0 ? ` Suggestions en attente : ${waiting.map((item) => item.ticker).join(', ')}.` : ''
        } Les poids exacts se lisent et se modifient au clavier dans le tableau des titres.`}
        className="h-80 sm:h-96"
      />
      </div>
    </section>
  )
}
