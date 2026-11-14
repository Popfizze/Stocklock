import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  /** A quieter second half of the title: « Tableau » + « de bord ». */
  accent?: string
  /** Small line above the title (« Étape 3 · … »). */
  eyebrow?: string
  description?: ReactNode
  /** Right-aligned controls (search, buttons). */
  actions?: ReactNode
  className?: string
}

/** The title block every page opens with. */
export function PageHeader({ title, accent, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn('fade-up flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-4xl leading-none sm:text-5xl lg:text-6xl">
          {title}
          {accent && (
            <>
              {' '}
              <em>{accent}</em>
            </>
          )}
        </h1>
        {description && <div className="max-w-2xl text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}
