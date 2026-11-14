/**
 * Learning content of the Comptes tab: golden rules, « Le saviez-vous ? »
 * facts, recommended orders by situation and goals. Amounts come from the
 * versioned rules.
 */

import {
  Car,
  HandCoins,
  House,
  PiggyBank,
  Receipt,
  Sunset,
  Umbrella,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { AccountId, TaxProfile, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

export interface GoldenRule {
  title: string
  detail: string
}

export function goldenRules(r: TaxRules): GoldenRule[] {
  return [
    {
      title: 'Premier acheteur ? Le CELIAPP d’abord.',
      detail: `Il est le seul à cumuler déduction et retrait sans impôt : ${formatMoney(r.fhsa.annual_limit)} par an.`,
    },
    {
      title: 'Taux plus bas à la retraite ? REER. Sinon, CELI.',
      detail: 'Avec le même taux aujourd’hui et à la retraite, les deux donnent exactement le même résultat.',
    },
    {
      title: 'Chaque placement dans le compte où il est le moins imposé.',
      detail: 'Obligations à l’abri, actions américaines au REER. Hors abri, ce sont les actions canadiennes à dividendes qui perdent le moins.',
    },
  ]
}

export interface Fact {
  value: string
  label: string
  detail: string
  sourceId: string
}

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
      label: 'de mise de fonds par personne',
      detail: `CELIAPP (${formatMoney(r.fhsa.lifetime_limit)}) + RAP (${formatMoney(r.home_buyers_plan.withdrawal_limit)}). Le double pour un couple.`,
      sourceId: 'cra_hbp',
    },
    {
      value: '60 jours',
      label: 'de rattrapage pour le REER',
      detail: 'Une cotisation faite en janvier ou février peut réduire l’impôt de l’année précédente.',
      sourceId: 'cra_rrsp',
    },
    {
      value: formatPercent(r.us_dividend_withholding.rate, 0),
      label: 'de retenue évitée au REER',
      detail: 'Sur les dividendes américains, grâce à la convention fiscale. Pas au CELI.',
      sourceId: 'canada_us_treaty',
    },
    {
      value: formatPercent(r.capital_gains.inclusion_rate, 0),
      label: 'seulement des gains imposés',
      detail: 'Hors compte enregistré, et seulement quand vous vendez.',
      sourceId: 'cra_capital_gains',
    },
    {
      value: '0 $',
      label: 'd’impôt sur un retrait du CELI',
      detail: 'Il n’augmente pas votre revenu imposable, même à la retraite.',
      sourceId: 'cra_tfsa',
    },
  ]
}

export interface Situation {
  id: 'start' | 'home' | 'high' | 'retire'
  icon: LucideIcon
  title: string
  who: string
  order: Array<{ account: AccountId; why: string }>
}

export function situations(r: TaxRules): Situation[] {
  return [
    {
      id: 'start',
      icon: Wallet,
      title: 'Je commence ma carrière',
      who: 'Revenu modeste, taux d’imposition encore bas.',
      order: [
        { account: 'CELI', why: 'La déduction du REER vaudrait peu aujourd’hui.' },
        { account: 'REER', why: 'Plus tard : vos droits s’accumulent et attendent un meilleur taux.' },
        { account: 'Non enregistré', why: 'Une fois le CELI plein.' },
      ],
    },
    {
      id: 'home',
      icon: House,
      title: 'J’achète ma première maison',
      who: 'Achat prévu dans les 15 prochaines années.',
      order: [
        { account: 'CELIAPP', why: `Déductible et retiré sans impôt, ${formatMoney(r.fhsa.annual_limit)} par an.` },
        { account: 'REER', why: `Le RAP permet d'y retirer jusqu'à ${formatMoney(r.home_buyers_plan.withdrawal_limit)}.` },
        { account: 'CELI', why: 'Pour compléter avec souplesse.' },
      ],
    },
    {
      id: 'high',
      icon: HandCoins,
      title: 'Mon revenu est élevé',
      who: 'Taux actuel plus haut que celui prévu à la retraite.',
      order: [
        { account: 'REER', why: 'La déduction rembourse beaucoup d’impôt aujourd’hui.' },
        { account: 'CELI', why: 'Pour l’épargne qui ne rentre plus au REER.' },
        { account: 'Non enregistré', why: 'Actions canadiennes à dividendes en priorité.' },
      ],
    },
    {
      id: 'retire',
      icon: Sunset,
      title: 'Je prépare ma retraite',
      who: 'Moins de 10 ans avant de retirer.',
      order: [
        { account: 'REER', why: 'Si votre taux baissera à la retraite.' },
        { account: 'CELI', why: 'Retraits sans impôt qui ne gonflent pas votre revenu.' },
        { account: 'Non enregistré', why: `Le REER devient un FERR à ${r.rrsp_maturity.max_age} ans.` },
      ],
    },
  ]
}

/** The typical situation matching a profile, if any. */
export function matchingSituation(profile: TaxProfile): Situation['id'] | null {
  if (profile.fhsa_eligible) return 'home'
  if (profile.age >= 55 || profile.horizon_years[1] <= 10) return 'retire'
  if (profile.rate_now - profile.rate_retirement >= 0.05) return 'high'
  if (profile.rate_now <= 0.3) return 'start'
  return null
}

export interface Goal {
  icon: LucideIcon
  goal: string
  accounts: AccountId[]
  why: string
}

export const GOALS: Goal[] = [
  { icon: Umbrella, goal: "Un fonds d'urgence", accounts: ['CELI'], why: 'Retrait immédiat, sans impôt.' },
  { icon: House, goal: 'Ma première maison', accounts: ['CELIAPP', 'REER'], why: 'CELIAPP, puis le RAP du REER.' },
  { icon: Sunset, goal: 'Ma retraite', accounts: ['REER', 'CELI'], why: 'REER si votre taux baissera, sinon CELI.' },
  { icon: Car, goal: 'Un projet dans 2 à 5 ans', accounts: ['CELI'], why: 'Souple, et rien à payer au retrait.' },
  { icon: Receipt, goal: 'Payer moins d’impôt cette année', accounts: ['REER', 'CELIAPP'], why: 'Les deux seuls comptes déductibles.' },
  { icon: PiggyBank, goal: 'J’ai rempli mes comptes', accounts: ['Non enregistré'], why: 'Sans plafond ; dividendes canadiens favorisés.' },
]
