import type { SubScore } from '@/api/stocks'
import { formatIndicator, formatScore } from './format'
import { BETTER_LABELS } from './scoreTiles'
import { TileStrip } from './TileStrip'

interface IndicatorListProps {
  subScore: SubScore
}

/**
 * The raw indicators behind a sub-score: for each, its value, its rank among
 * comparable titles as a strip of tiles, and which way is better.
 */
export function IndicatorList({ subScore }: IndicatorListProps) {
  if (subScore.score === null) {
    return (
      <p className="text-muted-foreground">
        Données manquantes pour ce sous-score : son poids est redistribué sur les autres.
      </p>
    )
  }
  if (subScore.indicators.length === 0) {
    return <p className="text-muted-foreground">Aucun indicateur brut publié pour ce sous-score.</p>
  }
  return (
    <ul aria-label={`Indicateurs bruts : ${subScore.label}`} className="divide-y divide-border text-sm">
      {subScore.indicators.map((indicator) => (
        <li
          key={indicator.id}
          className="grid grid-cols-2 items-center gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-3"
        >
          <p className="col-span-2 min-w-0 sm:col-span-1">
            {indicator.label}
            {indicator.note && <span className="block text-xs text-muted-foreground">{indicator.note}</span>}
          </p>
          <p className="font-display text-2xl tabular-nums">{formatIndicator(indicator.value, indicator.unit)}</p>
          <div className="space-y-1">
            {indicator.rank !== null && <TileStrip value={indicator.rank / 100} tiles={20} />}
            <p className="text-xs text-muted-foreground tabular-nums">
              {indicator.rank === null ? 'Rang inconnu' : `Rang ${formatScore(indicator.rank)} sur 100`} ·{' '}
              {BETTER_LABELS[indicator.better]}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
