import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { FlowNode, Traveller } from '../run/flowModel'
import { RunConveyor } from '../run/RunConveyor'

/** A numbered step of the launcher. */
export function LaunchStep({ number, title, hint, children }: { number: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-2xl">
          <em className="mr-3 tabular-nums">{number}</em>
          {title}
        </h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

interface LaunchStageProps {
  /** « du pipeline de score » */
  name: string
  nodes: FlowNode[]
  travellers: Traveller[]
  /** What will run, in a sentence. */
  summary: string
  running: boolean
  /** The launch button, and what goes with it (errors, links). */
  children: ReactNode
}

/** The launcher's last step: the run about to start, drawn on the conveyor with its group waiting at the entrance. */
export function LaunchStage({ name, nodes, travellers, summary, running, children }: LaunchStageProps) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <RunConveyor nodes={nodes} travellers={travellers} name={name} className="h-44 sm:h-56" />
        <p className="font-display text-xl" aria-live="polite">
          {running ? 'Exécution en cours — les titres traversent les étapes. Le résultat s’ouvrira dès la fin.' : summary}
        </p>
        <div className="flex flex-wrap items-center gap-4">{children}</div>
      </CardContent>
    </Card>
  )
}
