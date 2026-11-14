import type { AccountId, TaxProfile, TaxRules } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { AccountDetail } from './AccountDetail'
import { AccountLabel } from './AccountLabel'
import { accountGuides } from './content'
import { FlowLanes } from './FlowLanes'
import { didYouKnow, KEY_FACTS } from './learn'
import { SectionHeading } from './SectionHeading'
import { atLeast, type Level } from './viewOptions'

interface JourneyViewProps {
  rules: TaxRules
  level: Level
  accounts: AccountId[]
  profile?: TaxProfile
}

/** « Le parcours » : the flowchart of each account, three facts, then each account in its dropdown. */
export function JourneyView({ rules, level, accounts, profile }: JourneyViewProps) {
  const guides = accountGuides(rules).filter((guide) => accounts.includes(guide.id))
  const sourceUrl = (id: string) => rules.sources.find((source) => source.id === id)?.url

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="parcours-flux">
        <SectionHeading
          id="parcours-flux"
          title="Le parcours de l'argent"
          lead="Les comptes se distinguent par le moment où l'impôt s'applique : à l'entrée, pendant la croissance ou au retrait."
        />
        <FlowLanes rules={rules} level={level} accounts={accounts} profile={profile} />
      </section>

      <section className="space-y-3" aria-labelledby="parcours-retenir">
        <SectionHeading id="parcours-retenir" title="À retenir" />
        <ul className="grid gap-3 md:grid-cols-3">
          {KEY_FACTS.map((fact) => (
            <li key={fact} className="rounded-xl border border-border p-4 text-sm">
              {fact}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="parcours-detail">
        <SectionHeading
          id="parcours-detail"
          title="Chaque compte en détail"
          lead="Cliquez sur un compte pour voir comment il fonctionne."
        />
        <Accordion type="multiple">
          {guides.map((guide) => (
            <AccordionItem key={guide.id} value={guide.id}>
              <AccordionTrigger>
                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <AccountLabel account={guide.id} className="font-semibold" />{' '}
                  <span className="font-normal text-muted-foreground">{guide.tagline}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <AccountDetail guide={guide} rules={rules} level={level} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {atLeast(level, 'complexe') && (
        <section className="space-y-3" aria-labelledby="parcours-chiffres">
          <SectionHeading id="parcours-chiffres" title="Le saviez-vous ?" />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {didYouKnow(rules).map((fact) => (
              <li key={fact.label} className="rounded-xl border border-border p-4">
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{fact.value}</p>
                <p className="text-sm font-medium">{fact.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fact.detail}{' '}
                  {sourceUrl(fact.sourceId) && (
                    <a href={sourceUrl(fact.sourceId)} target="_blank" rel="noopener noreferrer" className="link">
                      Source
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
