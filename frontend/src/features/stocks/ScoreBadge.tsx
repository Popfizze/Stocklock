import { cn } from '@/lib/utils'
import { formatScore } from './format'

interface ScoreBadgeProps {
  score: number
  partiel?: boolean | null
  className?: string
}

/** A title's score 0-100 as a small pill; « partiel » is said, not only marked. */
export function ScoreBadge({ score, partiel, className }: ScoreBadgeProps) {
  const label = `Score ${formatScore(score)} sur 100${partiel ? ' (partiel)' : ''}`
  return (
    <span
      title={label}
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-xs font-medium tabular-nums',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">
        {formatScore(score)}
        {partiel && <span className="text-muted-foreground">*</span>}
      </span>
    </span>
  )
}
