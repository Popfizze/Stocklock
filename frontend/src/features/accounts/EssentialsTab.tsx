import { LayoutGrid, Lightbulb, Star } from 'lucide-react'
import type { TaxRules } from '@/api/accounts'
import { AtAGlance } from './AtAGlance'
import { DollarJourney } from './DollarJourney'
import { didYouKnow, goldenRules } from './learn'
import { SectionHeading } from './SectionHeading'

interface EssentialsTabProps {
  rules: TaxRules
}

/** « L'essentiel » : the four accounts at a glance, where the tax is paid, three rules and a few facts. */
export function EssentialsTab({ rules }: EssentialsTabProps) {
  const sourceUrl = (id: string) => rules.sources.find((source) => source.id === id)?.url

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="essentiel-comptes">
        <SectionHeading
          id="essentiel-comptes"
          icon={LayoutGrid}
          title="Les 4 comptes en un coup d'œil"
          lead="Ils se distinguent par le moment où l'impôt est payé : à l'entrée, chaque année ou au retrait."
        />
        <AtAGlance rules={rules} />
      </section>

      <DollarJourney />

      <section className="space-y-4" aria-labelledby="essentiel-regles">
        <SectionHeading id="essentiel-regles" icon={Star} title="3 règles d'or" lead="Pour décider vite, avant d'entrer dans les détails." />
        <ol className="grid gap-4 md:grid-cols-3">
          {goldenRules(rules).map((rule, index) => (
            <li key={rule.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{rule.title}</p>
                <p className="text-sm text-muted-foreground">{rule.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4" aria-labelledby="essentiel-saviez">
        <SectionHeading id="essentiel-saviez" icon={Lightbulb} title="Le saviez-vous ?" />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {didYouKnow(rules).map((fact) => (
            <li key={fact.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-3xl font-semibold tracking-tight">{fact.value}</p>
              <p className="font-medium">{fact.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {fact.detail}{' '}
                {sourceUrl(fact.sourceId) && (
                  <a
                    href={sourceUrl(fact.sourceId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    Source
                  </a>
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
