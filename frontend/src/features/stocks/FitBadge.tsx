import { FIT_VERDICT_LABELS, type FitVerdict } from '@/api/persona'
import { cn } from '@/lib/utils'
import { VERDICT_DOT } from './fitMeta'

const VERDICT_TEXT: Record<FitVerdict, string> = {
  compatible: 'text-success',
  a_surveiller: 'text-warning',
  hors_profil: 'text-destructive',
}

interface FitBadgeProps {
  verdict: FitVerdict
  /** The verdict's one-sentence summary, as a tooltip. */
  summary?: string
  /** `quiet`: a dot and a muted label, for cards; `plain`: coloured label, for a page. */
  tone?: 'quiet' | 'plain'
  className?: string
}

/** The profile fit verdict as a pastille: « Compatible », « À surveiller » or « Hors profil ». */
export function FitBadge({ verdict, summary, tone = 'quiet', className }: FitBadgeProps) {
  return (
    <span
      title={summary}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        tone === 'quiet' ? 'text-muted-foreground' : cn('text-sm font-medium', VERDICT_TEXT[verdict]),
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', VERDICT_DOT[verdict])} />
      {FIT_VERDICT_LABELS[verdict]}
    </span>
  )
}
