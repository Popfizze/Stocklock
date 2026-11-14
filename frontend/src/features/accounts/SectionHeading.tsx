interface SectionHeadingProps {
  title: string
  /** One short sentence under the title. */
  lead?: string
  id?: string
}

/** A section title and its one-line lead. */
export function SectionHeading({ title, lead, id }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {lead && <p className="max-w-3xl text-sm text-muted-foreground">{lead}</p>}
    </div>
  )
}
