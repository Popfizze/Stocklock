import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { AnalyzedHolding, PortfolioHolding } from '@/api/persona'
import { Input } from '@/components/ui/input'
import { FitBadge } from '@/features/stocks/FitBadge'
import { formatShare } from './portfolioStore'

interface HoldingsTableProps {
  holdings: PortfolioHolding[]
  /** The analysis of each holding, by symbol, once it is back. */
  analyzed: Record<string, AnalyzedHolding>
  maxPosition: number | null
  onWeightChange: (ticker: string, weight: number) => void
  onRemove: (ticker: string) => void
}

/**
 * The holdings, editable: a weight per title (any unit — the shares are
 * normalised), with each title's share, volatility and fit for the profile.
 */
export function HoldingsTable({ holdings, analyzed, maxPosition, onWeightChange, onRemove }: HoldingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Titres du portefeuille</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">Titre</th>
            <th scope="col" className="py-2 pr-4 font-medium">Poids saisi</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Part</th>
            <th scope="col" className="py-2 pr-4 font-medium">Secteur</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Volatilité 1 an</th>
            <th scope="col" className="py-2 pr-4 font-medium">Pour votre profil</th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">Retirer</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const detail = analyzed[holding.ticker]
            return (
              <tr key={holding.ticker} className="border-b border-border align-middle">
                <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                  <Link to={`/titres/${encodeURIComponent(holding.ticker)}`} className="link font-semibold">
                    {holding.ticker}
                  </Link>
                  {detail && <span className="block max-w-56 truncate text-xs text-muted-foreground">{detail.name}</span>}
                </th>
                <td className="py-2.5 pr-4">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={holding.weight === 0 ? '' : holding.weight}
                    onChange={(event) => onWeightChange(holding.ticker, event.target.valueAsNumber)}
                    aria-label={`Poids de ${holding.ticker}`}
                    className="h-8 w-24"
                  />
                </td>
                <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                  {detail ? (
                    <>
                      <span className="font-medium">{formatShare(detail.weight)}</span>
                      {detail.over_max_position && maxPosition !== null && (
                        <span className="block text-xs text-destructive">max. {formatShare(maxPosition)}</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground">{detail?.sector ?? '—'}</td>
                <td className="py-2.5 pr-4 text-right">{formatShare(detail?.volatility_1y ?? null)}</td>
                <td className="py-2.5 pr-4">
                  {detail ? (
                    <FitBadge verdict={detail.fit.verdict} summary={detail.fit.summary} tone="plain" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(holding.ticker)}
                    aria-label={`Retirer ${holding.ticker}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
