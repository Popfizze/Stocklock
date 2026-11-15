import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { AccountId, TaxRules } from '@/api/accounts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { AccountLabel } from './AccountLabel'
import { GoalPaths } from './AccountScenes'
import { HomeDownPaymentBar } from './HomeDownPaymentBar'
import { goals, type Goal, type GoalAccount } from './learn'
import { SectionHeading } from './SectionHeading'
import { ToneLegend } from './ToneLegend'
import { TONES } from './tones'
import { atLeast, type Level } from './viewOptions'

interface GoalsViewProps {
  rules: TaxRules
  level: Level
  accounts: AccountId[]
}

/** « Par objectif » : a goal leads to the accounts whose rules apply to it, each with what it allows. */
export function GoalsView({ rules, level, accounts }: GoalsViewProps) {
  const shown = goals(rules)
    .map((goal) => ({ ...goal, accounts: goal.accounts.filter((item) => accounts.includes(item.account)) }))
    .filter((goal) => goal.accounts.length > 0)
  // The goal drawn on the scene: the one clicked there, or the last one opened in the list.
  const [open, setOpen] = useState<string[]>([])
  const [picked, setPicked] = useState<Goal['id'] | null>(null)
  const chosen = shown.find((goal) => goal.id === picked)?.id ?? shown[0]?.id
  const choose = (goal: Goal['id']) => {
    setPicked(goal)
    setOpen((current) => (current.includes(goal) ? current : [...current, goal]))
  }
  const toggle = (next: string[]) => {
    const opened = next.find((id) => !open.includes(id))
    const goal = shown.find((candidate) => candidate.id === opened)
    if (goal) setPicked(goal.id)
    setOpen(next)
  }

  return (
    <section className="space-y-4" aria-labelledby="objectifs-titre">
      <SectionHeading
        id="objectifs-titre"
        title="Selon l'objectif"
        lead="Pour chaque objectif, les comptes dont les règles s'y appliquent, sans ordre de préférence. Cliquez pour voir ce que permet chacun."
      />
      {chosen && <GoalPaths goals={shown} accounts={accounts} chosen={chosen} onChoose={choose} />}
      <Accordion type="multiple" value={open} onValueChange={toggle}>
        {shown.map(({ id, icon: Icon, title, accounts: items }) => (
          <AccordionItem key={id} value={id}>
            <AccordionTrigger className="items-center">
              <span className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2.5 text-base font-semibold">
                  <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                  {title}
                </span>
                <span aria-hidden="true" className="hidden items-center gap-3 font-normal sm:flex">
                  <ArrowRight className="size-4 text-muted-foreground" />
                  {items.map((item) => (
                    <AccountLabel key={item.account} account={item.account} />
                  ))}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                {items.map((item) => (
                  <GoalRow key={item.account} item={item} level={level} />
                ))}
              </ul>
              {id === 'home' && atLeast(level, 'normale') && (
                <div className="mt-4 rounded-lg border border-border bg-background p-4">
                  <HomeDownPaymentBar rules={rules} />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <ToneLegend />
    </section>
  )
}

function GoalRow({ item, level }: { item: GoalAccount; level: Level }) {
  const { icon: Icon, iconClass, label } = TONES[item.tone]
  return (
    <li className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <AccountLabel account={item.account} className="font-semibold" />
      <div className="space-y-0.5">
        <span className="flex items-start gap-2">
          <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
          <span className="font-medium">
            {item.text}
            <span className="sr-only"> ({label})</span>
          </span>
        </span>
        {atLeast(level, 'normale') && <span className="block text-muted-foreground">{item.detail}</span>}
        {atLeast(level, 'complexe') && item.figure && (
          <span className="block text-xs font-medium tabular-nums">{item.figure}</span>
        )}
      </div>
    </li>
  )
}
