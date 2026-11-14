import type { ApiError } from '@/api/client'
import type { FitReason, HypeComponent, HypeComponentId, HypeLevel, HypeSignal } from '@/api/persona'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FitReasonList } from './FitReasons'
import { TREND_TEXT, formatCompact, formatLongDate, formatPercent, trendOf } from './format'
import { HypeField } from './HypeField'
import { signedRatio } from './movesMeta'
import { BlockError } from './StockSection'

const LEVELS: HypeLevel[] = ['faible', 'modere', 'eleve']
const LEVEL_NAMES: Record<HypeLevel, string> = { faible: 'faible', modere: 'modéré', eleve: 'élevé' }
const NEWS_SOURCES: Record<NonNullable<HypeSignal['news_source']>, string> = {
  gdelt: 'couverture mondiale GDELT',
  yahoo: 'manchettes Yahoo Finance',
}
/** Most points a component scores, and the signal as a whole. */
const COMPONENT_MAX = 2
const SIGNAL_MAX = 6
const NONE = '—'

interface StockHypeProps {
  hype: HypeSignal | undefined
  error: ApiError | null
  isPending: boolean
  onRetry: () => void
  personaName: string
  /** What the profile's verdict says about the hype, if anything. */
  reasons: FitReason[]
  /** The component the investor says tempts them (it starts the bias analysis), or `null`. */
  picked: HypeComponentId | null
  onPick: (component: HypeComponentId) => void
}

/**
 * « Signal de battage » : whether the title is in a frenzy — traded volume,
 * one-month run-up and news attention, each scored 0 to 2 — as a field of
 * tiles, then the numbers behind the level and what it means for the active
 * profile. Pointing at a component (in the field, or with its button) hands
 * it to the bias analysis.
 */
export function StockHype({ hype, error, isPending, onRetry, ...details }: StockHypeProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl">Signal de battage</h3>
      {isPending ? (
        <div role="status" aria-label="Chargement du signal de battage" className="space-y-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error || !hype ? (
        error && <BlockError error={error} subject="Signal de battage" onRetry={onRetry} />
      ) : (
        <HypeDetails hype={hype} {...details} />
      )}
    </div>
  )
}

type HypeDetailsProps = Pick<StockHypeProps, 'personaName' | 'reasons' | 'picked' | 'onPick'> & { hype: HypeSignal }

function HypeDetails({ hype, personaName, reasons, picked, onPick }: HypeDetailsProps) {
  const reached = LEVELS.indexOf(hype.level)
  const figures: Array<{ label: string; value: string; tone?: string }> = [
    {
      label: 'Rendement sur 1 mois',
      value: hype.return_1m === null ? NONE : signedRatio(hype.return_1m),
      tone: hype.return_1m === null ? undefined : TREND_TEXT[trendOf(hype.return_1m)],
    },
    { label: 'Volatilité sur 1 an', value: hype.volatility_1y === null ? NONE : formatPercent(hype.volatility_1y) },
    { label: 'Volume, dernière séance', value: hype.volume_last === null ? NONE : formatCompact(hype.volume_last) },
    { label: 'Volume moyen, 3 mois', value: hype.volume_avg_3m === null ? NONE : formatCompact(hype.volume_avg_3m) },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-display text-2xl">
          Battage {LEVEL_NAMES[hype.level]}
          <span className="text-muted-foreground tabular-nums">
            {' '}
            · {hype.points} point{hype.points > 1 ? 's' : ''} sur {SIGNAL_MAX}
          </span>
        </p>
        {/* Decorative: the three levels, filled up to the one reached. */}
        <span aria-hidden="true" className="flex gap-1">
          {LEVELS.map((level, index) => (
            <span key={level} className={cn('size-3', index <= reached ? 'bg-tile-1' : 'bg-tile-7')} />
          ))}
        </span>
      </div>

      <div className="space-y-1">
        <HypeField hype={hype} onPick={onPick} />
        <p className="text-xs text-muted-foreground">
          Trois bandes, de l’avant vers l’arrière : {hype.components.map((component) => component.label.toLowerCase()).join(', ')}.
          Une bande calme reste à plat, une bande agitée bondit. Touchez celle qui vous donne envie d’agir pour
          l’examiner plus bas.
        </p>
      </div>

      <ul aria-label="Composantes du signal" className="divide-y divide-border border-y border-border">
        {hype.components.map((component) => (
          <li key={component.id} className="grid items-start gap-x-6 gap-y-2 py-3 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 sm:block sm:space-y-1.5">
              <p className="text-sm font-medium">{component.label}</p>
              <Pips points={component.points} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">{component.message}</p>
              <Button
                type="button"
                size="xs"
                variant={picked === component.id ? 'default' : 'outline'}
                aria-pressed={picked === component.id}
                onClick={() => onPick(component.id)}
              >
                C’est ce qui me tente
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0">
            <dt className="eyebrow">{figure.label}</dt>
            <dd className={cn('display mt-1.5 text-3xl', figure.tone)}>{figure.value}</dd>
          </div>
        ))}
      </dl>

      {reasons.length > 0 && (
        <div className="space-y-2">
          <h4 className="eyebrow">Pour {personaName}</h4>
          <FitReasonList reasons={reasons} label={`Le battage pour ${personaName}`} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {hype.as_of && `Données au ${formatLongDate(hype.as_of)} · `}
        Attention médiatique : {hype.news_source ? NEWS_SOURCES[hype.news_source] : 'non évaluée'}. Le
        signal mesure un emballement possible, pas la qualité de l’entreprise.
      </p>
    </div>
  )
}

/** A component's points as two pips, said aloud as « 2 points sur 2 » or « Non évalué ». */
function Pips({ points }: { points: HypeComponent['points'] }) {
  if (points === null) return <p className="text-xs text-muted-foreground">Non évalué</p>
  return (
    <p className="flex items-center gap-1">
      <span className="sr-only">
        {points} point{points > 1 ? 's' : ''} sur {COMPONENT_MAX}
      </span>
      {Array.from({ length: COMPONENT_MAX }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('size-2', index < points ? 'bg-tile-1' : 'bg-tile-7')}
        />
      ))}
    </p>
  )
}
