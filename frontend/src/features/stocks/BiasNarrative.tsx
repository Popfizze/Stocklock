import { Fragment } from 'react'

/** Display the narrator's plain text safely, without internal citation IDs or raw markdown. */
export function BiasNarrative({ answer }: { answer: string }) {
  const text = answer
    .replace(/^\s*(?:\*\*)?analyse\s+(?:pour\b|de recul\b)[^\n]*\n+/i, '')
    .replace(/[ \t]*\[[\w.:-]+\]/g, '')
    .replace(/[ \t]+([,.])/g, '$1')
    .trim()
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g)

  return <p className="whitespace-pre-line text-sm">{segments.map((segment, index) =>
    segment.startsWith('**') && segment.endsWith('**')
      ? <strong key={index}>{segment.slice(2, -2)}</strong>
      : <Fragment key={index}>{segment.replace(/\*\*/g, '')}</Fragment>,
  )}</p>
}
