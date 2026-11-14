import { CircleHelp } from 'lucide-react'
import type { TaxRules } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { faqGroups } from './faq'
import { shortSourceTitle } from './format'
import { SectionHeading } from './SectionHeading'

interface FaqTabProps {
  rules: TaxRules
}

/** « Questions fréquentes » : one dropdown per question, grouped by theme. */
export function FaqTab({ rules }: FaqTabProps) {
  const sources = new Map(rules.sources.map((source) => [source.id, source]))
  return (
    <div className="space-y-8">
      <SectionHeading
        icon={CircleHelp}
        title="Questions fréquentes"
        lead="Cliquez sur une question pour voir la réponse."
      />
      <div className="grid gap-8 lg:grid-cols-2">
        {faqGroups(rules).map((group, index) => (
          <section key={group.title} className="space-y-3" aria-labelledby={`faq-groupe-${index}`}>
            <h3 id={`faq-groupe-${index}`} className="font-semibold">
              {group.title}
            </h3>
            <Accordion type="multiple" className="bg-card">
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
    </div>
  )
}
