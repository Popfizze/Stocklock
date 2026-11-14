import type { AccountId, TaxRules } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { faqGroups } from './faq'
import { shortSourceTitle } from './format'
import { SectionHeading } from './SectionHeading'

interface FaqSectionProps {
  rules: TaxRules
  /** Questions about an account left out of the filter are hidden. */
  accounts: AccountId[]
}

/** « Questions fréquentes » : one dropdown per question, grouped by theme, under every view. */
export function FaqSection({ rules, accounts }: FaqSectionProps) {
  const sources = new Map(rules.sources.map((source) => [source.id, source]))
  const groups = faqGroups(rules)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.account || accounts.includes(item.account)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <section className="space-y-4 border-t border-border pt-8" aria-labelledby="faq-titre">
      <SectionHeading id="faq-titre" title="Questions fréquentes" lead="Cliquez sur une question pour voir la réponse." />
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map((group, index) => (
          <section key={group.title} className="space-y-2" aria-labelledby={`faq-groupe-${index}`}>
            <h3 id={`faq-groupe-${index}`} className="eyebrow">
              {group.title}
            </h3>
            <Accordion type="multiple">
              {group.items.map((item) => {
                const source = item.sourceId ? sources.get(item.sourceId) : undefined
                return (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-muted-foreground">{item.answer}</p>
                      {source?.url && (
                        <p className="text-xs">
                          <a href={source.url} target="_blank" rel="noopener noreferrer">
                            Source : {shortSourceTitle(source.title)}
                          </a>
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </section>
        ))}
      </div>
    </section>
  )
}
