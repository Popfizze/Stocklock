/**
 * The 3D scenes of the Comptes tab's reading views, as plain tile lists. They draw the same facts as
 * the diagrams and grids next to them (`comparison.ts`, `learn.ts`): nothing here ranks the accounts.
 */

import type { AccountId, TaxProfile, TaxRules } from '@/api/accounts'
import type { SceneFlow, SceneTile, TileTone } from '@/components/three'
import { FEATURES, FLOW_STEPS, journey, type Has, type Tone } from './comparison'
import { formatMoney } from './format'
import type { Goal } from './learn'
import { atLeast, type Level } from './viewOptions'

/** The tax treatments as tile tones: no tax, neutral or deferred, tax paid or lost. */
const TREATMENT_TONES: Record<Tone, TileTone> = { advantage: 'up', neutral: 5, tax: 'warn' }
const TREATMENT_WORDS: Record<Tone, string> = { advantage: 'avantage fiscal', neutral: 'neutre ou reporté', tax: 'impôt ou perte' }
const SHORT: Record<AccountId, string> = { CELI: 'CELI', REER: 'REER', CELIAPP: 'CELIAPP', 'Non enregistré': 'Non enr.' }

/** Whether the profile meets an account's opening conditions: a fact about the profile, not a suggestion. */
export function canOpen(account: AccountId, profile: TaxProfile, rules: TaxRules): boolean {
  if (account === 'CELIAPP') return profile.fhsa_eligible
  if (account === 'CELI') return profile.age >= rules.tfsa.eligibility_age
  if (account === 'REER') return profile.income > 0
  return true
}

/** This year's contribution ceiling, in words; null for the account that has none. */
export function ceilingOf(account: AccountId, rules: TaxRules): string | null {
  if (account === 'CELI') return formatMoney(rules.tfsa.annual_limits[String(rules.year)])
  if (account === 'REER') return formatMoney(rules.rrsp.dollar_limit)
  if (account === 'CELIAPP') return formatMoney(rules.fhsa.annual_limit)
  return null
}

const BUILDING_GAP = 3
/** The three floors of a building: the money comes in, grows, goes out (the flow's last three steps). */
const FLOORS = FLOW_STEPS.slice(1)
const FLOOR_NAMES = ['On verse', 'Ça pousse', 'On retire']

export interface BuildingScene {
  tiles: SceneTile[]
  /** One sentence per account: the scene in words. */
  reading: string[]
}

/**
 * « Le parcours » : each account is a three-floor building — paying in, growing, withdrawing — and each
 * floor takes the colour of its tax treatment. A flat ink roof is the contribution ceiling: the account
 * without one stays open to the sky. An account the profile cannot open is drawn as an empty lot.
 */
