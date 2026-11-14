import type { MoveEvent } from '@/api/moves'
import { Badge } from '@/components/ui/badge'
import { CATEGORIES, EVENT_KINDS } from './movesMeta'
import { formatLongDate } from './format'

/**
 * One dated event: its category (politique, direction, …), its source kind and
 * date, then its summary linked to the source.
 */
export function EventLine({ event }: { event: MoveEvent }) {
  const kind = EVENT_KINDS[event.kind] ?? event.kind
  const redated = event.event_date !== event.date
  return (
    <span>
      <Badge variant="secondary" className="mr-1.5 align-middle">{CATEGORIES[event.category] ?? event.category}</Badge>
      <span className="font-medium">{kind}</span>
      {' · '}
      {formatLongDate(event.event_date)}
      {redated && <span className="text-muted-foreground"> (publié le {formatLongDate(event.date)})</span>}
      {' — '}
      {event.url ? (
        <a className="link" href={event.url} target="_blank" rel="noreferrer">
          {event.summary}
        </a>
      ) : (
        event.summary
      )}
      {event.summary_by === 'haiku' && <span className="text-muted-foreground"> (résumé par Claude Haiku)</span>}
    </span>
  )
}
