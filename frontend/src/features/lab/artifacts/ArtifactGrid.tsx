import { useState } from 'react'
import { useArtifactPreview, type RunArtifact } from '@/api/runs'
import { Button } from '@/components/ui/button'
import { formatCount } from '../runs/runModel'
import { PAGE_SIZE } from './artifactModel'
import { DataGrid } from './DataGrid'

interface ArtifactGridProps {
  runId: string
  artifact: RunArtifact
}

/** An artifact's rows, page by page from the registry. */
export function ArtifactGrid({ runId, artifact }: ArtifactGridProps) {
  const [offset, setOffset] = useState(0)
  const page = useArtifactPreview(runId, artifact.id, offset, PAGE_SIZE)

  if (page.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Lecture de « {artifact.title} »…
      </p>
    )
  }
  if (page.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        « {artifact.title} » n'a pas pu être lu (erreur {page.error.status}).
      </p>
    )
  }

  const { columns, rows, total_rows: total, has_more: hasMore, note } = page.data
  const first = page.data.offset
  return (
    <div className="space-y-3">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune ligne.</p>
      ) : (
        <DataGrid label={`Données : ${artifact.title}`} columns={columns} rows={rows} offset={first} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p className="tabular-nums" aria-live="polite">
          {rows.length > 0 && `Lignes ${formatCount(first + 1)}–${formatCount(first + rows.length)}`}
          {total !== null && ` sur ${formatCount(total)}`}
        </p>
        {(first > 0 || hasMore) && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="xs" disabled={first === 0} onClick={() => setOffset(Math.max(0, first - PAGE_SIZE))}>
              Précédentes
            </Button>
            <Button type="button" variant="outline" size="xs" disabled={!hasMore} onClick={() => setOffset(first + PAGE_SIZE)}>
              Suivantes
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