export function buildingScene(rules: TaxRules, accounts: AccountId[], level: Level, profile?: TaxProfile): BuildingScene {
  const lanes = journey(rules)
  const tiles: SceneTile[] = []
  const reading: string[] = []
  // The floors' names, on a small scale model at the left.
  FLOOR_NAMES.forEach((name, floor) => {
    tiles.push({ x: -2.4, z: 0, w: 0.9, d: 0.9, y: floor, h: 0.92, tone: 7, tag: name, tagShort: String(floor + 1), tagFirst: true })
  })
  accounts.forEach((account, index) => {
    const x = index * BUILDING_GAP
    const open = profile ? canOpen(account, profile, rules) : true
    const ceiling = ceilingOf(account, rules)
    const steps = lanes[account].slice(1)
    const words = steps.map((node, floor) => `${FLOORS[floor].label.toLowerCase()}, ${node.label.toLowerCase()} (${TREATMENT_WORDS[node.tone]})`)
    reading.push(`${account} : ${words.join(' ; ')} ; ${ceiling ? 'plafond de cotisation' : 'aucun plafond'}${open ? '' : ` ; ${profile?.name} n'y est pas admissible`}`)
    tiles.push({ x, z: 0, w: 2.2, d: 2.2, y: -0.14, h: 0.12, tone: 8, tag: account, tagShort: SHORT[account], tagAt: 'base' })
    if (!open) {
      tiles.push({ id: account, x, z: 0, w: 1.6, d: 1.6, h: 0.25, tone: 7, label: `${account} · ${profile?.name} : non admissible`, tag: 'Non admissible', tagShort: 'Non adm.' })
      return
    }
    steps.forEach((node, floor) => {
      tiles.push({
        id: account,
        x,
        z: 0,
        w: 1.6,
        d: 1.6,
        y: floor,
        h: 0.92,
        tone: TREATMENT_TONES[node.tone],
        label: `${account} · ${FLOORS[floor].label} : ${node.label}`,
      })
    })
    if (ceiling) {
      // Figures stay out of the Simple level, on the scene as in the text.
      const tag = atLeast(level, 'normale') ? `Plafond ${rules.year}\n${ceiling}` : 'Plafonné'
      tiles.push({ id: account, x, z: 0, w: 1.9, d: 1.9, y: 3, h: 0.14, tone: 1, label: `${account} · plafond de cotisation ${rules.year} : ${ceiling}`, tag, tagShort: 'Plafonné' })
    } else {
      tiles.push({ id: account, x, z: 0, w: 0.5, d: 0.5, y: 3, h: 0.02, tone: 5, label: `${account} · aucun plafond`, tag: 'Sans plafond', tagShort: 'Ouvert' })
    }
  })
  return { tiles, reading }
}

const HAS_HEIGHT: Record<Has, number> = { yes: 1.4, partial: 0.7, no: 0.1, na: 0.1 }
const HAS_TONE: Record<Has, TileTone> = { yes: 1, partial: 4, no: 7, na: 7 }
const HAS_WORD: Record<Has, string> = { yes: 'oui', partial: 'en partie', no: 'non', na: 'sans objet' }
/** A property's name, short enough to be written at the head of its row. */
const FEATURE_TAGS = ["Réduit l'impôt", 'Croît à l’abri', 'Retrait sans impôt', 'Retrait en tout temps', 'Redevient cotisable', 'Plafonné', '1re propriété', 'Dividendes US', 'Perte déductible']

/**
 * « Côte à côte » : the grid of properties as a relief — one column per account, one row per property;
 * a full tile says yes, a half tile in part, a flat one no. The relief of a column is the account's shape.
 */
export function featureScene(accounts: AccountId[]): { tiles: SceneTile[]; reading: string[] } {
  const tiles: SceneTile[] = []
  FEATURES.forEach((feature, row) => {
    const z = row * 1.15
    tiles.push({ x: -1.5, z, w: 1, d: 0.9, h: 0.1, tone: 6, tag: FEATURE_TAGS[row] ?? feature.label, tagShort: String(row + 1), tagFirst: true })
    accounts.forEach((account, column) => {
      const { has } = feature.values[account]
      tiles.push({ x: column * 1.6, z, w: 1.3, d: 0.95, h: HAS_HEIGHT[has], tone: HAS_TONE[has], label: `${account} · ${feature.label} : ${HAS_WORD[has]}` })
    })
  })
  accounts.forEach((account, column) => {
    tiles.push({ x: column * 1.6, z: (FEATURES.length - 1) * 1.15 + 0.9, w: 1.3, d: 0.3, h: 0.12, tone: 3, tag: account, tagShort: SHORT[account], tagAt: 'base', tagFirst: true })
  })
  const reading = accounts.map((account) => {
    const count = (has: Has) => FEATURES.filter((feature) => feature.values[account].has === has).length
    return `${account} : ${count('yes')} oui, ${count('partial')} en partie`
  })
  return { tiles, reading }
}

export const GOAL_PREFIX = 'objectif:'
const GOAL_TAGS: Record<Goal['id'], string> = { cash: 'Disponible', home: '1re propriété', retirement: 'Retraite', tax: 'Impôt de l’année', unlimited: 'Sans plafond', us: 'Dividendes US' }

/**
 * « Par objectif » : the goals stand in front, the accounts behind. The chosen goal turns ink and its
 * tiles travel to every account whose rules apply to it; each of those accounts rises in the colour of
 * what its rule does there (advantage, neutral, tax). Nothing ranks them: the order is the fixed one.
 */
export function goalScene(goals: Goal[], accounts: AccountId[], chosen: Goal['id']): { tiles: SceneTile[]; flows: SceneFlow[]; reading: string } {
  const tiles: SceneTile[] = []
  const flows: SceneFlow[] = []
  const goal = goals.find((candidate) => candidate.id === chosen) ?? goals[0]
  const span = (goals.length - 1) * 1.9
  const accountX = (index: number) => (accounts.length === 1 ? span / 2 : (index * span) / (accounts.length - 1))
  goals.forEach((candidate, index) => {
    const on = candidate.id === goal?.id
    tiles.push({ id: `${GOAL_PREFIX}${candidate.id}`, x: index * 1.9, z: 3.2, w: 1.5, d: 1.1, h: on ? 0.7 : 0.25, tone: on ? 1 : 6, label: candidate.title, tag: GOAL_TAGS[candidate.id], tagShort: on ? GOAL_TAGS[candidate.id] : undefined, tagAt: 'base', tagFirst: on })
  })
  const applies: string[] = []
  accounts.forEach((account, index) => {
    const rule = goal?.accounts.find((item) => item.account === account)
    const x = accountX(index)
    tiles.push({ x, z: 0, w: 2, d: 1.6, y: -0.14, h: 0.12, tone: 8 })
    tiles.push({
      id: account,
      x,
      z: 0,
      w: 1.5,
      d: 1.2,
      h: rule ? 2.2 : 0.2,
      tone: rule ? TREATMENT_TONES[rule.tone] : 7,
      label: rule ? `${account} · ${rule.text}` : `${account} · aucune règle propre à cet objectif`,
      tag: rule ? `${account}\n${rule.text}` : account,
      tagShort: SHORT[account],
      tagFirst: Boolean(rule),
    })
    if (rule && goal) {
      applies.push(`${account} (${rule.text.toLowerCase()})`)
      flows.push({ from: [goals.indexOf(goal) * 1.9, 2.6], to: [x, 0.9], count: 3, tone: TREATMENT_TONES[rule.tone] })
    }
  })
  return { tiles, flows, reading: goal ? `« ${goal.title} » mène à ${applies.join(', ')}` : '' }
}
