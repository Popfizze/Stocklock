import type { LucideIcon } from 'lucide-react'

interface SectionHeadingProps {
  icon: LucideIcon
  title: string
  /** The one sentence to remember from the section. */
  lead?: string
  id?: string
}

/** A section title with its icon and its one-line takeaway. */
export function SectionHeading({ icon: Icon, title, lead, id }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        {title}
      </h2>
      {lead && <p className="max-w-3xl text-muted-foreground">{lead}</p>}
    </div>
  )
}
