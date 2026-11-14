import { useState } from 'react'
import type { MarkedMove } from '@/api/moves'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EventLine } from './EventLine'
import { EXPLANATIONS, signedRatio } from './movesMeta'
import { TREND_TEXT, formatLongDate, trendOf } from './format'

const SHOWN = 5

function MoveItem({ move, benchmark }: { move: MarkedMove; benchmark: string }) {
  const meta = EXPLANATIONS[move.explanation]
  const others = move.events.filter((event) => event.id !== move.event?.id)
  // Political and leadership news is always shown; the rest stays folded.
  const context = others.filter((event) => event.category === 'politique' || event.category === 'direction')
  const rest = others.filter((event) => !context.includes(event))
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{formatLongDate(move.date)}</p>
        <Badge variant={meta.variant} title={meta.help}>{meta.label}</Badge>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">Fait : </span>
        le titre a varié de <strong className={cn('tabular-nums', TREND_TEXT[trendOf(move.asset)])}>{signedRatio(move.asset)}</strong>
        {' '}contre {signedRatio(move.benchmark)} pour {benchmark}, soit un écart de{' '}
        <strong className="tabular-nums">{signedRatio(move.abnormal)}</strong> avec ce que prévoit l’indice.
      </p>
      {move.event && (
        <p className="text-sm">
          <span className="text-muted-foreground">{move.explanation === 'fait' ? 'Événement : ' : 'Piste : '}</span>
          <EventLine event={move.event} />
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {move.judged_by === 'haiku' ? `Lien ${move.verdict} selon Claude Haiku : ` : ''}
        {move.reason}
        {move.excerpt && <> « {move.excerpt} »</>}
      </p>
      {context.length > 0 && (
        <div className="text-sm">
          <p className="text-muted-foreground">Contexte politique et de direction :</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {context.map((event) => <li key={`${event.id}-${event.date}`}><EventLine event={event} /></li>)}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Autres événements proches ({rest.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {rest.map((event) => <li key={`${event.id}-${event.date}`}><EventLine event={event} /></li>)}
          </ul>
        </details>
      )}
    </li>
  )
}

interface MoveListProps {
  moves: MarkedMove[]
  benchmark: string
}

/** The marked moves, largest first, each with its facts and its explanation. */
export function MoveList({ moves, benchmark }: MoveListProps) {
  const [showAll, setShowAll] = useState(false)
  if (!moves.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune séance ne s’écarte de plus de 2 σ de ce que prévoit l’indice sur cette période : le titre a suivi son marché.
      </p>
    )
  }
  const shown = showAll ? moves : moves.slice(0, SHOWN)
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {shown.map((move) => <MoveItem key={move.date} move={move} benchmark={benchmark} />)}
      </ul>
      {moves.length > SHOWN && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Afficher moins' : `Afficher les ${moves.length - SHOWN} autres mouvements`}
        </Button>
      )}
    </div>
  )
}
