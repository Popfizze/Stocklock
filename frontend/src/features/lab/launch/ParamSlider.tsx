import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatNumber, type NumberSpec } from './launchModel'

interface ParamSliderProps extends NumberSpec {
  label: string
  help?: string
  value: number
  /** The prefilled value: a different one is marked « Modifié » and can be reset. */
  defaultValue: number
  onChange: (value: number) => void
  className?: string
}

/** A number as a tile you drag: the value in large figures over a slider, marked when it left its default. */
export function ParamSlider({ label, help, value, defaultValue, min, max, step, format, onChange, className }: ParamSliderProps) {
  const id = useId()
  const changed = value !== defaultValue
  const text = formatNumber(value, format)

  return (
    <div className={cn('flex flex-col gap-2 rounded-3xl border border-border p-5', changed && 'border-foreground', className)}>
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className="eyebrow">
          {label}
        </label>
        {changed && (
          <span className="flex items-center gap-1">
            <Badge variant="warning">Modifié</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remettre ${label} à ${formatNumber(defaultValue, format)}`}
              onClick={() => onChange(defaultValue)}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>
      <output htmlFor={id} className="display text-3xl">
        {text}
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={Math.max(max, value)}
        step={step}
        value={value}
        aria-valuetext={text}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-6 w-full cursor-pointer accent-primary"
      />
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  )
}
