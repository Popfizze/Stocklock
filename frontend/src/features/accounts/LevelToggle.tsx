import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LEVELS, parseLevel, type Level } from './viewOptions'

const HINTS: Record<Level, string> = {
  simple: "L'essentiel en mots, sans chiffres.",
  normale: 'Les explications et les principaux graphiques.',
  complexe: 'Tous les chiffres, les règles détaillées et les sources.',
}

interface LevelToggleProps {
  level: Level
  onLevelChange: (level: Level) => void
  /** Hide the one-line hint under the switch (compact places such as the stock page). */
  hideHint?: boolean
}

/** Simple, Normale, Complexe: each level shows more detail than the one before. */
export function LevelToggle({ level, onLevelChange, hideHint = false }: LevelToggleProps) {
  return (
    <div className="space-y-1.5">
      <ToggleGroup
        type="single"
        value={level}
        onValueChange={(value) => value && onLevelChange(parseLevel(value))}
        aria-label="Niveau de détail"
      >
        {LEVELS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!hideHint && <p className="text-xs text-muted-foreground">{HINTS[level]}</p>}
    </div>
  )
}
