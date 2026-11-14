/**
 * Educational content of the Comptes tab, one guide per account. Facts only:
 * what the account is, how it works, what it can be used for, its pros and
 * its constraints. Every amount, rate and age comes from the versioned rules
 * (`GET /api/accounts/rules`), never from this file.
 */

import {
  Banknote,
  Building2,
  Flag,
  TrendingDown,
  House,
  Landmark,
  Plane,
  Receipt,
  Rocket,
  Sunset,
  TrendingUp,
  Umbrella,
  type LucideIcon,
} from 'lucide-react'
import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

export interface KeyFact {
  label: string
  value: string
}

export interface AccountUse {
  icon: LucideIcon
  label: string
  detail: string
}

export interface AccountGuide {
  id: AccountId
  /** The account in one sentence, without figures (Simple level). */
  tagline: string
  represents: string
  how: string[]
  /** The rule's figures (Complexe level). */
  keyFacts: KeyFact[]
  /** What it can be used for (Normale level). */
  uses: AccountUse[]
  pros: string[]
  cons: string[]
  sourceIds: string[]
}

export function accountGuides(r: TaxRules): AccountGuide[] {
  const year = String(r.year)
  const wh = formatPercent(r.us_dividend_withholding.rate, 0)
  const inclusion = formatPercent(r.capital_gains.inclusion_rate, 0)

  return [
    {
      id: 'CELI',
      tagline: "On y verse de l'argent déjà imposé ; ce qu'il rapporte n'est jamais imposé, même au retrait.",
      represents: "Une enveloppe à l'abri de l'impôt, pour n'importe quel projet ; elle peut contenir actions, FNB, obligations ou CPG.",
      how: [
        'Vous versez de l’argent après impôt.',
        'Intérêts, dividendes et gains poussent sans impôt.',
        'Vous retirez sans impôt, quand vous voulez.',
        'Le montant retiré redevient cotisable le 1er janvier suivant.',
      ],
      keyFacts: [
        { label: `Plafond ${r.year}`, value: formatMoney(r.tfsa.annual_limits[year]) },
        { label: 'Cumul possible depuis 2009', value: formatMoney(r.tfsa_total_since_2009) },
        { label: 'Âge minimum', value: `${r.tfsa.eligibility_age} ans` },
      ],
      uses: [
        { icon: Umbrella, label: "Fonds d'urgence", detail: 'Disponible en tout temps, sans impôt.' },
        { icon: Plane, label: 'Projet dans 2 à 5 ans', detail: 'Voyage, voiture, études.' },
        { icon: Rocket, label: 'Placements de croissance', detail: 'Un gain, même important, n’est pas imposé.' },
        { icon: Sunset, label: 'Retraite', detail: 'Les retraits n’augmentent pas le revenu imposable.' },
      ],
      pros: [
        'Retraits non imposés, sans effet sur votre revenu imposable.',
        'Retraits en tout temps ; les droits sont rétablis l’année suivante.',
        'Le retrait reste non imposé, même si le taux d’imposition monte plus tard.',
      ],
      cons: [
        "Aucune déduction à l'entrée.",
        `Retenue américaine de ${wh} sur les dividendes de titres américains, non récupérable.`,
        'Une perte ne peut pas être déduite.',
        'Un excédent de cotisation est pénalisé chaque mois.',
      ],
      sourceIds: ['cra_tfsa', 'cra_limits'],
    },
    {
      id: 'REER',
      tagline: 'La cotisation réduit l’impôt aujourd’hui ; l’impôt est payé plus tard, au retrait.',
      represents: "Un régime d'épargne-retraite : l'impôt est reporté jusqu'au retrait, au taux de ce moment-là.",
      how: [
        'Vos cotisations réduisent votre revenu imposable.',
        'Les placements poussent sans impôt dans le régime.',
        'Chaque retrait est imposé comme un salaire.',
        `À ${r.rrsp_maturity.max_age} ans au plus tard : FERR ou rente.`,
      ],
      keyFacts: [
        {
          label: `Plafond ${r.year}`,
          value: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, max ${formatMoney(r.rrsp.dollar_limit)}`,
        },
        { label: 'RAP (1re maison)', value: formatMoney(r.home_buyers_plan.withdrawal_limit) },
        { label: 'Échéance', value: `${r.rrsp_maturity.max_age} ans` },
      ],
      uses: [
        { icon: Sunset, label: 'Retraite', detail: 'L’impôt est reporté au retrait.' },
        { icon: Receipt, label: "Réduire l'impôt d'une année", detail: 'La déduction vaut plus quand le taux marginal est élevé.' },
        { icon: House, label: 'Mise de fonds (RAP)', detail: `Jusqu'à ${formatMoney(r.home_buyers_plan.withdrawal_limit)}, à rembourser au REER.` },
        { icon: Flag, label: 'Actions américaines à dividendes', detail: `Aucune retenue de ${wh}.` },
      ],
      pros: [
        'La déduction réduit l’impôt de l’année de cotisation.',
        `Dividendes américains exemptés de la retenue de ${wh}.`,
        'Droits inutilisés reportés aux années suivantes.',
      ],
      cons: [
        'Retraits imposés comme un salaire, dividendes et gains compris.',
        'Les droits utilisés ne reviennent pas après un retrait.',
        'Conversion obligatoire et retraits minimaux après l’échéance.',
      ],
      sourceIds: ['cra_rrsp', 'cra_limits', 'cra_rrsp_maturity', 'cra_hbp'],
    },
    {
      id: 'CELIAPP',
      tagline: 'Déductible à l’entrée et retiré sans impôt, pour l’achat d’une première propriété.',
      represents: 'Un compte réservé aux premiers acheteurs : déductible comme le REER, retiré sans impôt comme le CELI.',
      how: [
        'Vos cotisations sont déductibles.',
        'Les placements poussent sans impôt.',
        'Le retrait pour une 1re propriété n’est pas imposé.',
        'Pas d’achat ? Le solde passe au REER sans droits utilisés.',
      ],
      keyFacts: [
        { label: 'Plafond annuel', value: formatMoney(r.fhsa.annual_limit) },
        { label: 'Plafond à vie', value: formatMoney(r.fhsa.lifetime_limit) },
        { label: 'Durée maximale', value: `${r.fhsa.max_participation_years} ans, avant ${r.fhsa.max_age} ans` },
      ],
      uses: [
        { icon: House, label: 'Mise de fonds', detail: 'Déductible à l’entrée, retiré sans impôt pour l’achat.' },
        { icon: Building2, label: 'Avec le RAP', detail: 'Les deux se combinent pour la même maison.' },
        { icon: Landmark, label: 'Sans achat', detail: 'Le solde peut être transféré au REER.' },
      ],
      pros: [
        'Déduction à l’entrée et retrait non imposé pour l’achat.',
        'Transfert au REER possible si l’achat n’a pas lieu.',
        'Combinable avec le RAP.',
      ],
      cons: [
        'Réservé à une première propriété.',
        'Plafond annuel, plafond à vie et durée limitée.',
        `Retenue américaine de ${wh} non récupérable, comme au CELI.`,
      ],
      sourceIds: ['cra_fhsa', 'cra_hbp'],
    },
    {
      id: 'Non enregistré',
      tagline: 'Aucun plafond ni condition ; les revenus sont imposés chaque année.',
      represents: 'Le compte de placement ordinaire : pas d’abri fiscal, mais un traitement favorable des gains et des dividendes canadiens.',
      how: [
        'Vous versez de l’argent après impôt, sans plafond.',
        'Intérêts et dividendes imposés chaque année.',
        `Gains imposés à ${inclusion}, seulement à la vente.`,
        'Les pertes réduisent les gains imposables.',
      ],
      keyFacts: [
        { label: 'Plafond', value: 'Aucun' },
        { label: 'Part imposable des gains', value: inclusion },
        { label: 'Majoration des dividendes', value: formatPercent(r.eligible_dividends.gross_up, 0) },
      ],
      uses: [
        { icon: Banknote, label: 'Au-delà des plafonds', detail: 'Aucune limite de cotisation.' },
        { icon: TrendingUp, label: 'Dividendes canadiens', detail: "Crédit d'impôt pour dividendes : taux réduit." },
        { icon: TrendingDown, label: 'Pertes', detail: 'Une perte peut être déduite des gains.' },
      ],
      pros: [
        'Aucun plafond, retraits libres.',
        'Crédit d’impôt pour dividendes canadiens.',
        'Pertes déductibles des gains ; retenue américaine récupérable.',
      ],
      cons: [
        'Impôt chaque année sur les intérêts et les dividendes.',
        'Aucune déduction à l’entrée.',
        'Il faut suivre le coût de chaque placement pour l’impôt.',
      ],
      sourceIds: ['cra_capital_gains', 'cra_dividend_credit', 'rq_dividend_credit'],
    },
  ]
}
