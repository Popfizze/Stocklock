import { useState } from 'react'
import type { StockMovesResult } from '@/api/moves'
import { Tile3D } from '@/components/three'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EventLine } from './EventLine'
import { TREND_TEXT, formatLongDate, trendOf } from './format'
import { EXPLANATIONS, signedRatio } from './movesMeta'
import { columnOf, ribbonColumns, ribbonTiles } from './movesTiles'

const ratio = (value: number | null) => (value === null ? '—' : signedRatio(value))

interface MovesRibbonProps {
  result: StockMovesResult
}

// 3D — the story of the period: the title's path as a ribbon of tiles with its index as a thin line across it, and each
// marked move as a spike in front, capped when a dated event goes with it. Pointing reads a session,
// clicking pins it; the two buttons walk from one marked move to the next.
export function MovesRibbon({ result }: MovesRibbonProps) {
  const [pinned, setPinned] = useState<string | null>(null)
  const columns = ribbonColumns(result)
  const benchmark = result.benchmark ?? 'l’indice'
  const marked = [...result.moves].sort((a, b) => a.date.localeCompare(b.date))
  const at = pinned === null ? -1 : marked.findIndex((move) => move.date === pinned)
  const step = (direction: 1 | -1) => {
    if (marked.length === 0) return
    let next = at + direction
    if (at === -1) {
      // From a session that is not a marked move: the nearest move on that side of it.
      const before = pinned === null ? marked.length : marked.filter((move) => move.date < pinned).length
      next = direction === 1 ? (pinned === null ? 0 : before) : before - 1
    }
    setPinned(marked[Math.min(marked.length - 1, Math.max(0, next))].date)
  }

  return (
    <div className="space-y-3">
      <Tile3D
        tiles={ribbonTiles(result, columns, pinned)}
        view="front"
        onSelect={(tile) => tile.id && setPinned(tile.id)}
        label={`La période en ruban de tuiles, du ${formatLongDate(result.window.start)} au ${formatLongDate(result.window.end)} : ${result.ticker} ${ratio(result.returns.asset)}, ${benchmark} ${ratio(result.returns.benchmark)}, et ${marked.length} mouvement${marked.length > 1 ? 's' : ''} marquant${marked.length > 1 ? 's' : ''} en pics. Chaque mouvement est décrit dans la liste « Mouvements marquants ».`}
        className="h-64 sm:h-72"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="max-w-md text-xs text-muted-foreground">
          Le ruban sombre est le parcours de {result.ticker} ; le trait clair qui le traverse, celui de {benchmark}. Devant, les
          mouvements marquants en pics, coiffés d’une tuile quand un événement daté les accompagne. Pointez pour
          lire une séance, cliquez pour l’épingler (un mât la marque).
        </p>
        {marked.length > 0 && (
          <div role="group" aria-label="Parcourir les mouvements marquants" className="flex gap-1">
            <Button type="button" variant="outline" size="xs" onClick={() => step(-1)}>
              Mouvement précédent
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => step(1)}>
              Mouvement suivant
            </Button>
          </div>
        )}
      </div>
      {pinned !== null && <Readout result={result} date={pinned} benchmark={benchmark} />}
    </div>
  )
}

/** The pinned session in words: where the title and its index stood, and the marked move of that day if any. */
function Readout({ result, date, benchmark }: { result: StockMovesResult; date: string; benchmark: string }) {
  const point = result.series[columnOf(result.series, date)]
  const move = result.moves.find((candidate) => candidate.date === date)
  const meta = move ? EXPLANATIONS[move.explanation] : null
  return (
    <div aria-live="polite" className="space-y-2 rounded-2xl border border-border p-5 text-sm">
      <p className="font-display text-xl">Séance du {formatLongDate(date)}</p>
      <p className="text-muted-foreground tabular-nums">
        Depuis le début de la période : {result.ticker}{' '}
        <strong className={cn('font-medium', point?.asset != null && TREND_TEXT[trendOf(point.asset)])}>
          {ratio(point?.asset ?? null)}
        </strong>
        , {benchmark} {ratio(point?.benchmark ?? null)}.
      </p>
      {move && meta ? (
        <>
          <p>
            <Badge variant={meta.variant} className="mr-2 align-middle">
              {meta.label}
            </Badge>
            Ce jour-là, le titre a varié de <strong className="tabular-nums">{signedRatio(move.asset)}</strong> contre{' '}
            {signedRatio(move.benchmark)} pour {benchmark} : un écart de{' '}
            <strong className="tabular-nums">{signedRatio(move.abnormal)}</strong>.
          </p>
          {move.event && (
            <p>
              <EventLine event={move.event} />
            </p>
          )}
          <p className="text-muted-foreground">{move.reason}</p>
        </>
      ) : (
        <p className="text-muted-foreground">Pas de mouvement marquant ce jour-là : le titre a suivi son marché.</p>
      )}
    </div>
  )
}
