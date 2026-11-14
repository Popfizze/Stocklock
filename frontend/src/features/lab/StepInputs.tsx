import { useId } from 'react'
import type { LabInput } from '@/api/lab'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { InputDraft } from './labForm'

interface StepInputsProps {
  inputs: LabInput[]
  values: InputDraft
  onChange: (name: string, value: string | boolean) => void
  personaName: string
}

export function StepInputs({ inputs, values, onChange, personaName }: StepInputsProps) {
  const id = useId()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrées</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-persona`}>Profil</Label>
          <Input id={`${id}-persona`} value={personaName} readOnly />
        </div>
        {inputs.map((input) => (
          <InputField
            key={input.name}
            id={`${id}-${input.name}`}
            input={input}
            value={values[input.name]}
            onChange={(value) => onChange(input.name, value)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

interface InputFieldProps {
  id: string
  input: LabInput
  value: string | boolean | undefined
  onChange: (value: string | boolean) => void
}

function InputField({ id, input, value, onChange }: InputFieldProps) {
  const helpId = input.help ? `${id}-help` : undefined
  const text = typeof value === 'string' ? value : ''
  const help = input.help && (
    <p id={helpId} className="text-xs text-muted-foreground">
      {input.help}
    </p>
  )

  if (input.type === 'boolean') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={helpId}
            className="size-4 accent-primary"
          />
          <Label htmlFor={id}>{input.label}</Label>
        </div>
        {help}
      </div>
    )
  }

  return (
    <div className={input.type === 'textarea' ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
      <Label htmlFor={id}>{input.label}</Label>
      {input.type === 'textarea' ? (
        <Textarea
          id={id}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={helpId}
        />
      ) : (
        <Input
          id={id}
          type={input.type === 'date' || input.type === 'number' ? input.type : 'text'}
          step={input.type === 'number' ? 'any' : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={helpId}
        />
      )}
      {help}
    </div>
  )
}
