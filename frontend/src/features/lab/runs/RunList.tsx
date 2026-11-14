import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRun, type RunSummary } from '@/api/runs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { runPath } from '../labRoutes'
import {
  dayKey,
  formatCount,
  formatDay,
  formatDuration,
  formatKeyResult,
  formatTime,
  STATUS_LABELS,
  STATUS_SWATCHES,
  STATUS_VARIANTS,
  TRIGGER_LABELS,
} from './runModel'

interface RunListProps {
  runs: RunSummary[]
  /** Profile names by id, for the « Profil » of a run. */
  personaNames: Record<string, string>
  /** Runs picked for a comparison (two at most). */
  picked: string[]
  onPick: (runId: string) => void
}

/** The timeline's text equivalent: every run as a row that opens it, grouped by day, newest first. */
export function RunList({ runs, personaNames, picked, onPick }: RunListProps) {
  const days: Array<{ key: string; runs: RunSummary[] }> = []
  for (const run of runs) {
    const key = dayKey(run.started_at)
    const last = days[days.length - 1]
    if (last?.key === key) last.runs.push(run)
    else days.push({ key, runs: [run] })
  }

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.key} className="space-y-2">
          <h3 className="eyebrow">{formatDay(day.runs[0].started_at)}</h3>
          <ol aria-label={`Exécutions du ${formatDay(day.runs[0].started_at)}`} className="divide-y divide-border border-y border-border">
            {day.runs.map((run) => (
              <RunRow
                key={run.run_id}
                run={run}
                personaNames={personaNames}
                picked={picked.includes(run.run_id)}
                onPick={() => onPick(run.run_id)}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

interface RunRowProps {
  run: RunSummary
  personaNames: Record<string, string>
  picked: boolean
  onPick: () => void
}

function RunRow({ run, personaNames, picked, onPick }: RunRowProps) {
  const [open, setOpen] = useState(false)
  const keyResult = formatKeyResult(run.key_result)
  const meta = [
    formatTime(run.started_at),
    run.duration_ms === null ? null : formatDuration(run.duration_ms),
    TRIGGER_LABELS[run.trigger],
    run.persona_id ? (personaNames[run.persona_id] ?? run.persona_id) : null,
  ].filter(Boolean)

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden="true" className={cn('size-3.5 shrink-0', STATUS_SWATCHES[run.status])} />
        <Link
          to={runPath(run.run_id)}
          className="group min-w-0 flex-1 basis-64 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="eyebrow block">{run.pipeline_label}</span>
          <span className="block truncate font-display text-lg group-hover:underline">{run.title}</span>
          <span className="block text-sm text-muted-foreground tabular-nums">{meta.join(' · ')}</span>
        </Link>
        {keyResult && <span className="text-sm tabular-nums">{keyResult}</span>}
        <Badge variant={STATUS_VARIANTS[run.status]}>{STATUS_LABELS[run.status]}</Badge>
        {run.child_count > 0 && (
          <Button type="button" variant="outline" size="xs" aria-expanded={open} onClick={() => setOpen(!open)}>
            {formatCount(run.child_count)} titres
          </Button>
        )}
        <Button
          type="button"
          variant={picked ? 'default' : 'outline'}
          size="xs"
          aria-pressed={picked}
          aria-label={`Comparer ${run.title}`}
          onClick={onPick}
        >
          Comparer
        </Button>
      </div>
      {run.error && <p className="mt-2 pl-7 text-sm text-destructive">{run.error}</p>}
      {open && <ChildRuns parentId={run.run_id} />}
    </li>
  )
}

/** The titles of a group run, each one its own run: fetched when the group is opened. */
function ChildRuns({ parentId }: { parentId: string }) {
  const parent = useRun(parentId)
  if (parent.isPending) {
    return (
      <p role="status" className="mt-2 pl-7 text-sm text-muted-foreground">
        Chargement des titres…
      </p>
    )
  }
  if (parent.isError) {
    return <p className="mt-2 pl-7 text-sm text-destructive">Les titres de ce groupe n'ont pas pu être chargés.</p>
  }
  return (
    <ul aria-label="Titres du groupe" className="mt-3 flex flex-wrap gap-2 pl-7">
      {parent.data.children.map((child) => (
        <li key={child.run_id}>
          <Link
            to={runPath(child.run_id)}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm hover:border-foreground"
          >
            <span aria-hidden="true" className={cn('size-2.5', STATUS_SWATCHES[child.status])} />
            <span className="font-medium">{child.title}</span>
            <span className="sr-only">{STATUS_LABELS[child.status]}</span>
            {child.key_result?.value != null && (
              <span className="text-muted-foreground tabular-nums">{formatKeyResult(child.key_result)}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
