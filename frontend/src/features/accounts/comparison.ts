/**
 * Facts behind the Comptes tab's diagrams and grids. Each text comes in up to
 * three depths: `label` (Simple: a few words, no figure), `detail` (Normale:
 * one short explanation) and `figure` (Complexe: the rule's numbers, taken
 * from the versioned rules). Nothing here ranks the accounts or picks one.
 */

import { ArrowDownToLine, ArrowUpFromLine, Sprout, UserCheck, type LucideIcon } from 'lucide-react'
import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

/** How a rule treats the money: no tax, tax reduced or deferred, or tax paid (or lost). */
export type Tone = 'advantage' | 'neutral' | 'tax'

export interface FlowNode {
  label: string
  detail: string
  figure?: string
  tone: Tone
}

export const FLOW_STEPS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'who', label: "Qui peut l'ouvrir", icon: UserCheck },
  { id: 'in', label: 'Quand on verse', icon: ArrowDownToLine },
  { id: 'grow', label: 'Pendant que ça pousse', icon: Sprout },
  { id: 'out', label: 'Quand on retire', icon: ArrowUpFromLine },
]

type Lane = [FlowNode, FlowNode, FlowNode, FlowNode]

/** The path of the money through each account, from opening to withdrawal. */
export function journey(r: TaxRules): Record<AccountId, Lane> {
  const year = String(r.year)
  const sheltered: FlowNode = {
    label: "À l'abri de l'impôt",
    detail: "Intérêts, dividendes et gains ne sont pas imposés tant que l'argent reste dans le compte.",
    tone: 'advantage',
  }
  return {
    CELI: [
      { label: 'Tout adulte résident', detail: 'Résident du Canada avec un numéro d’assurance sociale.', figure: `Dès ${r.tfsa.eligibility_age} ans`, tone: 'neutral' },
      { label: 'Argent déjà imposé', detail: 'La cotisation ne réduit pas l’impôt.', figure: `Plafond ${r.year} : ${formatMoney(r.tfsa.annual_limits[year])}`, tone: 'neutral' },
      { ...sheltered, figure: `Cumul possible depuis 2009 : ${formatMoney(r.tfsa_total_since_2009)}` },
      { label: 'Sans impôt', detail: 'En tout temps ; le montant retiré redevient cotisable l’année suivante.', tone: 'advantage' },
    ],
    REER: [
      { label: 'Avec un revenu de travail', detail: 'Les droits viennent du revenu gagné l’année précédente.', figure: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, au plus ${formatMoney(r.rrsp.dollar_limit)}`, tone: 'neutral' },
      { label: "Réduit l'impôt", detail: 'La cotisation est déduite du revenu imposable.', tone: 'advantage' },
      { ...sheltered, label: 'Impôt reporté', detail: 'Aucun impôt tant que l’argent reste dans le régime.' },
      { label: 'Imposé', detail: 'Chaque retrait est imposé comme un salaire.', figure: `FERR ou rente au plus tard à ${r.rrsp_maturity.max_age} ans`, tone: 'tax' },
    ],
    CELIAPP: [
      { label: 'Premiers acheteurs', detail: 'Sans logement possédé et habité cette année ni les 4 années précédentes.', figure: `${r.fhsa.max_participation_years} ans au plus, avant ${r.fhsa.max_age} ans`, tone: 'neutral' },
      { label: "Réduit l'impôt", detail: 'La cotisation est déductible, comme au REER.', figure: `${formatMoney(r.fhsa.annual_limit)} par an, ${formatMoney(r.fhsa.lifetime_limit)} à vie`, tone: 'advantage' },
      sheltered,
      { label: 'Sans impôt pour la maison', detail: 'Pour une première propriété ; sinon, transfert possible au REER.', tone: 'advantage' },
    ],
    'Non enregistré': [
      { label: 'Tout le monde', detail: 'Aucune condition d’âge ni de revenu.', tone: 'neutral' },
      { label: 'Argent déjà imposé', detail: 'Aucune déduction, aucun plafond.', figure: 'Plafond : aucun', tone: 'neutral' },
      { label: 'Imposé chaque année', detail: 'Intérêts et dividendes sont imposés l’année où ils sont reçus.', figure: `Dividendes canadiens : majorés de ${formatPercent(r.eligible_dividends.gross_up, 0)}, puis crédit d’impôt`, tone: 'tax' },
      { label: 'Gain imposé en partie', detail: 'Seulement à la vente ; une perte réduit les gains imposables.', figure: `${formatPercent(r.capital_gains.inclusion_rate, 0)} du gain est imposable`, tone: 'neutral' },
    ],
  }
}

/** A yes/no property of an account. `partial` says « en partie » and needs its note. */
export type Has = 'yes' | 'no' | 'partial' | 'na'

export interface Feature {
  label: string
  values: Record<AccountId, { has: Has; note?: string }>
}

const yes = { has: 'yes' as const }
const no = { has: 'no' as const }

/** What each account allows, as properties: a check means the account has it, nothing more. */
export const FEATURES: Feature[] = [
  { label: "Réduit l'impôt de l'année de cotisation", values: { CELI: no, REER: yes, CELIAPP: yes, 'Non enregistré': no } },
  {
    label: "Croissance à l'abri de l'impôt",
    values: { CELI: yes, REER: { has: 'yes', note: 'Impôt reporté au retrait' }, CELIAPP: yes, 'Non enregistré': { has: 'no', note: 'Revenus imposés chaque année' } },
  },
  {
    label: 'Retrait sans impôt',
    values: {
      CELI: yes,
      REER: { has: 'no', note: 'Sauf le RAP, à rembourser' },
      CELIAPP: { has: 'partial', note: 'Pour une première propriété' },
      'Non enregistré': { has: 'partial', note: 'Gain imposé en partie' },
    },
  },
  {
    label: 'Retrait possible en tout temps',
    values: {
      CELI: yes,
      REER: { has: 'partial', note: 'Imposé, droits non rendus' },
      CELIAPP: { has: 'partial', note: 'Imposé hors achat' },
      'Non enregistré': yes,
    },
  },
  {
    label: 'Montant retiré redevient cotisable',
    values: { CELI: { has: 'yes', note: "L'année suivante" }, REER: no, CELIAPP: no, 'Non enregistré': { has: 'na', note: 'Sans plafond' } },
  },
  { label: 'Plafond de cotisation', values: { CELI: yes, REER: yes, CELIAPP: yes, 'Non enregistré': no } },
  { label: 'Réservé à une première propriété', values: { CELI: no, REER: no, CELIAPP: yes, 'Non enregistré': no } },
  {
    label: 'Dividendes américains sans retenue',
    values: { CELI: no, REER: yes, CELIAPP: no, 'Non enregistré': { has: 'partial', note: 'Retenue récupérable par crédit' } },
  },
  { label: 'Perte déductible des gains', values: { CELI: no, REER: no, CELIAPP: no, 'Non enregistré': yes } },
]

export interface IncomeRow {
  income: string
  example: string
  cells: Record<AccountId, { tone: Tone; text: string }>
}

/** How each kind of investment income is taxed in each account. */
export const INCOME_TREATMENT: IncomeRow[] = [
  {
    income: 'Dividendes canadiens',
    example: 'RY.TO, ENB.TO, FTS.TO',
    cells: {
      CELI: { tone: 'advantage', text: 'Non imposés' },
      REER: { tone: 'neutral', text: 'Imposés au retrait, sans crédit pour dividendes' },
      CELIAPP: { tone: 'advantage', text: 'Non imposés (achat d’une propriété)' },
      'Non enregistré': { tone: 'neutral', text: 'Imposés chaque année, avec crédit pour dividendes' },
    },
  },
  {
    income: 'Dividendes américains',
    example: 'JNJ, PG, XOM',
    cells: {
      CELI: { tone: 'tax', text: 'Retenue américaine perdue' },
      REER: { tone: 'neutral', text: 'Aucune retenue ; imposés au retrait' },
      CELIAPP: { tone: 'tax', text: 'Retenue américaine perdue' },
      'Non enregistré': { tone: 'tax', text: 'Imposés chaque année ; retenue récupérée' },
    },
  },
  {
    income: 'Intérêts',
    example: 'XBB.TO, ZST.TO',
    cells: {
      CELI: { tone: 'advantage', text: 'Non imposés' },
      REER: { tone: 'neutral', text: 'Imposés au retrait' },
      CELIAPP: { tone: 'advantage', text: 'Non imposés (achat d’une propriété)' },
      'Non enregistré': { tone: 'tax', text: 'Imposés en entier, chaque année' },
    },
  },
  {
    income: 'Gains en capital',
    example: 'SHOP.TO, NVDA, AMZN',
    cells: {
      CELI: { tone: 'advantage', text: 'Non imposés' },
      REER: { tone: 'neutral', text: 'Imposés en entier au retrait' },
      CELIAPP: { tone: 'advantage', text: 'Non imposés (achat d’une propriété)' },
      'Non enregistré': { tone: 'neutral', text: 'Imposés en partie, à la vente' },
    },
  },
  {
    income: 'Pertes',
    example: 'BTC-USD, ETH-USD',
    cells: {
      CELI: { tone: 'tax', text: 'Non déductibles ; droits utilisés perdus' },
      REER: { tone: 'tax', text: 'Non déductibles' },
      CELIAPP: { tone: 'tax', text: 'Non déductibles' },
      'Non enregistré': { tone: 'advantage', text: 'Déductibles des gains' },
    },
  },
]

export interface RuleRow {
  criterion: string
  values: Record<AccountId, string>
}

/** The rules with their 2026 figures, for the Complexe level. */
export function ruleRows(r: TaxRules): RuleRow[] {
  const year = String(r.year)
  return [
    {
      criterion: `Plafond ${r.year}`,
      values: {
        CELI: `${formatMoney(r.tfsa.annual_limits[year])} (cumul jusqu'à ${formatMoney(r.tfsa_total_since_2009)})`,
        REER: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, au plus ${formatMoney(r.rrsp.dollar_limit)}`,
        CELIAPP: `${formatMoney(r.fhsa.annual_limit)} par an, ${formatMoney(r.fhsa.lifetime_limit)} à vie`,
        'Non enregistré': 'Aucun',
      },
    },
    {
      criterion: 'Âge et durée',
      values: {
        CELI: `Dès ${r.tfsa.eligibility_age} ans, sans limite`,
        REER: `Jusqu'à ${r.rrsp_maturity.max_age} ans, puis FERR ou rente`,
        CELIAPP: `${r.fhsa.max_participation_years} ans au plus, avant ${r.fhsa.max_age} ans`,
        'Non enregistré': 'Aucune limite',
      },
    },
    {
      criterion: 'Première propriété',
      values: {
        CELI: 'Retrait libre',
        REER: `RAP : jusqu'à ${formatMoney(r.home_buyers_plan.withdrawal_limit)}, remboursés sur ${r.home_buyers_plan.repayment_years} ans`,
        CELIAPP: `Jusqu'à ${formatMoney(r.fhsa.lifetime_limit)} retirés sans impôt`,
        'Non enregistré': 'Retrait libre',
      },
    },
    {
      criterion: `Retenue américaine (${formatPercent(r.us_dividend_withholding.rate, 0)})`,
      values: { CELI: 'Perdue', REER: 'Exemptée', CELIAPP: 'Perdue', 'Non enregistré': 'Récupérée par crédit' },
    },
    {
      criterion: 'Gains en capital',
      values: {
        CELI: 'Non imposés',
        REER: 'Imposés en entier au retrait',
        CELIAPP: 'Non imposés (achat)',
        'Non enregistré': `${formatPercent(r.capital_gains.inclusion_rate, 0)} imposables, à la vente`,
      },
    },
  ]
}
