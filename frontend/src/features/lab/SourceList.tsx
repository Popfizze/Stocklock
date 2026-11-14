import type { LabSource } from '@/api/lab'

interface SourceListProps {
  sources: LabSource[]
}

/** Each source as a link when it has a `url`, with its `as_of` date. */
export function SourceList({ sources }: SourceListProps) {
  return (
    <ul className="space-y-1 text-sm">
      {sources.map((source) => (
        <li key={source.id}>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              {source.title}
            </a>
          ) : (
            <span>{source.title}</span>
          )}
          {source.as_of && <span className="text-muted-foreground"> — au {source.as_of}</span>}
        </li>
      ))}
    </ul>
  )
}
