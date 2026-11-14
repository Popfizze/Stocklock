import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  DEFAULT_SCORE_WEIGHTS,
  SCORE_INDICATORS,
  SUB_SCORE_LABELS,
  SUB_SCORE_ORDER,
  type ScoreIndicatorId,
} from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'
import { Tile3D, greyTone, type SceneTile } from '@/components/three'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_SETUP, isDefaultSetup, setWeight, type ScoreSetup } from './scoreWeights'

/** Height of a column that weighs 50 %: taller than that is clamped by the scene's framing. */
const UNITS_PER_POINT = 0.08
const STEP = 5
const WEIGHT = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })

interface ScoreMixerProps {
  setup: ScoreSetup
  onChange: (setup: ScoreSetup) => void
  /** What the weights changed, in one line (« AMD passe de 62 à 71… »). */
  explanation: string | null
}

// 3D — the score's mixing desk: six columns, one per sub-score, as tall as its weight. Dragging a column
// sets how much that factor counts (the others give way, the total stays 100 %): the user's own score.
export function ScoreMixer({ setup, onChange, explanation }: ScoreMixerProps) {
  const { weights, excluded } = setup

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
  }))

  const change = (id: SubScoreId, value: number) => onChange({ ...setup, weights: setWeight(weights, id, value) })
  const toggle = (indicator: ScoreIndicatorId) =>
    onChange({
      ...setup,
      excluded: excluded.includes(indicator)
        ? excluded.filter((other) => other !== indicator)
        : [...excluded, indicator],
    })

  return (
    <section aria-labelledby="facteurs-score" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="facteurs-score" className="text-3xl leading-tight">
            Votre score, <em>vos pondérations</em>
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Glissez une colonne pour donner plus ou moins de poids à un facteur : les autres
            s'ajustent, le total reste à 100 %. Les scores de vos titres et les suggestions suivent.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDefaultSetup(setup)}
          onClick={() => onChange({ weights: { ...DEFAULT_SETUP.weights }, excluded: [] })}
        >
          <RotateCcw aria-hidden="true" /> Pondérations StockLock
        </Button>
      </div>

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
        className="h-56 touch-none"
        caption={false}
      />

      {/* The same desk for the keyboard: one group per factor, with its weight and its indicators. */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-6">
        {SUB_SCORE_ORDER.map((id) => (
          <li key={id} className="space-y-2 border-t border-border pt-3">
            <p className="eyebrow truncate" title={SUB_SCORE_LABELS[id]}>
              {SUB_SCORE_LABELS[id]}
            </p>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => change(id, weights[id] - STEP)}
                disabled={weights[id] <= 0}
                aria-label={`Moins de poids pour ${SUB_SCORE_LABELS[id]}`}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <Minus aria-hidden="true" className="size-3.5" />
              </button>
              <p className="display text-3xl" aria-live="polite">
                <span className="sr-only">{SUB_SCORE_LABELS[id]} : </span>
                {WEIGHT.format(weights[id])}
                <span className="text-base text-muted-foreground"> %</span>
              </p>
              <button
                type="button"
                onClick={() => change(id, weights[id] + STEP)}
                disabled={weights[id] >= 100}
                aria-label={`Plus de poids pour ${SUB_SCORE_LABELS[id]}`}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <Plus aria-hidden="true" className="size-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              StockLock : {WEIGHT.format(DEFAULT_SCORE_WEIGHTS[id])} %
            </p>
            {/* Each indicator is a tile that can be switched off: it then leaves its factor's average. */}
            <ul className="space-y-1">
              {SCORE_INDICATORS.filter((indicator) => indicator.sub_score === id).map((indicator) => {
                const on = !excluded.includes(indicator.id)
                return (
                  <li key={indicator.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(indicator.id)}
                      className="flex w-full items-start gap-2 rounded-sm text-left text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('mt-0.5 size-2.5 shrink-0', on ? 'bg-tile-1' : 'border border-border bg-transparent')}
                      />
                      <span className={cn(on ? 'text-foreground' : 'text-muted-foreground line-through')}>
                        {indicator.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
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
