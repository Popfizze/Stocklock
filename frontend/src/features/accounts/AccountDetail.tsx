import type { TaxRules } from '@/api/accounts'
import type { AccountGuide } from './content'
import { shortSourceTitle } from './format'
import { ProsCons } from './ProsCons'
import { atLeast, type Level } from './viewOptions'

interface AccountDetailProps {
  guide: AccountGuide
  rules: TaxRules
  level: Level
}

/**
 * One account, opened from its dropdown. Simple: what it is and how it works.
 * Normale: what it can be used for, pros and constraints. Complexe: its figures and sources.
 */
export function AccountDetail({ guide, rules, level }: AccountDetailProps) {
  const cited = rules.sources.filter((source) => guide.sourceIds.includes(source.id))

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">{guide.represents}</p>

      <ol className="grid gap-2 sm:grid-cols-2">
        {guide.how.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {atLeast(level, 'normale') && (
        <>
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">À quoi il peut servir</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {guide.uses.map(({ icon: Icon, label, detail }) => (
                <li key={label} className="flex gap-2.5 text-sm">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground"> · {detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-5 sm:grid-cols-2">
            <ProsCons title="Avantages" items={guide.pros} positive />
            <ProsCons title="Inconvénients et contraintes" items={guide.cons} />
          </div>
        </>
      )}

      {atLeast(level, 'complexe') && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {guide.keyFacts.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-muted p-3">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="font-semibold">{fact.value}</dd>
              </div>
            ))}
          </dl>
          {cited.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sources :{' '}
              {cited.map((source, index) => (
                <span key={source.id}>
                  {index > 0 && ' · '}
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="link">
                    {shortSourceTitle(source.title)}
                  </a>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  )
}
