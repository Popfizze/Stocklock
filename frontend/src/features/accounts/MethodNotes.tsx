import type { TaxSource } from '@/api/accounts'
import { SourceList } from '@/features/lab/SourceList'

interface MethodNotesProps {
  assumptions: string[]
  limits: string[]
  sources: TaxSource[]
}

/** Assumptions, limits and sources behind a projection (shown inside a dropdown). */
export function MethodNotes({ assumptions, limits, sources }: MethodNotesProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-1">
        <h4 className="font-semibold">Hypothèses</h4>
        <ul className="list-disc space-y-1 pl-5">
          {assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <h4 className="font-semibold">Limites</h4>
        <ul className="list-disc space-y-1 pl-5">
          {limits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="space-y-1 md:col-span-2">
        <h4 className="font-semibold">Sources</h4>
        <SourceList sources={sources} />
      </section>
    </div>
  )
}
