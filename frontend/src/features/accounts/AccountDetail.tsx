import { CircleHelp, ListOrdered } from 'lucide-react'
import type { TaxRules } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import type { AccountGuide } from './content'
import { accountFaq } from './faq'
import { shortSourceTitle } from './format'
import { ProsCons } from './ProsCons'

interface AccountDetailProps {
  guide: AccountGuide
  rules: TaxRules
}

/** One account, top to bottom: in short, key numbers, how it works, use cases, order, pros and cons, FAQ. */
export function AccountDetail({ guide, rules }: AccountDetailProps) {
  const meta = ACCOUNTS[guide.id]
  const cited = rules.sources.filter((source) => guide.sourceIds.includes(source.id))
  const faq = accountFaq(rules, guide.id)

  return (
    <article className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby={`detail-${meta.key}`}>
      <header className="space-y-1">
        <h3 id={`detail-${meta.key}`} className="flex items-center gap-2 text-2xl font-semibold">
          <AccountSwatch account={guide.id} className="size-3.5" />
          {meta.short}
        </h3>
        <p className="text-sm text-muted-foreground">{meta.name}</p>
        <p className="pt-1 text-lg font-medium">{guide.tagline}</p>
        <p className="text-muted-foreground">{guide.represents}</p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {guide.keyFacts.map((fact) => (
          <div key={fact.label} className="rounded-lg bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="text-lg font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h4 className="font-semibold">Comment ça fonctionne</h4>
          <ol className="space-y-3">
            {guide.how.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h4 className="font-semibold">Cas d'usage</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {guide.useCases.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="flex gap-3 rounded-lg border border-border p-3">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="text-sm">
                  <span className="block font-medium">{label}</span>
                  <span className="text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="flex gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
        <ListOrdered aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span>
          <span className="font-semibold">Dans l'ordre : </span>
          {guide.orderTip}
        </span>
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <ProsCons title="Avantages" items={guide.pros} positive />
        <ProsCons title="Inconvénients et contraintes" items={guide.cons} />
      </div>

      {faq.length > 0 && (
        <section className="space-y-3">
          <h4 className="flex items-center gap-2 font-semibold">
            <CircleHelp aria-hidden="true" className="size-4 text-primary" />
            Bon à savoir
          </h4>
          <Accordion type="multiple">
            {faq.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {cited.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sources :{' '}
          {cited.map((source, index) => (
            <span key={source.id}>
              {index > 0 && ' · '}
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {shortSourceTitle(source.title)}
              </a>
            </span>
          ))}
        </p>
      )}
    </article>
  )
}
