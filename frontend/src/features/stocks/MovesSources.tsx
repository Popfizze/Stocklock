import type { StockMovesResult } from '@/api/moves'
import { formatLongDate } from './format'

/** Rate decisions of the period, then the analysis's sources, assumptions and limits. */
export function MovesSources({ result }: { result: StockMovesResult }) {
  const { analysis } = result
  const limits = Array.from(new Set([...analysis.limits, ...result.warnings]))
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Sources, hypothèses et limites</summary>
      <div className="mt-3 space-y-3">
        {result.policy_events.length > 0 && (
          <div>
            <strong>Décisions de taux pendant la période</strong>
            <ul className="list-disc pl-5">
              {result.policy_events.map((event) => (
                <li key={`${event.kind}-${event.date}`}>
                  {formatLongDate(event.date)} — {event.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <strong>Sources</strong>
          <ul className="list-disc pl-5">
            {analysis.sources.map((source) => (
              <li key={source.id}>
                {source.url ? (
                  <a className="link" href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                ) : (
                  source.title
                )}
                {source.as_of ? ` (${source.as_of})` : ''}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Hypothèses</strong>
          <ul className="list-disc pl-5">
            {analysis.assumptions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <strong>Limites et indisponibilités</strong>
          <ul className="list-disc pl-5">
            {limits.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </details>
  )
}
