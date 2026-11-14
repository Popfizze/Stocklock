import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  /** Small line above the title (« Étape 3 · … »). */
  eyebrow?: string
  description?: ReactNode
  /** Right-aligned controls (search, buttons). */
  actions?: ReactNode
  className?: string
}

/** The title block every page opens with. */
export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="max-w-3xl text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}
