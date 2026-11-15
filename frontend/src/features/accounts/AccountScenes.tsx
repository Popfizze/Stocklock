import { useMemo } from 'react'
import { ACCOUNT_IDS, type AccountId, type TaxProfile, type TaxRules } from '@/api/accounts'
import { Tile3D } from '@/components/three'
import { buildingScene, featureScene, GOAL_PREFIX, goalScene } from './sceneModel'
import type { Goal } from './learn'
import type { Level } from './viewOptions'

const TREATMENTS: Array<[swatch: string, text: string]> = [
  ['bg-success', 'Avantage fiscal'],
  ['bg-tile-5', 'Neutre ou reporté'],
  ['bg-warning', 'Impôt ou perte'],
]

function Legend({ items }: { items: Array<[swatch: string, text: string]> }) {
  return (
    <ul aria-label="Légende de la scène" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([swatch, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-3 ${swatch}`} /> {text}
        </li>
      ))}
    </ul>
  )
}

interface BuildingsProps {
  rules: TaxRules
  level: Level
  accounts: AccountId[]
  profile?: TaxProfile
  /** A building was clicked: its account's detail opens below. */
  onSelect: (account: AccountId) => void
}

// 3D — what each account does, at a glance: a building per account, three floors (paying in, growing, withdrawing)
// coloured by their tax treatment, a flat ink roof where a contribution ceiling applies; clicking opens its detail.
export function AccountBuildings({ rules, level, accounts, profile, onSelect }: BuildingsProps) {
  const scene = useMemo(() => buildingScene(rules, accounts, level, profile), [rules, accounts, level, profile])
  return (
    <div className="space-y-2 rounded-3xl border border-border p-4 sm:p-5">
      <p className="eyebrow">Les comptes en immeubles · de bas en haut : on verse, ça pousse, on retire</p>
      <Tile3D
        tiles={scene.tiles}
        view="front"
        onSelect={(tile) => {
          const account = ACCOUNT_IDS.find((id) => id === tile.id)
          if (account) onSelect(account)
        }}
        label={`Les comptes en immeubles de trois étages (on verse, ça pousse, on retire), chaque étage à la couleur de son traitement fiscal, un toit plat là où un plafond de cotisation s'applique. ${scene.reading.join('. ')}. Le même parcours suit en texte.`}
        className="h-60 sm:h-72"
      />
      <Legend items={[...TREATMENTS, ['bg-tile-1', 'Toit : plafond de cotisation']]} />
    </div>
  )
}

// 3D — the shape of each account: the grid of properties as a relief, a column per account and a row per property;
// a full tile says yes, a half tile in part, a flat one no.
export function FeatureRelief({ accounts }: { accounts: AccountId[] }) {
  const scene = useMemo(() => featureScene(accounts), [accounts])
  return (
    <div className="space-y-2 rounded-3xl border border-border p-4 sm:p-5">
      <p className="eyebrow">Le relief de chaque compte · une rangée par propriété</p>
      <Tile3D
        tiles={scene.tiles}
        view="iso"
        label={`Ce que chaque compte permet, en relief : une colonne par compte, une rangée par propriété ; tuile haute pour oui, mi-haute pour en partie, plate pour non. ${scene.reading.join(' ; ')}. Le tableau qui suit donne chaque réponse.`}
        className="h-72 sm:h-96"
      />
      <Legend
        items={[
          ['bg-tile-1', 'Oui'],
          ['bg-tile-4', 'En partie'],
          ['bg-tile-7', 'Non ou sans objet'],
        ]}
      />
    </div>
  )
}

interface GoalPathsProps {
  goals: Goal[]
  accounts: AccountId[]
  chosen: Goal['id']
  onChoose: (goal: Goal['id']) => void
}

// 3D — from a goal to the accounts whose rules apply to it: the chosen goal turns ink, its tiles travel to those
// accounts, and each one rises in the colour of what its rule does there. No order of preference.
export function GoalPaths({ goals, accounts, chosen, onChoose }: GoalPathsProps) {
  const scene = useMemo(() => goalScene(goals, accounts, chosen), [goals, accounts, chosen])
  return (
    <div className="space-y-2 rounded-3xl border border-border p-4 sm:p-5">
      <p className="eyebrow">De l’objectif aux comptes · cliquez un objectif</p>
      <Tile3D
        tiles={scene.tiles}
        flows={scene.flows}
        view="front"
        onSelect={(tile) => {
          const goal = goals.find((candidate) => `${GOAL_PREFIX}${candidate.id}` === tile.id)
          if (goal) onChoose(goal.id)
        }}
        label={`Le chemin d'un objectif vers les comptes dont les règles s'y appliquent, sans ordre de préférence : ${scene.reading}. La liste qui suit donne le détail de chaque objectif.`}
        className="h-64 sm:h-80"
      />
      <p aria-live="polite" className="text-sm">
        {scene.reading}.
      </p>
      <Legend items={TREATMENTS} />
    </div>
  )
}
