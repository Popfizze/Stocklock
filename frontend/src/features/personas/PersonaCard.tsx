import { ArrowRight } from 'lucide-react'
import type { Persona } from '@/api/personas'
import { Tile3D } from '@/components/three'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { personaScene } from './personaScene'

interface PersonaCardProps {
  persona: Persona
  onChoose: () => void
}

/** One profile. The whole card is clickable: the name's button stretches over it. */
export function PersonaCard({ persona, onChoose }: PersonaCardProps) {
  const scene = personaScene(persona.id)
  return (
    <Card
      variant="interactive"
      className="group relative h-full focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/40"
    >
      <CardHeader>
        <p className="eyebrow">{persona.age} ans</p>
        <CardTitle className="flex items-center justify-between text-4xl">
          <button
            type="button"
            onClick={onChoose}
            aria-label={`Choisir le profil ${persona.name}`}
            className="text-left after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none"
          >
            {persona.name}
          </button>
          <ArrowRight
            aria-hidden="true"
            className="size-5 text-muted-foreground transition-transform duration-300 ease-tile group-hover:translate-x-1 group-hover:text-foreground"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {/* 3D — the profile embodied: how tall, how even and how protected its tiles are tells its risk at a glance. */}
        <Tile3D
          tiles={scene.tiles}
          motion="wave"
          caption={false}
          label={`Profil de ${persona.name} en tuiles : ${scene.reading}.`}
          className="h-44"
        />
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
