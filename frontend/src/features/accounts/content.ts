/**
 * Educational content of the Comptes tab. Every amount, rate and age comes
 * from the versioned rules (`GET /api/accounts/rules`), never from this file.
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

export interface UseCase {
  icon: LucideIcon
  label: string
  detail: string
}

export interface AccountGuide {
  id: AccountId
  /** The account in one sentence. */
  tagline: string
  represents: string
  how: string[]
  keyFacts: KeyFact[]
  /** The one short number shown on the account's tile. */
  glance: KeyFact
  useCases: UseCase[]
  /** Where it usually sits in the order of accounts to fill. */
  orderTip: string
  pros: string[]
  cons: string[]
  bestFor: string
  sourceIds: string[]
}

export function accountGuides(r: TaxRules): AccountGuide[] {
  const year = String(r.year)
  const wh = formatPercent(r.us_dividend_withholding.rate, 0)
  const inclusion = formatPercent(r.capital_gains.inclusion_rate, 0)

  return [
    {
      id: 'CELI',
      tagline: "On y verse de l'argent déjà imposé ; tout ce qui pousse reste à vous, même au retrait.",
      represents: "Une enveloppe à l'abri de l'impôt pour n'importe quel projet, pas seulement un compte d'épargne.",
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
      glance: { label: `Plafond ${r.year}`, value: formatMoney(r.tfsa.annual_limits[year]) },
      useCases: [
        { icon: Umbrella, label: "Fonds d'urgence", detail: 'Disponible en tout temps, sans impôt.' },
        { icon: Plane, label: 'Projet dans 2 à 5 ans', detail: 'Voyage, voiture, études.' },
        { icon: Rocket, label: 'Placements à forte croissance', detail: 'Un gros gain n’est jamais imposé.' },
        { icon: Sunset, label: "Retraite d'appoint", detail: 'Retraits qui n’augmentent pas le revenu imposable.' },
      ],
      orderTip: '1er choix si votre revenu est modeste ; sinon, juste après le REER ou le CELIAPP.',
      pros: [
        'Retraits non imposés, sans effet sur votre revenu imposable.',
        'Souplesse totale : retraits en tout temps, droits rétablis ensuite.',
        'Avantageux si votre taux d’imposition futur pourrait être plus élevé.',
      ],
      cons: [
        "Aucune déduction à l'entrée.",
        `Retenue américaine de ${wh} sur les dividendes de titres américains, non récupérable.`,
        'Une perte ne peut pas être déduite.',
        'Un excédent de cotisation est pénalisé chaque mois.',
      ],
      bestFor: 'Objectifs souples, revenu modeste aujourd’hui, placements à forte croissance.',
      sourceIds: ['cra_tfsa', 'cra_limits'],
    },
    {
      id: 'REER',
      tagline: 'Déduire aujourd’hui, payer l’impôt plus tard, idéalement à un taux plus bas.',
      represents: "Un régime pour la retraite : l'impôt est reporté jusqu'au retrait, souvent quand le revenu a baissé.",
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
      glance: { label: `Plafond ${r.year} (${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu)`, value: formatMoney(r.rrsp.dollar_limit) },
      useCases: [
        { icon: Sunset, label: 'Retraite', detail: 'Le but premier : reporter l’impôt à plus tard.' },
        { icon: Receipt, label: "Baisser l'impôt d'une bonne année", detail: 'Prime, hausse de salaire : la déduction vaut plus.' },
        { icon: House, label: 'Mise de fonds (RAP)', detail: `Jusqu'à ${formatMoney(r.home_buyers_plan.withdrawal_limit)} empruntés à vous-même.` },
        { icon: Flag, label: 'Actions américaines à dividendes', detail: `Aucune retenue de ${wh}.` },
      ],
      orderTip: '1er choix si votre taux d’imposition actuel dépasse celui prévu à la retraite.',
      pros: [
        'Remboursement d’impôt immédiat grâce à la déduction.',
        `Dividendes américains exemptés de la retenue de ${wh}.`,
        'Droits inutilisés reportés aux années suivantes.',
      ],
      cons: [
        'Retraits imposés comme un salaire : dividendes et gains perdent leur traitement favorable.',
        'Les droits utilisés ne reviennent pas après un retrait.',
        'Conversion obligatoire et retraits minimaux après l’échéance.',
      ],
      bestFor: 'Revenu élevé aujourd’hui et revenu plus bas prévu à la retraite.',
      sourceIds: ['cra_rrsp', 'cra_limits', 'cra_rrsp_maturity', 'cra_hbp'],
    },
    {
      id: 'CELIAPP',
      tagline: 'Déductible comme un REER, libre d’impôt comme un CELI, pour une première maison.',
      represents: 'Un compte réservé aux premiers acheteurs, qui cumule les deux avantages fiscaux pour la mise de fonds.',
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
      glance: { label: 'Plafond annuel', value: formatMoney(r.fhsa.annual_limit) },
      useCases: [
        { icon: House, label: 'Mise de fonds', detail: 'Le compte le plus avantageux pour une 1re maison.' },
        { icon: Building2, label: 'Avec le RAP', detail: 'Les deux se combinent pour la même maison.' },
        { icon: Landmark, label: 'Achat incertain', detail: 'Rien n’est perdu : transfert au REER possible.' },
      ],
      orderTip: '1er choix pour tout premier acheteur, avant le REER et le CELI.',
      pros: [
        'Double avantage : déduction à l’entrée et retrait non imposé.',
        'Transfert au REER possible si l’achat n’a pas lieu.',
        'Combinable avec le RAP.',
      ],
      cons: [
        'Réservé à une première propriété.',
        'Plafonds modestes et période limitée.',
        `Retenue américaine de ${wh} non récupérable, comme au CELI.`,
      ],
      bestFor: 'Premiers acheteurs qui prévoient acheter dans les 15 prochaines années.',
      sourceIds: ['cra_fhsa', 'cra_hbp'],
    },
    {
      id: 'Non enregistré',
      tagline: 'Aucun plafond ni restriction, mais l’impôt s’applique chaque année aux revenus.',
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
      glance: { label: 'Plafond', value: 'Aucun' },
      useCases: [
        { icon: Banknote, label: 'Une fois les comptes pleins', detail: 'Il prend le relais sans limite.' },
        { icon: TrendingUp, label: 'Actions canadiennes à dividendes', detail: "Crédit d'impôt : taux réduit." },
        { icon: TrendingDown, label: 'Placements risqués', detail: 'Une perte peut être déduite des gains.' },
      ],
      orderTip: 'En dernier, quand les comptes enregistrés sont remplis.',
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
      bestFor: 'Après avoir rempli les comptes enregistrés ; actions canadiennes à dividendes.',
      sourceIds: ['cra_capital_gains', 'cra_dividend_credit', 'rq_dividend_credit'],
    },
  ]
}
