import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { PortfolioFinding, PortfolioSuggestions } from '@/api/persona'
import { Button } from '@/components/ui/button'
import { FitBadge } from '@/features/stocks/FitBadge'
import { SEVERITY_DOT, SEVERITY_LABELS } from '@/features/stocks/fitMeta'
import { ScoreBadge } from '@/features/stocks/ScoreBadge'
import { cn } from '@/lib/utils'

interface FindingsProps {
  findings: PortfolioFinding[]
}

/** « Constats » : what the analysis raises, the blocking points first. */
export function PortfolioFindings({ findings }: FindingsProps) {
  if (findings.length === 0) return null
  return (
    <section aria-labelledby="constats" className="space-y-3">
      <h2 id="constats" className="text-xl font-semibold tracking-tight">
        Constats
      </h2>
      <ul className="space-y-2">
        {findings.map((finding, index) => (
          <li key={index} className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[finding.severity])} />
            <span>
              <span className="sr-only">{SEVERITY_LABELS[finding.severity]} : </span>
              {finding.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface SuggestionsProps {
  suggestions: PortfolioSuggestions
  onAdd: (ticker: string) => void
}

/** « Suggestions » : titles that suit the profile and improve the diversification, with their reasons. */
export function PortfolioSuggestionList({ suggestions, onAdd }: SuggestionsProps) {
  return (
    <section aria-labelledby="suggestions" className="space-y-3">
      <div className="space-y-1">
        <h2 id="suggestions" className="text-xl font-semibold tracking-tight">
          Suggestions
        </h2>
        <p className="text-sm text-muted-foreground">
          {suggestions.message ??
            (suggestions.source === 'score_table'
              ? 'Tirées des meilleurs scores StockLock compatibles avec votre profil.'
              : 'Tirées des sections de votre profil.')}{' '}
          Des pistes à étudier, pas un conseil financier personnalisé.
        </p>
      </div>
      {suggestions.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune suggestion pour le moment.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {suggestions.items.map((item) => (
            <li key={item.ticker} className="flex flex-wrap items-start gap-x-6 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-72 space-y-1">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link to={`/titres/${encodeURIComponent(item.ticker)}`} className="link font-semibold">
                    {item.ticker}
                  </Link>
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                  {item.score !== null && <ScoreBadge score={item.score} />}
                  <FitBadge verdict={item.verdict} />
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {item.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => onAdd(item.ticker)} aria-label={`Ajouter ${item.ticker} au portefeuille`}>
                <Plus aria-hidden="true" /> Ajouter
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
