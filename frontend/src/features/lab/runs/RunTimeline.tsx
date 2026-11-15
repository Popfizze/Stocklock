import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { RunSummary } from '@/api/runs'
import { Tile3D } from '@/components/three'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { runPath } from '../labRoutes'
import { formatCount, runSummaryLine, STATUS_SWATCHES } from './runModel'
import { DAY_PREFIX, timelineDays, timelineLabel, timelineScene, WINDOW, type TimelineZoom } from './timelineScene'

interface RunTimelineProps {
  runs: RunSummary[]
  /** Runs picked for a comparison: they stand out on the frieze too. */
  picked: string[]
  onPick: (runId: string) => void
}

// 3D — the history of the pipelines along time: one named row per pipeline, a date bar under each day, oldest on
// the left. By day, a stack counts the day's runs (shade = status); run by run, a tile is taller when it handled
// more titles. Failures, running runs and the selected run are tagged; tiles hop over a run still going.
export function RunTimeline({ runs, picked, onPick }: RunTimelineProps) {
  const narrow = useIsMobile()
  const days = useMemo(() => timelineDays(runs), [runs])
  // Many runs open on the overview by day; a handful are shown one by one.
  const [chosenZoom, setZoom] = useState<TimelineZoom | null>(null)
  const zoom = chosenZoom ?? (runs.length > WINDOW.runs.wide ? 'days' : 'runs')
  const [end, setEnd] = useState<number | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const size = WINDOW[zoom][narrow ? 'narrow' : 'wide']
  const focused = runs.find((run) => run.run_id === focus) ?? null
  const scene = useMemo(
    () => timelineScene(runs, { zoom, size, end, selected: focus ? [focus, ...picked] : picked }),
    [runs, zoom, size, end, focus, picked],
  )

  const changeZoom = (next: TimelineZoom) => {
    setZoom(next)
    setEnd(null)
  }
  /** Opens a day run by run: the window ends on that day's last run. */
  const openDay = (key: string) => {
    const index = days.findIndex((day) => day.key === key)
    if (index < 0) return
    setZoom('runs')
    setEnd(days.slice(0, index + 1).reduce((sum, day) => sum + day.runs.length, 0))
  }
  const unit = zoom === 'days' ? 'Jours' : 'Exécutions'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" value={zoom} onValueChange={(value) => value && changeZoom(value as TimelineZoom)} aria-label="Échelle de la frise">
          <ToggleGroupItem value="days">Par jour</ToggleGroupItem>
          <ToggleGroupItem value="runs">Par exécution</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Plus anciennes" disabled={scene.from === 0} onClick={() => setEnd(Math.max(size, scene.to - size))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p aria-live="polite" className="min-w-40 text-center text-sm tabular-nums">
            {unit} {scene.from + 1}–{scene.to} sur {formatCount(scene.total)}
            <span className="block text-xs text-muted-foreground">{scene.span}</span>
          </p>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Plus récentes" disabled={scene.to >= scene.total} onClick={() => setEnd(Math.min(scene.total, scene.to + size))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Tile3D
        tiles={scene.tiles}
        flows={scene.flows}
        view="front"
        // A tile is a shortcut: every run is also a link in the list below.
        onSelect={(tile) => {
          if (!tile.id) return
          if (tile.id.startsWith(DAY_PREFIX)) openDay(tile.id.slice(DAY_PREFIX.length))
          else setFocus(tile.id === focus ? null : tile.id)
        }}
        label={timelineLabel(runs, scene, zoom)}
        className="h-64 sm:h-80"
      />

      {/* The run pointed at on the frieze: what it is, and the way in. */}
      <div aria-live="polite" className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        {focused ? (
          <>
            <span aria-hidden="true" className={cn('size-3.5 shrink-0', STATUS_SWATCHES[focused.status])} />
            <span className="min-w-0 flex-1 basis-64">{runSummaryLine(focused)}</span>
            <Button asChild size="sm">
              <Link to={runPath(focused.run_id)}>Ouvrir l’exécution</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" aria-pressed={picked.includes(focused.run_id)} onClick={() => onPick(focused.run_id)}>
              {picked.includes(focused.run_id) ? 'Retirer de la comparaison' : 'Ajouter à la comparaison'}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">
            {zoom === 'days'
              ? 'Cliquez un jour pour le voir exécution par exécution.'
              : 'Cliquez une tuile pour savoir ce qu’elle est, l’ouvrir ou la comparer.'}
          </p>
        )}
      </div>

      {/* Every day at a glance, and the way to jump to one: the frieze's time scale. */}
      {days.length > 1 && (
        <ol
          aria-label="Jours de la frise"
          // The most recent days are at the end: that is where the strip opens.
          ref={(node) => {
            if (node) node.scrollLeft = node.scrollWidth
          }}
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {days.map((day) => (
            <li key={day.key} className="shrink-0">
              <button
                type="button"
                onClick={() => openDay(day.key)}
                aria-label={`${day.label} : ${day.runs.length} exécution${day.runs.length > 1 ? 's' : ''}, voir ce jour`}
                className="flex flex-col gap-1 rounded-xl border border-border px-3 py-2 text-left text-xs transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-medium tabular-nums">{day.label}</span>
                <span aria-hidden="true" className="flex h-2 w-16 overflow-hidden">
                  {(['succeeded', 'warning', 'failed', 'running'] as const).map((status) =>
                    day.counts[status] > 0 ? <span key={status} className={STATUS_SWATCHES[status].split(' ')[0]} style={{ flexGrow: day.counts[status] }} /> : null,
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums">{formatCount(day.runs.length)} exéc.</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
