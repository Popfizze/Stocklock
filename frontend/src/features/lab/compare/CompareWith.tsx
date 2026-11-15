import { Link } from 'react-router-dom'
import type { RunPipeline } from '@/api/runs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { comparePath } from '../labRoutes'
import type { RunView } from '../run/runView'
import { formatDateTime } from '../runs/runModel'
import { useRunFeed } from '../runs/useRunFeed'

/** « Comparer avec… » : the recent runs of the same pipeline, each one opening the side-by-side comparison. */
export function CompareWith({ view }: { view: RunView }) {
  const pipeline = (view.kind === 'score' ? 'score_pipeline' : `lab.${view.pipelineId}`) as RunPipeline
  const feed = useRunFeed({ pipeline, limit: 12 })
  const others = feed.runs.filter((run) => run.run_id !== view.id)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={others.length === 0}>
          Comparer avec…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto">
        <DropdownMenuLabel>Exécutions récentes du même pipeline</DropdownMenuLabel>
        {others.map((run) => (
          <DropdownMenuItem key={run.run_id} asChild>
            <Link to={comparePath(view.id, run.run_id)} className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{run.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(run.started_at)}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
