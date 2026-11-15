import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Feedback = 'pertinent' | 'non_pertinent'

const label: Record<Feedback, string> = {
  pertinent: 'Cette analyse était pertinente',
  non_pertinent: 'Cette analyse n’était pas pertinente',
}

function keyFor(personaId: string, ticker: string) {
  return `stocklock:bias-feedback:${personaId}:${ticker}`
}

/** A private, lightweight quality signal: never sent to the API and kept on this device only. */
export function BiasFeedback({ personaId, ticker }: { personaId: string; ticker: string }) {
  const key = keyFor(personaId, ticker)
  const [feedback, setFeedback] = useState<Feedback | null>(() => {
    const stored = window.localStorage.getItem(key)
    return stored === 'pertinent' || stored === 'non_pertinent' ? stored : null
  })

  const choose = (value: Feedback) => {
    window.localStorage.setItem(key, value)
    setFeedback(value)
  }

  return (
    <section aria-labelledby="bias-feedback-heading" className="rounded-xl border border-border p-4">
      <h4 id="bias-feedback-heading" className="text-sm font-medium">
        Cette analyse vous a-t-elle aidé à prendre du recul ?
      </h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(label) as Feedback[]).map((value) => (
          <Button
            key={value}
            type="button"
            size="xs"
            variant={feedback === value ? 'default' : 'outline'}
            aria-pressed={feedback === value}
            onClick={() => choose(value)}
          >
            {label[value]}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Ce retour est conservé uniquement sur cet appareil et n’est pas transmis.
      </p>
    </section>
  )
}
