import type { ReactNode } from 'react'
import type { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { blockErrorMessage } from './format'

interface StockSectionProps {
  /** The section's anchor (`#score`); its heading's id derives from it. */
  id: string
  title: string
  /** The quieter second half of the title: « Score » + « StockLock ». */
  accent?: string
  /** Small line above the title: « Étape 2 · Événements ». */
  eyebrow?: string
  description?: ReactNode
  /** Right of the title: a link to the full view. */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The shell every block of the stock page shares: a hairline, a small step
 * label, the title and one sentence saying what the block answers. The
 * section is a landmark named by its title.
 */
export function StockSection({ id, title, accent, eyebrow, description, action, children, className }: StockSectionProps) {
  const headingId = `${id}-titre`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('scroll-mt-6 space-y-6 border-t border-border pt-10', className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-2">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={headingId} className="text-3xl sm:text-4xl">
            {title}
            {accent && (
              <>
                {' '}
                <em>{accent}</em>
              </>
            )}
          </h2>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0 text-sm">{action}</div>}
      </div>
      {children}
    </section>
  )
}

interface BlockErrorProps {
  error: ApiError
  /** What could not be loaded, as the sentence's subject: « Signal de battage ». */
  subject?: string
  onRetry?: () => void
}

/** A block's own failure: it says why and offers to try again, the rest of the page stays. */
export function BlockError({ error, subject, onRetry }: BlockErrorProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <p className="text-destructive">
        {subject ? `${subject} : ` : ''}
        {blockErrorMessage(error)}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}
