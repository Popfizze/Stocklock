import { ArrowRight } from 'lucide-react'
import type { Persona } from '@/api/personas'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface PersonaCardProps {
  persona: Persona
  onChoose: () => void
}

/** One profile. The whole card is clickable: the name's button stretches over it. */
export function PersonaCard({ persona, onChoose }: PersonaCardProps) {
  return (
    <Card
      variant="interactive"
      className="group relative h-full focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/40"
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-2xl font-semibold tracking-tight">
          <button
            type="button"
            onClick={onChoose}
            aria-label={`Choisir le profil ${persona.name}`}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
          >
            {persona.name}
          </button>
          <ArrowRight
            aria-hidden="true"
            className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </CardTitle>
        <CardDescription>{persona.age} ans</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <p className="text-muted-foreground">{persona.summary}</p>
        <dl className="mt-auto divide-y divide-border border-t border-border">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Tolérance au risque</dt>
            <dd className="text-right font-medium">{persona.risk_tolerance}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Horizon</dt>
            <dd className="text-right font-medium">{persona.horizon}</dd>
          </div>
          {persona.preferences.length > 0 && (
            <div className="flex justify-between gap-4 pt-2.5">
              <dt className="text-muted-foreground">Préférences</dt>
              <dd>
                <ul className="space-y-0.5 text-right font-medium">
                  {persona.preferences.map((preference) => (
                    <li key={preference}>{preference}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
