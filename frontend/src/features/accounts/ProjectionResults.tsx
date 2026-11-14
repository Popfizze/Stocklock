import type { ReactNode } from 'react'
import { ACCOUNT_IDS, type AccountId, type AccountProjection } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { AccountFactsList } from './AccountFactsList'
import { AfterTaxBars } from './AfterTaxBars'
import { AssetSnapshot } from './AssetSnapshot'
import { formatMoney, formatPercent } from './format'
import { MethodNotes } from './MethodNotes'
import { ProjectionChart } from './ProjectionChart'
import { ProjectionTable } from './ProjectionTable'
import { atLeast, type Level } from './viewOptions'

interface ProjectionResultsProps {
  projection: AccountProjection
  level: Level
  /** The accounts shown (all four by default). */
  accounts?: AccountId[]
  /** Dims the results while a newer computation is on its way. */
  stale?: boolean
}

/**
 * The projection by level. Simple: the result in one sentence and the bars.
 * Normale: the profile checks, the year-by-year chart and each account's facts.
 * Complexe: the full table. Details always sit in dropdowns.
 */
export function ProjectionResults({ projection, level, accounts = ACCOUNT_IDS, stale = false }: ProjectionResultsProps) {
  const { profile, inputs, comparison, profile_flags: flags, asset } = projection
  const outcomes = projection.accounts.filter((outcome) => accounts.includes(outcome.account))
  const facts = comparison.accounts.filter((item) => accounts.includes(item.account))
  const normal = atLeast(level, 'normale')
  const [from, to] = profile.horizon_years
  const basis = asset ? `rendement supposé de ${formatPercent(asset.expected_return)} par an` : `rendement de ${formatPercent(inputs.total_return)} par an`

  return (
    <div className={cn('space-y-5 transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
      <div className="space-y-1">
        <p className="font-medium">{comparison.headline}</p>
        <p className="text-xs text-muted-foreground">
          {formatMoney(inputs.annual_contribution)} avant impôt par an pendant {inputs.years} ans, {basis}.
        </p>
      </div>

      {normal && flags.length > 0 && (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm" aria-label="Contrôle de profil">
          <h4 className="font-semibold">Contrôle de profil</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="@container">
        <div className={cn('grid gap-4', normal ? '@5xl:grid-cols-5' : 'max-w-3xl')}>
          <Panel title={`Dans ${inputs.years} ans, après impôt`} className="@5xl:col-span-2">
            <AfterTaxBars accounts={outcomes} years={inputs.years} />
          </Panel>
          {normal && (
            <Panel title="Année par année" className="@5xl:col-span-3">
              <ProjectionChart
                series={projection.series}
                accounts={outcomes}
                horizon={{ label: `Horizon de ${profile.name}`, from, to }}
              />
            </Panel>
          )}
        </div>
      </div>

      <Accordion type="multiple">
        {normal && asset && (
          <Fold value="titre" title="Ce que verse ce titre">
            <AssetSnapshot asset={asset} />
          </Fold>
        )}
        {normal && (
          <Fold value="comptes" title="Compte par compte : avantages et inconvénients">
            <AccountFactsList accounts={facts} />
          </Fold>
        )}
        {atLeast(level, 'complexe') && (
          <Fold value="tableau" title="Tableau détaillé">
            <ProjectionTable accounts={outcomes} years={inputs.years} />
          </Fold>
        )}
        <Fold value="methode" title="Hypothèses, limites et sources">
          <MethodNotes assumptions={projection.assumptions} limits={projection.limits} sources={projection.sources} />
        </Fold>
      </Accordion>
    </div>
  )
}

function Panel({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-3 rounded-xl border border-border p-4 sm:p-5', className)}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function Fold({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  )
}
