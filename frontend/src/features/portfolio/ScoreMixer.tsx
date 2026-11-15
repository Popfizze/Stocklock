import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  DEFAULT_SCORE_WEIGHTS,
  SUB_SCORE_LABELS,
  SUB_SCORE_ORDER,
  SUB_SCORE_SHORT,
  useScoreSimulation,
  type ScoreIndicatorId,
} from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'
import { Tile3D, greyTone, type SceneTile } from '@/components/three'
import { Button } from '@/components/ui/button'
import { formatInteger, formatScore } from '@/features/stocks/format'
import { cn } from '@/lib/utils'
import { MixerFactor } from './MixerFactor'
import { liveReading } from './mixerLive'
import { DEFAULT_SETUP, isDefaultSetup, setWeight, toScoringChoice, type ScoreSetup } from './scoreWeights'

/** Height of a column per point of weight. */
const UNITS_PER_POINT = 0.08
const WEIGHT = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })
/** Titles offered to follow at most. */
const MAX_FOLLOWED = 8

interface ScoreMixerProps {
  setup: ScoreSetup
  /** The setup the server last answered for (the desk's own one, debounced). */
  settled: ScoreSetup
  onChange: (setup: ScoreSetup) => void
  /** What the weights changed, in one line (« AMD passe de 62 à 71… »). */
  explanation: string | null
  /** The portfolio's titles that have a score: one of them is followed live while a column moves. */
  scored: string[]
}

// 3D — the score's mixing desk: six columns, one per sub-score, as tall as its weight. Dragging a column
// sets how much that factor counts (the others give way, the total stays 100 %), and the followed title's
// score moves with it at once, read off its sensitivity curve: the user's own score, heard while mixing.
export function ScoreMixer({ setup, settled, onChange, explanation, scored }: ScoreMixerProps) {
  const { weights, excluded } = setup
  const [moved, setMoved] = useState<SubScoreId | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const followed = picked !== null && scored.includes(picked) ? picked : (scored[0] ?? null)
  const { data: simulation } = useScoreSimulation(followed, toScoringChoice(settled))
  const live = liveReading(simulation, moved, weights)
  const curves = simulation?.status === 'available' ? simulation.curves : []

  const tiles: SceneTile[] = SUB_SCORE_ORDER.map((id, index) => ({
    id,
    x: index * 1.6,
    z: 0,
    w: 1.2,
    d: 1.2,
    h: Math.max(0.06, weights[id] * UNITS_PER_POINT),
    // Darker = heavier than StockLock's default; lighter = lighter.
    tone: greyTone(0.5 + (weights[id] - DEFAULT_SCORE_WEIGHTS[id]) / 40),
    label: `${SUB_SCORE_LABELS[id]} · ${WEIGHT.format(weights[id])} %`,
    // Each column carries its own name and weight: nothing to line up with the list below.
    tag: `${SUB_SCORE_SHORT[id]}\n${WEIGHT.format(weights[id])} %`,
    tagShort: `${WEIGHT.format(weights[id])} %`,
  }))

  const change = (id: SubScoreId, value: number) => {
    setMoved(id)
    onChange({ ...setup, weights: setWeight(weights, id, value) })
  }
  const toggle = (indicator: ScoreIndicatorId) => {
    setMoved(null)
    onChange({
      ...setup,
      excluded: excluded.includes(indicator) ? excluded.filter((other) => other !== indicator) : [...excluded, indicator],
    })
  }
  const reset = () => {
    setMoved(null)
    onChange({ weights: { ...DEFAULT_SETUP.weights }, excluded: [] })
  }
  const stockLock = simulation?.comparison?.default_score ?? null

  return (
    <section aria-labelledby="facteurs-score" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="facteurs-score" className="text-3xl leading-tight">
            Votre score, <em>vos pondérations</em>
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Glissez une colonne pour donner plus ou moins de poids à un facteur : les autres s'ajustent, le total
            reste à 100 %. Le score du titre suivi bouge pendant le geste ; ceux de vos titres et les suggestions
            suivent.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={isDefaultSetup(setup)} onClick={reset}>
          <RotateCcw aria-hidden="true" /> Pondérations StockLock
        </Button>
      </div>

      {followed !== null && (
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-3xl border border-border p-5">
          <div aria-live="polite" aria-atomic="true">
            <p className="eyebrow">En direct · {followed}</p>
            <p className="flex items-baseline gap-2">
              <span className="display text-4xl">{live ? formatScore(live.score) : '—'}</span>
              <span className="font-display text-muted-foreground">/ 100</span>
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {live
                ? `${live.rank !== null && simulation ? `Rang ${formatInteger(live.rank)} sur ${formatInteger(simulation.total)} · ` : ''}StockLock : ${stockLock === null ? '—' : formatScore(stockLock)}`
                : (simulation?.message ?? 'Score en cours de calcul…')}
            </p>
          </div>
          {scored.length > 1 && (
            <div role="group" aria-label="Titre suivi pendant le réglage" className="flex flex-wrap gap-1.5">
              {scored.slice(0, MAX_FOLLOWED).map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  aria-pressed={ticker === followed}
                  onClick={() => setPicked(ticker)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    ticker === followed
                      ? 'border-foreground bg-primary text-primary-foreground'
                      : 'border-border hover:border-foreground',
                  )}
                >
                  {ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Tile3D
        tiles={tiles}
        view="front"
        onAdjust={(tile, delta) => {
          const id = tile.id as SubScoreId
          change(id, weights[id] + delta / UNITS_PER_POINT)
        }}
        label={`Table de mixage du score, six colonnes hautes selon leur poids : ${SUB_SCORE_ORDER.map(
          (id) => `${SUB_SCORE_LABELS[id]} ${WEIGHT.format(weights[id])} %`,
        ).join(', ')}. Les mêmes poids se règlent avec les boutons ci-dessous.`}
        className="h-64"
        caption={false}
      />

      {/* The same desk for the keyboard: one group per factor, with its weight and its indicators. */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
        {SUB_SCORE_ORDER.map((id) => (
          <MixerFactor
            key={id}
            id={id}
            weight={weights[id]}
            excluded={excluded}
            curve={curves.find((curve) => curve.id === id)}
            followed={followed}
            onWeight={(value) => change(id, value)}
            onToggle={toggle}
          />
        ))}
      </ul>

      <p role="status" className="min-h-5 text-sm">
        {explanation ??
          (isDefaultSetup(setup)
            ? 'Pondérations StockLock : le score est celui de la table des scores.'
            : 'Vos pondérations sont appliquées aux scores de vos titres et aux suggestions.')}
      </p>
    </section>
  )
}
