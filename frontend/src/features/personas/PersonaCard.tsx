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
      className="relative h-full focus-within:ring-2 focus-within:ring-ring"
    >
      <CardHeader>
        <CardTitle className="text-xl">
          <button
            type="button"
            onClick={onChoose}
            aria-label={`Choisir le profil ${persona.name}`}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
          >
            {persona.name}
          </button>
        </CardTitle>
        <CardDescription>{persona.age} ans</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>{persona.summary}</p>
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted-foreground">Tolérance au risque</dt>
            <dd>{persona.risk_tolerance}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Horizon</dt>
            <dd>{persona.horizon}</dd>
          </div>
          {persona.preferences.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Préférences</dt>
              <dd>
                <ul className="list-disc pl-4">
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
