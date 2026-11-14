import { useId, type FormEvent } from 'react'
import { Loader2, Play } from 'lucide-react'
import type { LabOption, LabScalar, LabStep } from '@/api/lab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { choiceKey, optionId, type InputDraft, type OptionValues } from './labForm'
import { StepInputs } from './StepInputs'

interface LabRunFormProps {
  step: LabStep
  inputs: InputDraft
  options: OptionValues
  onInputChange: (name: string, value: string | boolean) => void
  onOptionChange: (id: string, value: LabScalar) => void
  onSubmit: () => void
  running: boolean
  personaName: string
}

/**
 * The parameters of a lab run: the step's inputs, then each stage's options,
 * prefilled with their defaults; a value that differs from the production
 * default is marked « Modifié ».
 */
export function LabRunForm({
  step,
  inputs,
  options,
  onInputChange,
  onOptionChange,
  onSubmit,
  running,
  personaName,
}: LabRunFormProps) {
  const stagesWithOptions = step.stages.filter((stage) => stage.options.length > 0)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!running) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StepInputs inputs={step.inputs} values={inputs} onChange={onInputChange} personaName={personaName} />

      {stagesWithOptions.length > 0 && (
        <section className="space-y-3">
          <h3 className="eyebrow">Options par étape</h3>
          <ul className="divide-y divide-border border-y border-border">
            {stagesWithOptions.map((stage) => (
              <li key={stage.id} className="grid gap-x-6 gap-y-3 py-4 lg:grid-cols-[14rem_1fr]">
                <div>
                  <p className="text-sm font-medium">
                    {step.stages.indexOf(stage) + 1}. {stage.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {stage.options.map((option) => {
                    const id = optionId(stage.id, option.key)
                    return (
                      <OptionSelect
                        key={id}
                        option={option}
                        value={options[id]}
                        onChange={(value) => onOptionChange(id, value)}
                      />
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button type="submit" size="lg" disabled={running}>
        {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
        {running ? 'Exécution…' : 'Exécuter'}
      </Button>
    </form>
  )
}

interface OptionSelectProps {
  option: LabOption
  value: LabScalar | undefined
  onChange: (value: LabScalar) => void
}

function OptionSelect({ option, value, onChange }: OptionSelectProps) {
  const id = useId()
  const changed = choiceKey(value) !== choiceKey(option.default)

  const handleChange = (key: string) => {
    const choice = option.choices.find((candidate) => choiceKey(candidate.value) === key)
    if (choice) onChange(choice.value)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{option.label}</Label>
        {changed && <Badge variant="warning">Modifié</Badge>}
      </div>
      <Select value={choiceKey(value)} onValueChange={handleChange}>
        <SelectTrigger
          id={id}
          className={cn('w-full', changed && 'border-foreground')}
          aria-describedby={option.description ? `${id}-description` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {option.choices.map((choice) => (
            <SelectItem key={choiceKey(choice.value)} value={choiceKey(choice.value)}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {option.description && (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {option.description}
        </p>
      )}
    </div>
  )
}
