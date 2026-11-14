import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleMinus } from 'lucide-react'
import { ACCOUNT_IDS } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { JOURNEY, JOURNEY_STEPS, type JourneyStage, type StageTone } from './comparison'

const TONES: Record<StageTone, { icon: typeof CircleCheck; box: string; iconClass: string; label: string }> = {
  advantage: {
    icon: CircleCheck,
    box: 'border-success/40 bg-success/10',
    iconClass: 'text-success',
    label: 'Avantage fiscal',
  },
  neutral: {
    icon: CircleMinus,
    box: 'border-border bg-muted',
    iconClass: 'text-muted-foreground',
    label: 'Neutre',
  },
  tax: {
    icon: CircleAlert,
    box: 'border-warning/40 bg-warning/10',
    iconClass: 'text-warning',
    label: 'Impôt à payer',
  },
}

/** Diagram: the path of one dollar through each account, from contribution to withdrawal. */
export function DollarJourney() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Le parcours d'un dollar</CardTitle>
        <CardDescription>
          Où l'impôt intervient-il ? À l'entrée, pendant la croissance ou à la sortie : c'est ce
          qui distingue les quatre comptes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="hidden gap-3 pl-40 text-xs font-medium text-muted-foreground md:flex">
          {JOURNEY_STEPS.map((step) => (
            <span key={step} className="flex-1 text-center">
              {step}
            </span>
          ))}
        </div>

        <ol className="space-y-4 md:space-y-3">
          {ACCOUNT_IDS.map((account) => (
            <li key={account} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <AccountLabel account={account} className="font-semibold md:w-37 md:shrink-0" />
              {JOURNEY[account].map((stage, index) => (
                <JourneyStep key={JOURNEY_STEPS[index]} stage={stage} step={JOURNEY_STEPS[index]} last={index === 2} />
              ))}
            </li>
          ))}
        </ol>

        <ul className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
          {(Object.keys(TONES) as StageTone[]).map((tone) => {
            const { icon: Icon, iconClass, label } = TONES[tone]
            return (
              <li key={tone} className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className={cn('size-3.5', iconClass)} />
                {label}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

interface JourneyStepProps {
  stage: JourneyStage
  step: string
  last: boolean
}

function JourneyStep({ stage, step, last }: JourneyStepProps) {
  const { icon: Icon, box, iconClass, label } = TONES[stage.tone]
  return (
    <>
      <div className={cn('flex flex-1 items-center gap-2 rounded-lg border px-3 py-2', box)}>
        <Icon aria-label={label} className={cn('size-4 shrink-0', iconClass)} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground md:hidden">{step}</p>
          <p className="text-sm font-medium">{stage.label}</p>
          <p className="text-xs text-muted-foreground">{stage.detail}</p>
        </div>
      </div>
      {!last && (
        <>
          <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground md:block" />
          <ChevronDown aria-hidden="true" className="mx-auto size-4 text-muted-foreground md:hidden" />
        </>
      )}
    </>
  )
}
