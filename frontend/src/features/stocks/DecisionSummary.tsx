import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useAccountProjection } from '@/api/accounts'
import { HYPE_LEVEL_LABELS, useEsg, useHype, type FitResult } from '@/api/persona'
import { useStockScore } from '@/api/stocks'
import { Skeleton } from '@/components/ui/skeleton'
import { ACCOUNTS } from '@/features/accounts/accountMeta'
import { useActivePersona } from '@/features/personas/activePersona'
import { stockAccountRequest } from './accountRequest'
import { ESG_CATEGORY_LABELS } from './esgMeta'
import { ESG_RULES, HYPE_RULES, needsAttention, reasonsFor } from './fitMeta'
import { formatScore } from './format'

const UNAVAILABLE = 'Indisponible'

interface DecisionSummaryProps {
  ticker: string
  /** One of the datathon's 31 assets: the account projection is the title's own. */
  starterKit: boolean
  fit: FitResult | undefined
}

/**
 * « En bref » : one line per block of the page — score, hype, account, ESG —
 * each a link to its block. It reads the blocks' own queries (shared cache),
 * and flags the lines the profile's verdict calls attention to.
 */
export function DecisionSummary({ ticker, starterKit, fit }: DecisionSummaryProps) {
  const { personaId } = useActivePersona()
  const score = useStockScore(ticker)
  const hype = useHype(ticker)
  const esg = useEsg(ticker)
  const account = useAccountProjection(
    personaId ? stockAccountRequest(personaId, starterKit ? ticker : null) : null,
  )

  const scoreRow = score.data?.status === 'available' ? score.data.score : null
  const best = account.data?.ranking[0]?.account

  return (
    <nav aria-label="En bref">
      <h3 className="eyebrow">En bref</h3>
      <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
        <SummaryRow
          href="#score"
          label="Score StockLock"
          isPending={score.isPending}
          value={
            score.error
              ? UNAVAILABLE
              : scoreRow
                ? `${formatScore(scoreRow.score)} / 100${scoreRow.partiel ? ' · partiel' : ''}`
                : 'Pas encore calculé'
          }
        />
        <SummaryRow
          href="#prendre-du-recul"
          label="Battage"
          isPending={hype.isPending}
          value={hype.data ? HYPE_LEVEL_LABELS[hype.data.level] : UNAVAILABLE}
          attention={hype.data?.level === 'eleve' || needsAttention(reasonsFor(fit, HYPE_RULES))}
        />
        <SummaryRow href="#comprendre" label="Fluctuations" isPending={false} value="À expliquer" />
        <SummaryRow
          href="#compte"
          label="Après impôt, le plus élevé"
          isPending={account.isPending}
          value={best ? `${ACCOUNTS[best].short}${starterKit ? '' : ' · épargne'}` : UNAVAILABLE}
        />
        <SummaryRow
          href="#esg"
          label="Risque ESG"
          isPending={esg.isPending}
          value={
            esg.error
              ? UNAVAILABLE
              : esg.data?.esg
                ? ESG_CATEGORY_LABELS[esg.data.esg.risk_category]
                : 'Non disponible'
          }
          attention={needsAttention(reasonsFor(fit, ESG_RULES))}
        />
      </ul>
    </nav>
  )
}

interface SummaryRowProps {
  href: string
  label: string
  value: string
  isPending: boolean
  /** The profile's verdict has a warning about this block. */
  attention?: boolean
}

function SummaryRow({ href, label, value, isPending, attention = false }: SummaryRowProps) {
  return (
    <li>
      <a
        href={href}
        className="group flex items-center justify-between gap-3 rounded-sm py-2.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 text-muted-foreground group-hover:text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums">
          {isPending ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <>
              {attention && (
                <>
                  <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
                  <span className="sr-only">À vérifier : </span>
                </>
              )}
              <span>{value}</span>
            </>
          )}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </span>
      </a>
    </li>
  )
}
