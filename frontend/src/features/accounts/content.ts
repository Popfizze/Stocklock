/**
 * Educational content of the Comptes tab. Every amount, rate and age comes
 * from the versioned rules (`GET /api/accounts/rules`), never from this file.
 */

import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

export interface KeyFact {
  label: string
  value: string
}

export interface AccountGuide {
  id: AccountId
  tagline: string
  represents: string
  how: string[]
  keyFacts: KeyFact[]
  pros: string[]
  cons: string[]
  bestFor: string
  sourceIds: string[]
}

export function accountGuides(r: TaxRules): AccountGuide[] {
  const year = String(r.year)
  const tfsaLimit = r.tfsa.annual_limits[year]
  const wh = formatPercent(r.us_dividend_withholding.rate, 0)
  const inclusion = formatPercent(r.capital_gains.inclusion_rate, 0)

  return [
    {
      id: 'CELI',
      tagline: "Épargner avec de l'argent déjà imposé : tout ce qui pousse reste à vous.",
      represents:
        "Une enveloppe qui met n'importe quel placement à l'abri de l'impôt, pour tout projet : voyage, maison, retraite.",
      how: [
        "Vous y versez de l'argent après impôt : aucune déduction.",
        'Intérêts, dividendes et gains fructifient sans impôt.',
        "Les retraits sont libres d'impôt, en tout temps.",
        "Le montant retiré s'ajoute à vos droits le 1er janvier suivant.",
      ],
      keyFacts: [
        { label: `Plafond ${r.year}`, value: formatMoney(tfsaLimit) },
        {
          label: 'Droits cumulés depuis 2009',
          value: `${formatMoney(r.tfsa_total_since_2009)} au maximum`,
        },
        { label: 'Âge minimum', value: `${r.tfsa.eligibility_age} ans` },
      ],
      pros: [
        "Retraits non imposés, qui n'augmentent pas votre revenu imposable.",
        'Souplesse totale : retraits en tout temps, droits rétablis ensuite.',
        'Avantageux si votre taux d’imposition futur pourrait être plus élevé.',
      ],
      cons: [
        "Aucune déduction à l'entrée.",
        `Retenue américaine de ${wh} sur les dividendes de titres américains, non récupérable.`,
        'Une perte en capital ne peut pas être déduite.',
        'Un excédent de cotisation est pénalisé chaque mois.',
      ],
      bestFor: 'Objectifs souples, revenu modeste aujourd’hui, placements à forte croissance.',
      sourceIds: ['cra_tfsa', 'cra_limits'],
    },
    {
      id: 'REER',
      tagline: 'Déduire aujourd’hui, payer l’impôt plus tard, idéalement à un taux plus bas.',
      represents:
        "Un régime pour la retraite : l'impôt est reporté jusqu'au retrait, souvent quand le revenu a baissé.",
      how: [
        'Vos cotisations réduisent votre revenu imposable de l’année.',
        'Les placements fructifient sans impôt tant qu’ils restent dans le régime.',
        'Chaque retrait s’ajoute à votre revenu et est imposé à votre taux du moment.',
        `Au plus tard à ${r.rrsp_maturity.max_age} ans, le REER devient un FERR ou une rente.`,
      ],
      keyFacts: [
        {
          label: `Plafond ${r.year}`,
          value: `${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu, au plus ${formatMoney(r.rrsp.dollar_limit)}`,
        },
        {
          label: 'Régime d’accession à la propriété',
          value: `${formatMoney(r.home_buyers_plan.withdrawal_limit)}, remboursés sur ${r.home_buyers_plan.repayment_years} ans`,
        },
        { label: 'Échéance', value: `Fin de l'année des ${r.rrsp_maturity.max_age} ans` },
      ],
      pros: [
        'Remboursement d’impôt immédiat grâce à la déduction.',
        `Dividendes américains exemptés de la retenue de ${wh} (convention fiscale Canada–États-Unis).`,
        'Retrait temporaire possible pour une première propriété (RAP).',
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
      represents:
        "Un compte réservé aux premiers acheteurs, qui cumule les deux avantages fiscaux pour la mise de fonds.",
      how: [
        'Les cotisations sont déductibles, comme au REER.',
        'Les placements fructifient à l’abri de l’impôt.',
        'Un retrait admissible pour acheter une première propriété n’est pas imposé.',
        'Sans achat, le solde peut passer au REER sans utiliser de droits REER.',
      ],
      keyFacts: [
        { label: 'Plafond annuel', value: formatMoney(r.fhsa.annual_limit) },
        { label: 'Plafond à vie', value: formatMoney(r.fhsa.lifetime_limit) },
        {
          label: 'Durée',
          value: `${r.fhsa.max_participation_years} ans au plus, jusqu'à ${r.fhsa.max_age} ans`,
        },
      ],
      pros: [
        'Double avantage : déduction à l’entrée et retrait non imposé.',
        'Transfert au REER possible si l’achat n’a pas lieu.',
        'Peut s’ajouter au RAP pour la même maison.',
      ],
      cons: [
        'Réservé à une première propriété.',
        'Plafonds modestes et période limitée.',
        `Retenue américaine de ${wh} non récupérable, comme au CELI.`,
      ],
      bestFor: 'Premiers acheteurs qui prévoient acheter dans les 15 prochaines années.',
      sourceIds: ['cra_fhsa'],
    },
    {
      id: 'Non enregistré',
      tagline: 'Aucun plafond ni restriction, mais l’impôt s’applique chaque année aux revenus.',
      represents:
        'Le compte de placement ordinaire : pas d’abri fiscal, mais un traitement favorable des gains et des dividendes canadiens.',
      how: [
        'Vous y versez de l’argent après impôt, sans plafond.',
        'Intérêts imposés en entier chaque année ; dividendes canadiens avec un crédit d’impôt.',
        `Gains en capital imposés à ${inclusion}, seulement au moment de la vente.`,
        'Les pertes en capital réduisent les gains imposables.',
      ],
      keyFacts: [
        { label: 'Plafond', value: 'Aucun' },
        { label: 'Gains en capital imposables', value: inclusion },
        {
          label: 'Dividende déterminé majoré de',
          value: formatPercent(r.eligible_dividends.gross_up, 0),
        },
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
      bestFor: 'Après avoir rempli les comptes enregistrés ; actions canadiennes à dividendes.',
      sourceIds: ['cra_capital_gains', 'cra_dividend_credit', 'rq_dividend_credit'],
    },
  ]
}
