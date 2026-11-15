import type { LabResult } from '@/api/lab'
import type { RunSummary } from '@/api/runs'
import { cn } from '@/lib/utils'
import { formatValue } from '../labForm'
import { SourceList } from '../SourceList'
import { PassBadge } from '../StatusBadges'
import { PanelBlock } from './panelParts'

interface LabOutcomeProps {
  result: LabResult
  keyResult: RunSummary['key_result']
}

/** « Sortie » of a Labo run on one title: the answer, its factors, and the governance checks it passed or not. */
export function LabOutcome({ result, keyResult }: LabOutcomeProps) {
  const sourceTitle = (id: string | undefined) =>
    id === undefined ? null : (result.sources.find((source) => source.id === id)?.title ?? id)

  return (
    <div className="space-y-6">
      <h3 className="text-xl">Résultat de l’exécution</h3>
      {keyResult && keyResult.value !== null && (
        <p>
          <span className="eyebrow block">{keyResult.label}</span>
          <span className="display text-5xl">{formatValue(keyResult.value)}</span>
        </p>
      )}
      <p className="max-w-3xl whitespace-pre-line">
        {/* The narration marks its headings with **…**. */}
        {result.answer.split('**').map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))}
      </p>

      {result.factors.length > 0 && (
        <PanelBlock title={`Facteurs (${result.factors.length})`}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.factors.map((factor, index) => (
              <li key={index} className="rounded-2xl border border-border p-4">
                <p className="text-sm text-muted-foreground">{factor.name}</p>
                <p className="font-display text-2xl tabular-nums">
                  {formatValue(factor.value)}
                  {factor.unit ? ` ${factor.unit}` : ''}
                </p>
                {factor.effect && <p className="text-sm">{factor.effect}</p>}
                {sourceTitle(factor.source_id) && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">Source : {sourceTitle(factor.source_id)}</p>
                )}
              </li>
            ))}
          </ul>
        </PanelBlock>
      )}

      <section className="space-y-2">
        <h4 className="eyebrow flex items-center gap-2">
          Gouvernance <PassBadge passed={result.governance.passed} feminine />
        </h4>
        <ul className="grid gap-2 sm:grid-cols-2">
          {result.governance.checks.map((check, index) => (
            <li key={index} className="flex items-start gap-3 rounded-2xl border border-border p-3 text-sm">
              <span aria-hidden="true" className={cn('mt-1 size-3 shrink-0', check.passed ? 'bg-success' : 'bg-destructive')} />
              <span>
                <span className="font-medium">{check.name}</span>
                <span className="sr-only"> — {check.passed ? 'passé' : 'échoué'}</span>
                {check.note && <span className="block text-muted-foreground">{check.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {result.sources.length > 0 && (
        <PanelBlock title="Sources">
          <SourceList sources={result.sources} />
        </PanelBlock>
      )}
      {result.assumptions.length > 0 && (
        <PanelBlock title="Hypothèses">
          <TextList items={result.assumptions} />
        </PanelBlock>
      )}
      {result.limits.length > 0 && (
        <PanelBlock title="Limites">
          <TextList items={result.limits} />
        </PanelBlock>
      )}
    </div>
  )
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}
