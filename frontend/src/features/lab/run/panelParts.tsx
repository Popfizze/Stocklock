import type { ReactNode } from 'react'

/** A titled block of the stage panel. */
export function PanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="eyebrow">{title}</h4>
      {children}
    </section>
  )
}

/** Name → value pairs as a row of small figures. */
export function Figures({ entries }: { entries: Array<[name: string, value: string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map(([name, value]) => (
        <div key={name} className="min-w-0">
          <dt className="truncate text-xs text-muted-foreground">{name}</dt>
          <dd className="truncate font-display text-lg" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
