/** Data of the Comptes tab's diagrams and comparison grids. */

import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

/** How a stage treats the dollar: an advantage, neutral, or a tax cost. */
export type StageTone = 'advantage' | 'neutral' | 'tax'

export interface JourneyStage {
  label: string
  detail: string
  tone: StageTone
}

export const JOURNEY_STEPS = ['À la cotisation', 'Pendant la croissance', 'Au retrait'] as const

/** The path of one dollar through each account. */
export const JOURNEY: Record<AccountId, [JourneyStage, JourneyStage, JourneyStage]> = {
  CELI: [
    { label: 'Déjà imposé', detail: 'Aucune déduction', tone: 'neutral' },
    { label: "À l'abri", detail: 'Aucun impôt annuel', tone: 'advantage' },
    { label: "Libre d'impôt", detail: 'En tout temps', tone: 'advantage' },
  ],
  REER: [
    { label: 'Déductible', detail: "Remboursement d'impôt", tone: 'advantage' },
    { label: "À l'abri", detail: 'Impôt reporté', tone: 'advantage' },
    { label: 'Imposé', detail: 'Comme un salaire', tone: 'tax' },
  ],
  CELIAPP: [
    { label: 'Déductible', detail: "Remboursement d'impôt", tone: 'advantage' },
    { label: "À l'abri", detail: 'Aucun impôt annuel', tone: 'advantage' },
    { label: "Libre d'impôt", detail: 'Pour une 1re propriété', tone: 'advantage' },
  ],
  'Non enregistré': [
    { label: 'Déjà imposé', detail: 'Aucune déduction', tone: 'neutral' },
    { label: 'Imposé chaque année', detail: 'Intérêts et dividendes', tone: 'tax' },
    { label: 'Gain imposé à 50 %', detail: 'À la vente seulement', tone: 'neutral' },
  ],
}

export interface ComparisonRow {
  criterion: string
  values: Record<AccountId, string>
}

export function comparisonRows(r: TaxRules): ComparisonRow[] {
  const year = String(r.year)
  return [
    {
      criterion: 'Déduction à la cotisation',
      values: { CELI: 'Non', REER: 'Oui', CELIAPP: 'Oui', 'Non enregistré': 'Non' },
    },
    {
      criterion: 'Revenus et croissance',
      values: {
        CELI: "Libres d'impôt",
        REER: 'Impôt reporté',
        CELIAPP: "Libres d'impôt",
        'Non enregistré': 'Imposés chaque année',
      },
    },
    {
      criterion: 'Retrait',
      values: {
        CELI: "Libre d'impôt",
        REER: 'Imposé comme un revenu',
        CELIAPP: "Libre d'impôt (1re propriété)",
        'Non enregistré': `Gain imposé à ${formatPercent(r.capital_gains.inclusion_rate, 0)}`,
      },
    },
    {
      criterion: `Plafond ${r.year}`,
      values: {
        CELI: `${formatMoney(r.tfsa.annual_limits[year])} (cumul jusqu'à ${formatMoney(r.tfsa_total_since_2009)})`,
        REER: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, max ${formatMoney(r.rrsp.dollar_limit)}`,
        CELIAPP: `${formatMoney(r.fhsa.annual_limit)} par an, ${formatMoney(r.fhsa.lifetime_limit)} à vie`,
        'Non enregistré': 'Aucun',
      },
    },
    {
      criterion: 'Droits rétablis après un retrait',
      values: { CELI: "Oui, l'année suivante", REER: 'Non', CELIAPP: 'Non', 'Non enregistré': '—' },
    },
    {
      criterion: 'Âge et durée',
      values: {
        CELI: `Dès ${r.tfsa.eligibility_age} ans, sans limite`,
        REER: `Jusqu'à ${r.rrsp_maturity.max_age} ans`,
        CELIAPP: `${r.fhsa.max_participation_years} ans au plus, avant ${r.fhsa.max_age} ans`,
        'Non enregistré': 'Aucune limite',
      },
    },
    {
      criterion: `Dividendes américains (retenue de ${formatPercent(r.us_dividend_withholding.rate, 0)})`,
      values: { CELI: 'Perdue', REER: 'Exemptée', CELIAPP: 'Perdue', 'Non enregistré': 'Récupérée' },
    },
    {
      criterion: 'Pertes en capital',
      values: {
        CELI: 'Non déductibles',
        REER: 'Non déductibles',
        CELIAPP: 'Non déductibles',
        'Non enregistré': 'Déductibles des gains',
      },
    },
  ]
}

export type Fit = 'good' | 'ok' | 'poor'

export const FIT_LABELS: Record<Fit, string> = {
  good: 'Très adapté',
  ok: 'Acceptable',
  poor: 'Peu adapté',
}

export interface LocationRow {
  asset: string
  example: string
  cells: Record<AccountId, { fit: Fit; why: string }>
}

/** Which asset in which account, by the kind of income it pays. */
export const ASSET_LOCATION: LocationRow[] = [
  {
    asset: 'Actions canadiennes à dividendes',
    example: 'RY.TO, ENB.TO, FTS.TO',
    cells: {
      CELI: { fit: 'good', why: "Dividendes libres d'impôt" },
      REER: { fit: 'ok', why: 'Crédit pour dividendes perdu' },
      CELIAPP: { fit: 'good', why: "Dividendes libres d'impôt" },
      'Non enregistré': { fit: 'ok', why: "Crédit d'impôt : taux réduit" },
    },
  },
  {
    asset: 'Actions américaines à dividendes',
    example: 'JNJ, PG, XOM',
    cells: {
      CELI: { fit: 'ok', why: 'Retenue de 15 % perdue' },
      REER: { fit: 'good', why: 'Aucune retenue américaine' },
      CELIAPP: { fit: 'ok', why: 'Retenue de 15 % perdue' },
      'Non enregistré': { fit: 'ok', why: 'Retenue récupérée, dividendes imposés' },
    },
  },
  {
    asset: 'Obligations et intérêts',
    example: 'XBB.TO, ZST.TO',
    cells: {
      CELI: { fit: 'good', why: "Intérêts libres d'impôt" },
      REER: { fit: 'good', why: 'Intérêts à l’abri' },
      CELIAPP: { fit: 'good', why: "Intérêts libres d'impôt" },
      'Non enregistré': { fit: 'poor', why: 'Intérêts imposés en entier chaque année' },
    },
  },
  {
    asset: 'Actions de croissance',
    example: 'SHOP.TO, NVDA, AMZN',
    cells: {
      CELI: { fit: 'good', why: 'Gain jamais imposé' },
      REER: { fit: 'ok', why: 'Gain imposé en entier au retrait' },
      CELIAPP: { fit: 'good', why: 'Gain jamais imposé' },
      'Non enregistré': { fit: 'ok', why: 'Gain imposé à 50 %, à la vente' },
    },
  },
  {
    asset: 'Actifs spéculatifs',
    example: 'BTC-USD, ETH-USD',
    cells: {
      CELI: { fit: 'ok', why: 'Perte non déductible, droits perdus' },
      REER: { fit: 'poor', why: 'Perte non déductible, droits perdus' },
      CELIAPP: { fit: 'poor', why: 'Met la mise de fonds à risque' },
      'Non enregistré': { fit: 'ok', why: 'Perte déductible des gains' },
    },
  },
]
