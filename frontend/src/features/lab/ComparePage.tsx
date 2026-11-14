import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { apiClient } from '@/api/client'
import { RUNS_QUERY_KEYS, type RunStageDetail } from '@/api/runs'
import { AppLayout, PageHeader } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tile3D } from '@/components/three'
import { cn } from '@/lib/utils'
import { compareRows, compareScene, compareSide, type CompareRow, type CompareSide } from './compare/compareModel'
import { LAB_PATH, runPath } from './labRoutes'
import type { RunView } from './run/runView'
import { useRunView } from './run/useRunView'
import { formatDateTime } from './runs/runModel'

/** A Labo run's stages in full (their decisions); the score pipeline's record already holds them. */
function useStageDetails(view: RunView | null): RunStageDetail[] {
  const stages = view && view.kind === 'lab' ? view.nodes.filter((node) => node.order !== undefined) : []
  const runId = view?.id ?? ''
  return useQueries({
    queries: stages.map((stage) => ({
      queryKey: RUNS_QUERY_KEYS.stage(runId, stage.id),
      queryFn: () =>
        apiClient.request<RunStageDetail>(`/api/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(stage.id)}`),
      staleTime: Infinity,
    })),
    combine: (results) => results.flatMap((result) => (result.data ? [result.data] : [])),
  })
}

/** Two runs side by side: the numbers they share as paired 3D columns, then parameters, results and decisions that differ. */
export function ComparePage() {
  const [search] = useSearchParams()
  const left = useRunView(search.get('a'))
  const right = useRunView(search.get('b'))
  const leftStages = useStageDetails(left.view)
  const rightStages = useStageDetails(right.view)
  const sides = useMemo(
    () => (left.view && right.view ? ([compareSide(left.view, leftStages), compareSide(right.view, rightStages)] as const) : null),
    [left.view, right.view, leftStages, rightStages],
  )

  return (
    <AppLayout>
      <div className="space-y-10">
        <Link to={LAB_PATH} className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Toutes les exécutions
        </Link>
        <PageHeader eyebrow="Labo" title="Comparer" accent="deux runs" />
        {left.view && right.view && sides ? (
          <Comparison views={[left.view, right.view]} sides={sides} />
        ) : left.isLoading || right.isLoading ? (
          <p role="status" className="text-muted-foreground">
            Chargement des deux runs…
          </p>
        ) : (
          <p role="alert" className="text-destructive">
            Il faut deux runs existants pour comparer : choisissez-les dans la liste des exécutions.
          </p>
        )}
      </div>
    </AppLayout>
  )
}

function Comparison({ views, sides }: { views: [RunView, RunView]; sides: readonly [CompareSide, CompareSide] }) {
  const [all, setAll] = useState(false)
  const scene = useMemo(() => compareScene(sides[0], sides[1]), [sides])
  const sections: Array<[title: string, rows: CompareRow[]]> = [
    ['Paramètres', compareRows(sides[0].params, sides[1].params)],
    ['Résultats', compareRows(sides[0].results, sides[1].results)],
    ['Décisions', compareRows(sides[0].decisions, sides[1].decisions)],
  ]
  const differing = sections.reduce((sum, [, rows]) => sum + rows.filter((row) => row.differs).length, 0)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {views.map((view, index) => (
          <Link
            key={view.id}
            to={runPath(view.id)}
            className="rounded-3xl border border-border p-5 outline-none hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-3.5', index === 0 ? 'bg-tile-2' : 'bg-tile-5')} />
              <span className="eyebrow">
                Run {index === 0 ? 'A' : 'B'} · {view.pipelineLabel}
              </span>
            </span>
            <span className="block font-display text-2xl">{view.title}</span>
            <span className="block text-sm text-muted-foreground tabular-nums">{formatDateTime(view.startedAt)}</span>
          </Link>
        ))}
      </div>

      {scene.shared.length > 0 && (
        <Card>
          <CardContent>
            {/* 3D — the two runs measured against each other: one pair of columns per number they share, A in ink in front, B in grey behind. */}
            <Tile3D
              tiles={scene.tiles}
              view="iso"
              label={`Comparaison 3D des mesures communes aux deux runs (${scene.shared.join(', ')}) : A en encre, B en gris, chaque paire à l'échelle de sa plus grande valeur. Les valeurs sont dans les tableaux qui suivent.`}
              className="h-56 sm:h-64"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="tabular-nums">
          {differing === 0 ? 'Aucune différence entre ces deux runs.' : `${differing} différence${differing > 1 ? 's' : ''} entre ces deux runs.`}
        </p>
        <Button type="button" variant="outline" size="sm" aria-pressed={all} onClick={() => setAll(!all)}>
          {all ? 'Seulement les différences' : 'Tout afficher'}
        </Button>
      </div>

      {sections.map(([title, rows]) => {
        const shown = all ? rows : rows.filter((row) => row.differs)
        return (
          <section key={title} aria-label={title} className="space-y-3">
            <h2 className="text-2xl">
              {title} <em>{all ? `(${rows.length})` : `qui diffèrent (${shown.length})`}</em>
            </h2>
            {shown.length === 0 ? (
              <p className="text-muted-foreground">{rows.length === 0 ? 'Rien à comparer.' : 'Identiques dans les deux runs.'}</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {shown.map((row) => (
                  <li key={row.name} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <span className="flex items-start gap-2 text-muted-foreground">
                      {row.name}
                      {row.differs && all && <Badge variant="warning">Diffère</Badge>}
                    </span>
                    <span className={cn('break-words', row.differs && 'font-medium')}>
                      <span className="eyebrow mr-2">A</span>
                      {row.left}
                    </span>
                    <span className={cn('break-words', row.differs && 'font-medium')}>
                      <span className="eyebrow mr-2">B</span>
                      {row.right}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}
