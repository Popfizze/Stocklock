import { ArrowRight, CircleAlert, CircleCheck, CircleMinus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ACCOUNT_IDS, type TaxRules } from '@/api/accounts'
import { cn } from '@/lib/utils'
import { AccountSwatch } from './AccountLabel'
import { ACCOUNTS, withArticle } from './accountMeta'
import { JOURNEY, JOURNEY_STEPS, type StageTone } from './comparison'
import { accountGuides } from './content'

const TONE_ICON: Record<StageTone, { icon: typeof CircleCheck; className: string }> = {
  advantage: { icon: CircleCheck, className: 'text-success' },
  neutral: { icon: CircleMinus, className: 'text-muted-foreground' },
  tax: { icon: CircleAlert, className: 'text-warning' },
}

interface AtAGlanceProps {
  rules: TaxRules
}

/** One tile per account: what it is, the key number, and where the tax is paid. */
export function AtAGlance({ rules }: AtAGlanceProps) {
  const guides = accountGuides(rules)
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {ACCOUNT_IDS.map((account) => {
        const guide = guides.find((candidate) => candidate.id === account)
        if (!guide) return null
        const fact = guide.glance
        return (
          <li key={account} className="flex flex-col rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <AccountSwatch account={account} className="size-3" />
              <h3 className="text-lg font-semibold">{ACCOUNTS[account].short}</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{guide.tagline}</p>

            <p className="mt-3">
              <span className="block text-xs text-muted-foreground">{fact.label}</span>
              <span className="text-2xl font-semibold">{fact.value}</span>
            </p>

            <ul className="mt-3 space-y-1.5 text-sm" aria-label={`Impôt dans ${withArticle(account)}`}>
              {JOURNEY[account].map((stage, index) => {
                const { icon: Icon, className } = TONE_ICON[stage.tone]
                return (
                  <li key={JOURNEY_STEPS[index]} className="flex items-center gap-2">
                    <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} />
                    <span className="text-muted-foreground">{JOURNEY_STEPS[index]} :</span>
                    <span className="font-medium">{stage.label}</span>
                  </li>
                )
              })}
            </ul>

            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">Idéal pour : </span>
              {guide.bestFor}
            </p>

            <Link
              to={{ search: `?onglet=comptes&compte=${encodeURIComponent(account)}` }}
              className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium link"
            >
              Tout savoir sur {withArticle(account)}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
