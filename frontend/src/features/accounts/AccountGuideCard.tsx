import { CircleCheck, CircleMinus } from 'lucide-react'
import type { TaxSource } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS } from './accountMeta'
import type { AccountGuide } from './content'

interface AccountGuideCardProps {
  guide: AccountGuide
  sources: TaxSource[]
}

/** One account explained: what it is, how it works, its numbers, pros and cons. */
export function AccountGuideCard({ guide, sources }: AccountGuideCardProps) {
  const meta = ACCOUNTS[guide.id]
  const cited = sources.filter((source) => guide.sourceIds.includes(source.id))

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          <AccountSwatch account={guide.id} className="size-3" />
          <h3>{meta.short}</h3>
        </CardTitle>
        <CardDescription>{meta.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <p className="font-medium">{guide.tagline}</p>
          <p className="text-sm text-muted-foreground">{guide.represents}</p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          {guide.keyFacts.map((fact) => (
            <div key={fact.label} className="rounded-lg bg-muted p-3">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm font-semibold">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Comment ça fonctionne</h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {guide.how.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <ProsCons title="Avantages" items={guide.pros} positive />
          <ProsCons title="Inconvénients et contraintes" items={guide.cons} />
        </div>

        <p className="rounded-lg border border-border p-3 text-sm">
          <span className="font-semibold">Idéal pour : </span>
          {guide.bestFor}
        </p>

        {cited.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Sources :{' '}
            {cited.map((source, index) => (
              <span key={source.id}>
                {index > 0 && ' · '}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {source.title.split(',')[0]}
                </a>
              </span>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

interface ProsConsProps {
  title: string
  items: string[]
  positive?: boolean
}

export function ProsCons({ title, items, positive = false }: ProsConsProps) {
  const Icon = positive ? CircleCheck : CircleMinus
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon
              aria-hidden="true"
              className={positive ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-warning'}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
