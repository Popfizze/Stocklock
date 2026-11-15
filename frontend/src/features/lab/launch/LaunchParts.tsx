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
  /** What waits at the entrance, as written on the scene: « 8 titres en attente ». */
  waiting: string
  /** The launch button, and what goes with it (errors, links). */
  children: ReactNode
}

/** The launcher's last step: the run about to start, drawn on the conveyor with its group waiting at the entrance. */
export function LaunchStage({ name, nodes, travellers, summary, running, waiting, children }: LaunchStageProps) {
  const stages = nodes.filter((node) => node.order !== undefined)
  return (
    <Card>
      <CardContent className="space-y-5">
        <p className="eyebrow">Ce qui va s’exécuter</p>
        <RunConveyor nodes={nodes} travellers={travellers} name={name} preview={running ? null : waiting} className="h-56 sm:h-72" />
        {/* The same stages in words, in the order they run. */}
        <ol aria-label="Étapes qui vont s’exécuter" className="flex flex-wrap gap-x-2 gap-y-1.5 text-sm">
          <li className="rounded-full bg-primary px-3 py-1 text-primary-foreground tabular-nums">{waiting}</li>
          {stages.map((node) => (
            <li key={node.id} className="rounded-full border border-border px-3 py-1">
              <span className="mr-1.5 text-muted-foreground tabular-nums">{node.order}</span>
              {node.label}
            </li>
          ))}
        </ol>
        <p className="font-display text-xl" aria-live="polite">
          {running ? 'Exécution en cours — les titres traversent les étapes. Le résultat s’ouvrira dès la fin.' : summary}
        </p>
        <div className="flex flex-wrap items-center gap-4">{children}</div>
      </CardContent>
    </Card>
  )
}
