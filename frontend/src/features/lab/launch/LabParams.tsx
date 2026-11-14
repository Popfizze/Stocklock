import { useId } from 'react'
import type { LabInput, LabInputValue, LabScalar, LabStageDef } from '@/api/lab'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { choiceKey, optionId, type OptionValues } from '../labForm'
import { numberSpec } from './launchModel'
import { ParamSlider } from './ParamSlider'
import { TickerTiles } from './TickerTiles'

interface LabInputsProps {
  inputs: LabInput[]
  values: Record<string, LabInputValue>
  onChange: (name: string, value: LabInputValue) => void
}

/** A step's inputs, each on its own tile with the control that fits: slider, switch, tiles of titles, date. */
export function LabInputs({ inputs, values, onChange }: LabInputsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {inputs.map((input) => (
        <InputTile key={input.name} input={input} value={values[input.name]} onChange={(value) => onChange(input.name, value)} />
      ))}
    </div>
  )
}

function InputTile({ input, value, onChange }: { input: LabInput; value: LabInputValue | undefined; onChange: (value: LabInputValue) => void }) {
  const id = useId()
  if (input.type === 'number') {
    return (
      <ParamSlider
        label={input.label}
        help={input.help}
        value={typeof value === 'number' ? value : 0}
        defaultValue={typeof input.default === 'number' ? input.default : 0}
        onChange={onChange}
        {...numberSpec(input)}
      />
    )
  }
  const changed = JSON.stringify(value ?? null) !== JSON.stringify(input.default ?? null)
  const wide = input.type === 'textarea' || input.type === 'tickers'
  return (
    <div className={cn('flex flex-col gap-3 rounded-3xl border border-border p-5', changed && 'border-foreground', wide && 'sm:col-span-2')}>
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} id={`${id}-label`} className="eyebrow">
          {input.label}
        </label>
        {changed && <Badge variant="warning">Modifié</Badge>}
      </div>
      {input.type === 'boolean' ? (
        <ToggleGroup type="single" aria-labelledby={`${id}-label`} value={value === true ? 'oui' : 'non'} onValueChange={(next) => next && onChange(next === 'oui')}>
          <ToggleGroupItem value="non">Non</ToggleGroupItem>
          <ToggleGroupItem value="oui">Oui</ToggleGroupItem>
        </ToggleGroup>
      ) : input.type === 'tickers' ? (
        <TickerTiles label={input.label} tickers={Array.isArray(value) ? value : []} cap={40} onChange={onChange} />
      ) : input.type === 'textarea' ? (
        <Textarea id={id} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className="min-h-24" />
      ) : (
        <Input
          id={id}
          type={input.type === 'date' ? 'date' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(input.type === 'date' ? event.target.value : event.target.value.toUpperCase())}
        />
      )}
      {input.help && <p className="text-xs text-muted-foreground">{input.help}</p>}
    </div>
  )
}

interface LabOptionsProps {
  stages: LabStageDef[]
  values: OptionValues
  onChange: (id: string, value: LabScalar) => void
}

/** Each stage's options as a switch between its choices; a choice that is not the default is marked. */
export function LabOptions({ stages, values, onChange }: LabOptionsProps) {
  const withOptions = stages.filter((stage) => stage.options.length > 0)
  if (withOptions.length === 0) return null
  return (
    <ul className="divide-y divide-border border-y border-border">
      {withOptions.map((stage) => (
        <li key={stage.id} className="grid gap-x-6 gap-y-3 py-4 lg:grid-cols-[14rem_1fr]">
          <div>
            <p className="eyebrow">{stage.layer}</p>
            <p className="font-display text-lg">{stage.name}</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {stage.options.map((option) => {
              const id = optionId(stage.id, option.key)
              const changed = choiceKey(values[id]) !== choiceKey(option.lab_default ?? option.default)
              return (
                <div key={id} className="space-y-1.5">
                  <p id={`option-${id}`} className="flex items-center gap-2 text-sm" title={option.description}>
                    {option.label}
                    {changed && <Badge variant="warning">Modifié</Badge>}
                  </p>
                  <ToggleGroup
                    type="single"
                    aria-labelledby={`option-${id}`}
                    value={choiceKey(values[id])}
                    onValueChange={(next) => {
                      const choice = option.choices.find((candidate) => choiceKey(candidate.value) === next)
                      if (choice) onChange(id, choice.value)
                    }}
                  >
                    {option.choices.map((choice) => (
                      <ToggleGroupItem key={choiceKey(choice.value)} value={choiceKey(choice.value)}>
                        {choice.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )
            })}
          </div>
        </li>
      ))}
    </ul>
  )
}
