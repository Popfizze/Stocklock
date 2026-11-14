import { useMemo } from 'react'
import { useArtifactPreview, type RunArtifact } from '@/api/runs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { columnSummary, formatBytes, KIND_LABELS, PAGE_SIZE, shapeGlyph, shapeText } from './artifactModel'

interface ArtifactCardProps {
  runId: string
  artifact: RunArtifact
  stageName: string | null
  open: boolean
  onToggle: () => void
}

/**
 * One generated element, summarized before it is opened: its silhouette in tiles (columns ×
 * rows), its size, and the distribution of a key column read from its first page.
 */
export function ArtifactCard({ runId, artifact, stageName, open, onToggle }: ArtifactCardProps) {
  // The first page is the one the grid opens on: read once, used twice.
  const preview = useArtifactPreview(runId, artifact.id, 0, PAGE_SIZE)
  const rows = preview.data?.total_rows ?? artifact.rows
  const columns = preview.data ? preview.data.columns.length : artifact.columns
  const summary = useMemo(
    () => (preview.data ? columnSummary(preview.data.columns, preview.data.rows) : null),
    [preview.data],
  )
  const glyph = shapeGlyph(rows, columns)
  const size = formatBytes(artifact.size_bytes)

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        'flex h-full w-full flex-col gap-3 rounded-3xl border border-border p-5 text-left outline-none transition-colors hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        open && 'border-foreground bg-secondary',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="eyebrow block truncate">{stageName ?? 'Run'}</span>
          <span className="block font-display text-lg leading-tight break-words">{artifact.title}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${glyph.columns * 5 - 1} ${glyph.rows * 5 - 1}`}
          className="h-12 w-14 shrink-0"
          preserveAspectRatio="xMaxYMin meet"
        >
          {Array.from({ length: glyph.columns * glyph.rows }, (_, index) => (
            <rect
              key={index}
              x={(index % glyph.columns) * 5}
              y={Math.floor(index / glyph.columns) * 5}
              width={4}
              height={4}
              // The header row is ink.
              className={index < glyph.columns ? 'fill-tile-2' : 'fill-tile-6'}
            />
          ))}
        </svg>
      </span>

      <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
        <span className="font-medium">{shapeText(rows, columns)}</span>
        <Badge variant="secondary">{artifact.format === 'table' ? KIND_LABELS[artifact.kind] : artifact.format}</Badge>
        {size && <span className="text-muted-foreground">{size}</span>}
      </span>

      {summary ? (
        <span className="mt-auto block space-y-1">
          <svg role="img" aria-label={`Répartition — ${summary.caption}`} viewBox={`0 0 ${summary.bars.length * 6 - 1} 20`} className="h-10 w-full" preserveAspectRatio="none">
            {summary.bars.map((bar, index) => {
              const height = Math.max(1, Math.round(bar * 20))
              return <rect key={index} x={index * 6} y={20 - height} width={5} height={height} className={summary.kind === 'numeric' ? 'fill-tile-3' : 'fill-tile-5'} />
            })}
          </svg>
          <span className="block truncate text-xs text-muted-foreground">{summary.caption}</span>
        </span>
      ) : (
        <span className="mt-auto block text-xs text-muted-foreground">
          {preview.isPending ? 'Lecture de l’aperçu…' : preview.isError ? 'Aperçu indisponible.' : (preview.data.note ?? 'Pas de colonne à résumer.')}
        </span>
      )}
      {artifact.path && <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground">{artifact.path}</span>}
    </button>
  )
}
