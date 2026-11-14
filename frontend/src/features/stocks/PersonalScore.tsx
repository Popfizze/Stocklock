import { Link } from 'react-router-dom'
import type { ReweightedRow } from '@/api/scoring'
import { formatInteger, formatPoints, formatScore } from './format'

const PORTFOLIO = '/portefeuille'

interface PersonalScoreProps {
  /** The profile set its own weights (or switched indicators off) in « Mon portefeuille ». */
  custom: boolean
  /** The title rescored with them; `undefined` while it loads or when the table lacks the title. */
  row: ReweightedRow | undefined
  /** Titles ranked in the score table. */
  total: number | undefined
}

/**
 * « Votre score » : the title's score with the profile's own sub-score weights,
 * next to StockLock's, with how far it moved and where to change the weights.
 * Without custom weights, only the way to set some.
 */
export function PersonalScore({ custom, row, total }: PersonalScoreProps) {
  if (!custom) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce score suit les pondérations de StockLock.{' '}
        <Link to={PORTFOLIO} className="link text-foreground">
          Régler vos propres pondérations
        </Link>
      </p>
    )
  }
  if (!row) return null
  const delta = row.delta

  return (
    <div className="space-y-1 border-l border-border pl-4">
      <p className="eyebrow">Votre score</p>
      {row.custom_score === null ? (
        <p className="text-sm">Non calculable : vos pondérations ne retiennent aucun sous-score de ce titre.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="display text-4xl">{formatScore(row.custom_score)}</span>
            <span className="font-display text-muted-foreground">/ 100</span>
            {delta !== null && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                {formatPoints(Math.abs(delta))} pt{Math.abs(delta) >= 2 ? 's' : ''} par rapport à StockLock
              </span>
            )}
          </p>
          {row.custom_rank !== null && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Rang {formatInteger(row.custom_rank)}
              {total ? ` sur ${formatInteger(total)}` : ''} avec vos pondérations (rang{' '}
              {formatInteger(row.default_rank)} avec celles de StockLock).
            </p>
          )}
        </>
      )}
      <p className="text-sm">
        <Link to={PORTFOLIO} className="link">
          Modifier vos pondérations
        </Link>
      </p>
    </div>
  )
}
