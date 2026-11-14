import { ListOrdered, Target, Users } from 'lucide-react'
import type { AccountProjection, TaxRules } from '@/api/accounts'
import { Skeleton } from '@/components/ui/skeleton'
import { DecisionGuide } from './DecisionGuide'
import { GoalFinder } from './GoalFinder'
import { PersonaOrder } from './PersonaOrder'
import { SectionHeading } from './SectionHeading'
import { SituationOrders } from './SituationOrders'

interface ChooseTabProps {
  rules: TaxRules
  /** The profile's generic projection; absent while it loads. */
  projection?: AccountProjection
}

/** « Lequel choisir ? » : the profile's order, the usual orders, goals, and the decision guide. */
export function ChooseTab({ rules, projection }: ChooseTabProps) {
  const profile = projection?.profile
  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-labelledby="choisir-ordre">
        <SectionHeading
          id="choisir-ordre"
          icon={ListOrdered}
          title={profile ? `L'ordre conseillé pour ${profile.name}` : "L'ordre conseillé"}
          lead="Remplissez le premier compte jusqu'à son plafond, puis passez au suivant."
        />
        {projection ? (
          <PersonaOrder projection={projection} rules={rules} />
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </section>

      <section className="space-y-4" aria-labelledby="choisir-situations">
        <SectionHeading
          id="choisir-situations"
          icon={Users}
          title="L'ordre selon la situation"
          lead="Quatre situations types et l'ordre habituel des comptes. Règle de pouce : un régime d'employeur qui égale vos cotisations passe avant tout."
        />
        <SituationOrders rules={rules} profile={profile} />
      </section>

      <section className="space-y-4" aria-labelledby="choisir-objectifs">
        <SectionHeading
          id="choisir-objectifs"
          icon={Target}
          title="Mon objectif, le bon compte"
          lead="Partez de ce que vous voulez financer."
        />
        <GoalFinder />
      </section>

      <DecisionGuide rules={rules} profile={profile} />
    </div>
  )
}
