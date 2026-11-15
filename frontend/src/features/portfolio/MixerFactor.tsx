import { Minus, Plus } from 'lucide-react'
import {
  DEFAULT_SCORE_WEIGHTS,
  SCORE_INDICATORS,
  SUB_SCORE_LABELS,
  type ScoreIndicatorId,
  type ScoreSensitivity,
} from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'
import { cn } from '@/lib/utils'
import { curvePath, readCurve, sliderFor } from './mixerLive'

const STEP = 5
const WEIGHT = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })
const CURVE_WIDTH = 100
const CURVE_HEIGHT = 28

const ROUND_BUTTON =
  'inline-flex size-9 items-center justify-center rounded-full border border-border transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

interface MixerFactorProps {
  id: SubScoreId
  weight: number
  /** The weight as shown: a whole percentage, the six adding up to 100. Defaults to `weight` rounded. */
  shownWeight?: number
  excluded: ScoreIndicatorId[]
  /** The followed title's score along this factor's weight, when the score table knows it. */
  curve?: ScoreSensitivity
  /** The title the curve is about. */
  followed?: string | null
  onWeight: (value: number) => void
  onToggle: (indicator: ScoreIndicatorId) => void
}

/** One factor of the mixing desk for the keyboard: its weight (− / +), its sensitivity curve, its indicators. */
export function MixerFactor({ id, weight, shownWeight, excluded, curve, followed, onWeight, onToggle }: MixerFactorProps) {
  const label = SUB_SCORE_LABELS[id]
  const here = curve ? readCurve(curve, sliderFor(weight, curve)) : null
  const marker = curve ? (sliderFor(weight, curve) / 100) * CURVE_WIDTH : 0

  return (
    <li className="space-y-2 border-t border-border pt-3">
      <p className="eyebrow truncate" title={label}>
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onWeight(weight - STEP)}
          disabled={weight <= 0}
          aria-label={`Moins de poids pour ${label}`}
          className={ROUND_BUTTON}
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </button>
        <p className="display text-3xl" aria-live="polite">
          <span className="sr-only">{label} : </span>
          {WEIGHT.format(shownWeight ?? weight)}
          <span className="text-base text-muted-foreground"> %</span>
        </p>
        <button
          type="button"
          onClick={() => onWeight(weight + STEP)}
          disabled={weight >= 100}
          aria-label={`Plus de poids pour ${label}`}
          className={ROUND_BUTTON}
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">StockLock : {WEIGHT.format(DEFAULT_SCORE_WEIGHTS[id])} %</p>
      {/* How the followed title's score would move along this factor's weight; the square is where the desk stands. */}
      {curve && here && (
        <div className="space-y-1">
          <svg
            viewBox={`-2 -2 ${CURVE_WIDTH + 4} ${CURVE_HEIGHT + 4}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="block h-8 w-full"
          >
            <polyline points={curvePath(curve, CURVE_WIDTH, CURVE_HEIGHT)} fill="none" vectorEffect="non-scaling-stroke" className="stroke-tile-4" strokeWidth={1.5} />
            <rect x={marker - 2} y={CURVE_HEIGHT - (here.score / 100) * CURVE_HEIGHT - 2} width={4} height={4} className="fill-foreground" />
          </svg>
          <p className="text-xs text-muted-foreground tabular-nums">
            {followed} : {WEIGHT.format(curve.points[0]?.score ?? 0)} à 0 %, {WEIGHT.format(curve.points[curve.points.length - 1]?.score ?? 0)} à 100 %
          </p>
        </div>
      )}
      {/* Each indicator is a tile that can be switched off: it then leaves its factor's average. */}
      <ul className="space-y-1">
        {SCORE_INDICATORS.filter((indicator) => indicator.sub_score === id).map((indicator) => {
          const on = !excluded.includes(indicator.id)
          return (
            <li key={indicator.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(indicator.id)}
                className="flex w-full items-start gap-2 rounded-sm py-0.5 text-left text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn('mt-0.5 size-2.5 shrink-0', on ? 'bg-tile-1' : 'border border-border bg-transparent')}
                />
                <span className={cn(on ? 'text-foreground' : 'text-muted-foreground line-through')}>{indicator.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
