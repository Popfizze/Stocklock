import { useId } from 'react'
import type { LabOption, LabScalar, LabSource, LabStageDef, LabStageResult } from '@/api/lab'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { choiceKey, optionId, type OptionValues } from './labForm'
import { StageResultView } from './StageResultView'

interface PipelineStagesProps {
  stages: LabStageDef[]
  values: OptionValues
  onChange: (id: string, value: LabScalar) => void
  /** The last run's result of each stage, by stage id. */
  results?: Map<string, LabStageResult>
  /** The last run's sources, for datasets that cite one the stage does not list. */
  runSources?: LabSource[]
}

export function PipelineStages({
  stages,
  values,
  onChange,
  results,
  runSources,
}: PipelineStagesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-border">
          {stages.map((stage, index) => {
            const result = results?.get(stage.id)
            return (
              <li key={stage.id} className="space-y-4 py-6 first:pt-0 last:pb-0">
                <div>
                  <h3 className="font-medium">
                    {index + 1}. {stage.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </div>
                {stage.options.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {stage.options.map((option) => {
                      const id = optionId(stage.id, option.key)
                      return (
                        <OptionSelect
                          key={id}
                          option={option}
                          value={values[id]}
                          onChange={(value) => onChange(id, value)}
                        />
                      )
                    })}
                  </div>
                )}
                {result && <StageResultView result={result} runSources={runSources} />}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

interface OptionSelectProps {
  option: LabOption
  value: LabScalar | undefined
  onChange: (value: LabScalar) => void
}

function OptionSelect({ option, value, onChange }: OptionSelectProps) {
  const id = useId()

  const handleChange = (key: string) => {
    const choice = option.choices.find((candidate) => choiceKey(candidate.value) === key)
    if (choice) onChange(choice.value)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{option.label}</Label>
      <Select value={choiceKey(value)} onValueChange={handleChange}>
        <SelectTrigger
          id={id}
          className="w-full"
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
