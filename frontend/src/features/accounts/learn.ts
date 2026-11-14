/**
 * Learning content of the Comptes tab: three facts to remember, « Le saviez-vous ? »
 * figures, and what each account allows for a given goal. Facts only: nothing
 * here tells the reader which account to open or fill first.
 */

import { Flag, House, Infinity as Unlimited, Receipt, Sunset, Wallet, type LucideIcon } from 'lucide-react'
import type { AccountId, TaxRules } from '@/api/accounts'
import type { Tone } from './comparison'
import { formatMoney, formatPercent } from './format'

/** Three facts that explain most differences, in words only (shown at every level). */
export const KEY_FACTS: string[] = [
  "Seuls le REER et le CELIAPP réduisent l'impôt de l'année où l'on cotise.",
  "Au même taux d'imposition aujourd'hui et au retrait, le REER et le CELI laissent le même montant après impôt.",
  "Un même placement n'est pas imposé de la même façon selon ce qu'il verse : intérêts, dividendes ou gains.",
]

export interface Fact {
  value: string
  label: string
  detail: string
  sourceId: string
}

/** Figures worth knowing (Complexe level). */
export function didYouKnow(r: TaxRules): Fact[] {
  const homeTotal = r.fhsa.lifetime_limit + r.home_buyers_plan.withdrawal_limit
  return [
    {
      value: formatMoney(r.tfsa_total_since_2009),
      label: 'de droits CELI cumulés',
      detail: `Pour qui avait au moins ${r.tfsa.eligibility_age} ans en 2009 et n’a jamais cotisé.`,
      sourceId: 'cra_tfsa',
    },
    {
      value: formatMoney(homeTotal),
      label: 'pour une première propriété',
      detail: `CELIAPP (${formatMoney(r.fhsa.lifetime_limit)}) et RAP (${formatMoney(r.home_buyers_plan.withdrawal_limit)}), par personne.`,
      sourceId: 'cra_hbp',
    },
    {
      value: '60 jours',
      label: 'pour cotiser au REER',
      detail: 'Une cotisation faite en janvier ou février peut être déduite de l’année précédente.',
      sourceId: 'cra_rrsp',
    },
    {
      value: formatPercent(r.us_dividend_withholding.rate, 0),
      label: 'de retenue sur les dividendes américains',
      detail: 'Le REER en est exempté par la convention fiscale ; le CELI et le CELIAPP, non.',
      sourceId: 'canada_us_treaty',
    },
    {
      value: formatPercent(r.capital_gains.inclusion_rate, 0),
      label: 'du gain est imposable',
      detail: 'Hors compte enregistré, et seulement à la vente.',
      sourceId: 'cra_capital_gains',
    },
    {
      value: '0 $',
      label: 'd’impôt sur un retrait du CELI',
      detail: 'Il n’augmente pas le revenu imposable, même à la retraite.',
      sourceId: 'cra_tfsa',
    },
  ]
}

export interface GoalAccount {
  account: AccountId
  tone: Tone
  /** Simple: a few words. */
  text: string
  /** Normale: the condition or the catch. */
  detail: string
  /** Complexe: the figure of the rule. */
  figure?: string
}

export interface Goal {
  id: 'cash' | 'home' | 'retirement' | 'tax' | 'unlimited' | 'us'
  icon: LucideIcon
  title: string
  accounts: GoalAccount[]
}

