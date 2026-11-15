import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { usePersonas } from '@/api/personas'
import type { RunFilters as Filters } from '@/api/runs'
import { AppLayout, PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { comparePath, LAUNCH_PATH } from './labRoutes'
import { RunFilters } from './runs/RunFilters'
import { RunList } from './runs/RunList'
import { feedErrorMessage, formatCount, sinceOf, withinRange, type DateRange } from './runs/runModel'
import { RunTimeline } from './runs/RunTimeline'
import { useRunFeed } from './runs/useRunFeed'

/** « Exécutions », the Labo's home: every run of every pipeline, as a 3D frieze and as a list. */
export function LabPage() {
  const [filters, setFilters] = useState<Filters>({})
  const [range, setRange] = useState<DateRange>('all')
  const [picked, setPicked] = useState<string[]>([])
  const personas = usePersonas()
  // The date range is the registry's `since`: older runs are not even listed.
  const since = sinceOf(range, new Date())
  const dated = useMemo(() => ({ ...filters, since }), [filters, since])
  const feed = useRunFeed(dated)

  const runs = useMemo(() => {
    const now = new Date()
    return feed.runs.filter((run) => withinRange(run, range, now))
  }, [feed.runs, range])
  const personaNames = useMemo(
    () => Object.fromEntries((personas.data ?? []).map((persona) => [persona.id, persona.name])),
    [personas.data],
  )
  // Picking a third run replaces the oldest pick.
  const pick = (runId: string) =>
    setPicked((current) => (current.includes(runId) ? current.filter((id) => id !== runId) : [...current, runId].slice(-2)))

  return (
    <AppLayout>
      <div className="space-y-10">
        <PageHeader
          eyebrow="Console des pipelines"
          title="Labo"
          accent="des exécutions"
          description="Chaque exécution de chaque pipeline — le pipeline de score sur AWS, ses runs planifiés, les runs du Labo sur un titre ou sur un groupe — avec tout ce qu'elle a produit."
          actions={
            <Button asChild>
              <Link to={LAUNCH_PATH}>
                <Play aria-hidden="true" data-icon="inline-start" />
                Lancer un run
              </Link>
            </Button>
          }
        />

        <RunFilters
          filters={filters}
          range={range}
          personas={personas.data ?? []}
          onFilters={setFilters}
          onRange={setRange}
        />

        {feed.source === 'score' && !feed.isLoading && !feed.error && (
          <p role="note" className="text-sm text-muted-foreground">
            Le registre des exécutions n'est pas disponible sur ce serveur : seuls les runs du pipeline de score sont listés.
          </p>
        )}

        {feed.isLoading ? (
          <p role="status" className="text-muted-foreground">
            Chargement des exécutions…
          </p>
        ) : feed.error ? (
          <p role="alert" className="text-destructive">
            {feedErrorMessage(feed.error)}
          </p>
        ) : runs.length === 0 ? (
          <Card>
            <CardContent className="space-y-4 py-10 text-center">
              <p className="font-display text-2xl">Aucune exécution pour ces filtres.</p>
              <p className="text-muted-foreground">Élargissez les filtres, ou lancez un run sur un groupe de titres.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section aria-labelledby="frise" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="frise" className="text-2xl">
                  Frise
                </h2>
                <p className="text-sm text-muted-foreground">
                  Hauteur : titres traités · teinte : statut · une rangée par pipeline · cliquez une tuile pour ouvrir le run.
                </p>
              </div>
              <Card>
                <CardContent>
                  <RunTimeline runs={runs} />
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="liste" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="liste" className="text-2xl">
                  {formatCount(runs.length)} exécution{runs.length > 1 ? 's' : ''}
                </h2>
                {picked.length === 2 ? (
                  <Button asChild size="sm">
                    <Link to={comparePath(picked[0], picked[1])}>Comparer les 2 runs choisis</Link>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {picked.length === 1 ? 'Choisissez un second run à comparer.' : 'Choisissez deux runs pour les comparer.'}
                  </p>
                )}
              </div>
              <RunList runs={runs} personaNames={personaNames} picked={picked} onPick={pick} />
              {feed.hasMore && (
                <Button type="button" variant="outline" loading={feed.isLoadingMore} onClick={feed.loadMore}>
                  Exécutions plus anciennes
                </Button>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  )
}
