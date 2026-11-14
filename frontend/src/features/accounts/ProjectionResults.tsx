import type { ReactNode } from 'react'
import { Lightbulb, TriangleAlert } from 'lucide-react'
import type { AccountProjection } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AfterTaxBars } from './AfterTaxBars'
import { formatMoney } from './format'
import { MethodNotes } from './MethodNotes'
import { ProjectionChart } from './ProjectionChart'
import { ProjectionTable } from './ProjectionTable'

interface ProjectionResultsProps {
  projection: AccountProjection
  /** Dims the results while a newer computation is on its way. */
  stale?: boolean
  /** Shown between the headline (and profile checks) and the charts. */
  children?: ReactNode
}

/** Headline, profile checks, both charts, the table view and the method notes. */
export function ProjectionResults({ projection, stale = false, children }: ProjectionResultsProps) {
  const { profile, inputs, recommendations, profile_flags: flags } = projection
  const [from, to] = profile.horizon_years

  return (
    <div className={cn('space-y-4 transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
      <p className="flex gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="font-medium">{recommendations.headline}</span>
      </p>

      {flags.length > 0 && (
        <section className="rounded-lg border border-warning/40 bg-warning/10 p-4" aria-label="Contrôle de profil">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
            Contrôle de profil
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </section>
      )}

      {children}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="font-semibold">Valeur après impôt, année par année</CardTitle>
            <CardDescription>
              {formatMoney(inputs.annual_contribution)} avant impôt mis de côté chaque année.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectionChart
              series={projection.series}
              accounts={projection.accounts}
              horizon={{ label: `Horizon de ${profile.name}`, from, to }}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-semibold">Dans {inputs.years} ans, après impôt</CardTitle>
            <CardDescription>Du plus avantageux au moins avantageux.</CardDescription>
          </CardHeader>
          <CardContent>
            <AfterTaxBars accounts={projection.accounts} years={inputs.years} />
          </CardContent>
        </Card>
      </div>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Tableau détaillé de la projection</summary>
        <div className="mt-3">
          <ProjectionTable accounts={projection.accounts} years={inputs.years} />
        </div>
      </details>

      <MethodNotes
        assumptions={projection.assumptions}
        limits={projection.limits}
        sources={projection.sources}
      />
    </div>
  )
}
