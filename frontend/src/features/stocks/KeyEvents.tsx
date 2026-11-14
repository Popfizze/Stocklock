import type { KeyEvent } from '@/api/moves'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EventLine } from './EventLine'
import { signedRatio } from './movesMeta'
import { TREND_TEXT, formatLongDate, trendOf } from './format'

const ratio = (value: number | null) => (value === null ? '—' : signedRatio(value))

function Reaction({ event, benchmark }: { event: KeyEvent; benchmark: string }) {
  const { reaction } = event
  const days = reaction.start === reaction.end
    ? `le ${formatLongDate(reaction.start)}`
    : `du ${formatLongDate(reaction.start)} au ${formatLongDate(reaction.end)}`
  return (
    <p className="text-sm text-muted-foreground">
      Réaction {days} : titre{' '}
      <strong className={cn('tabular-nums', reaction.asset !== null && TREND_TEXT[trendOf(reaction.asset)])}>
        {ratio(reaction.asset)}
      </strong>
      , {benchmark} <span className="tabular-nums">{ratio(reaction.benchmark)}</span>, écart propre au titre{' '}
      <span className="tabular-nums">{ratio(reaction.abnormal)}</span>.
    </p>
  )
}

interface KeyEventsProps {
  events: KeyEvent[]
  benchmark: string
}

/**
 * The period's political decisions (U.S. presidency, tariffs and sanctions),
 * rate decisions and leadership changes the title reacted to most, each with
 * the title's and the index's move over two sessions.
 */
export function KeyEvents({ events, benchmark }: KeyEventsProps) {
  return (
    <section className="space-y-3" aria-labelledby="key-events-heading">
      <div className="space-y-1">
        <h4 id="key-events-heading" className="font-display text-lg font-medium">Événements politiques et économiques de la période</h4>
        <p className="text-sm text-muted-foreground">
          Décrets et proclamations de la présidence américaine (tarifs, sanctions, secteur du titre), pics de couverture
          mondiale des tarifs et sanctions, décisions de taux et changements de direction : ceux où le titre a le plus
          bougé sur deux séances. Un événement qui touche tout le marché se voit aussi dans {benchmark} : seul l’écart
          est propre au titre.
        </p>
      </div>
      {events.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {events.map((event) => (
            <li key={`${event.kind}-${event.id}-${event.date}`} className="space-y-1 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <EventLine event={event} />
                {event.on_move && <Badge variant="outline">Mouvement marquant</Badge>}
              </div>
              <Reaction event={event} benchmark={benchmark} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun événement politique, de taux ou de direction repéré sur la période.
        </p>
      )}
    </section>
  )
}
