import { ArrowRight } from 'lucide-react'
import type { LabDecision } from '@/api/lab'
import { formatValue } from './labForm'

interface StageDecisionsProps {
  decisions: LabDecision[]
}

/** « Décisions » : every branch a stage took — the question, the answer, and why. */
export function StageDecisions({ decisions }: StageDecisionsProps) {
  return (
    <section className="space-y-2">
      <h4 className="eyebrow">Décisions ({decisions.length})</h4>
      <ol className="divide-y divide-border border-y border-border">
        {decisions.map((decision, index) => {
          const inputs = Object.entries(decision.inputs ?? {})
          return (
            <li key={index} className="space-y-1.5 py-3 text-sm">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-muted-foreground">{decision.question}</span>
                <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 self-center text-muted-foreground" />
                <span className="sr-only">Réponse :</span>
                <span className="font-medium">{formatValue(decision.answer)}</span>
              </p>
              <p>{decision.reason}</p>
              {(decision.rule || inputs.length > 0) && (
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {decision.rule && (
                    <div className="flex gap-1.5">
                      <dt>Règle :</dt>
                      <dd className="font-mono text-foreground">{decision.rule}</dd>
                    </div>
                  )}
                  {inputs.map(([name, value]) => (
                    <div key={name} className="flex gap-1.5">
                      <dt>{name} :</dt>
                      <dd className="font-mono text-foreground">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