/** For each goal, what each account allows: the rules, in no particular order of preference. */
export function goals(r: TaxRules): Goal[] {
  const wh = formatPercent(r.us_dividend_withholding.rate, 0)
  const inclusion = formatPercent(r.capital_gains.inclusion_rate, 0)
  return [
    {
      id: 'cash',
      icon: Wallet,
      title: "Garder de l'argent disponible",
      accounts: [
        { account: 'CELI', tone: 'advantage', text: 'Retrait sans impôt, en tout temps', detail: 'Le montant retiré redevient cotisable le 1er janvier suivant.' },
        { account: 'Non enregistré', tone: 'neutral', text: 'Retrait libre', detail: 'Le gain réalisé à la vente est imposé en partie.', figure: `${inclusion} du gain est imposable` },
        { account: 'REER', tone: 'tax', text: 'Retrait possible mais imposé', detail: 'Les droits de cotisation utilisés ne reviennent pas.' },
      ],
    },
    {
      id: 'home',
      icon: House,
      title: 'Acheter une première propriété',
      accounts: [
        { account: 'CELIAPP', tone: 'advantage', text: 'Déduction et retrait sans impôt', detail: 'Réservé aux premiers acheteurs ; rien à rembourser.', figure: `${formatMoney(r.fhsa.annual_limit)} par an, ${formatMoney(r.fhsa.lifetime_limit)} à vie` },
        { account: 'REER', tone: 'neutral', text: 'Retrait sans impôt avec le RAP', detail: `À rembourser au REER sur ${r.home_buyers_plan.repayment_years} ans.`, figure: `Jusqu'à ${formatMoney(r.home_buyers_plan.withdrawal_limit)} par personne` },
        { account: 'CELI', tone: 'advantage', text: 'Retrait sans impôt', detail: "Aucune condition sur l'usage de l'argent." },
      ],
    },
    {
      id: 'retirement',
      icon: Sunset,
      title: 'Préparer la retraite',
      accounts: [
        { account: 'REER', tone: 'neutral', text: 'Impôt reporté au retrait', detail: 'Le retrait est imposé au taux de ce moment-là.', figure: `FERR ou rente au plus tard à ${r.rrsp_maturity.max_age} ans` },
        { account: 'CELI', tone: 'advantage', text: 'Retraits non imposés', detail: "Ils n'augmentent pas le revenu imposable de la retraite." },
        { account: 'Non enregistré', tone: 'neutral', text: 'Sans plafond', detail: 'Revenus imposés chaque année ; gain imposé en partie à la vente.' },
      ],
    },
    {
      id: 'tax',
      icon: Receipt,
      title: "Réduire l'impôt de l'année",
      accounts: [
        { account: 'REER', tone: 'advantage', text: 'Cotisation déductible', detail: 'Une cotisation de janvier ou février peut compter pour l’année précédente.', figure: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, au plus ${formatMoney(r.rrsp.dollar_limit)}` },
        { account: 'CELIAPP', tone: 'advantage', text: 'Cotisation déductible', detail: 'Pour les premiers acheteurs seulement.', figure: `${formatMoney(r.fhsa.annual_limit)} par an` },
        { account: 'CELI', tone: 'neutral', text: 'Aucune déduction', detail: "L'avantage vient au retrait, non imposé." },
        { account: 'Non enregistré', tone: 'neutral', text: 'Aucune déduction', detail: 'Les pertes réduisent toutefois les gains imposables.' },
      ],
    },
    {
      id: 'unlimited',
      icon: Unlimited,
      title: 'Placer au-delà des plafonds',
      accounts: [
        { account: 'Non enregistré', tone: 'neutral', text: 'Aucun plafond', detail: 'Intérêts et dividendes imposés chaque année ; gain imposé en partie à la vente.' },
      ],
    },
    {
      id: 'us',
      icon: Flag,
      title: 'Recevoir des dividendes américains',
      accounts: [
        { account: 'REER', tone: 'advantage', text: 'Aucune retenue américaine', detail: 'Exemption prévue par la convention fiscale Canada–États-Unis.', figure: `Retenue évitée : ${wh}` },
        { account: 'Non enregistré', tone: 'neutral', text: 'Retenue récupérable', detail: 'Par le crédit pour impôt étranger ; dividendes imposés chaque année.' },
        { account: 'CELI', tone: 'tax', text: 'Retenue perdue', detail: "Le CELI n'est pas couvert par la convention.", figure: `${wh} des dividendes` },
        { account: 'CELIAPP', tone: 'tax', text: 'Retenue perdue', detail: "Le CELIAPP n'est pas couvert par la convention.", figure: `${wh} des dividendes` },
      ],
    },
  ]
}
