/** Frequently asked questions of the Comptes tab, grouped by theme. Amounts come from the rules. */

import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

export interface FaqItem {
  id: string
  question: string
  answer: string
  /** The account the question is about; hidden when that account is filtered out. */
  account?: AccountId
  sourceId?: string
}

export interface FaqGroup {
  title: string
  items: FaqItem[]
}

export function faqGroups(r: TaxRules): FaqGroup[] {
  const wh = formatPercent(r.us_dividend_withholding.rate, 0)
  const year = String(r.year)
  return [
    {
      title: 'Les bases',
      items: [
        {
          id: 'celi-vs-reer',
          question: 'Quelle est la vraie différence entre le CELI et le REER ?',
          answer:
            "Le moment où l'impôt est payé : au CELI, avant de verser l'argent ; au REER, au retrait. Au même taux d'imposition aux deux moments, le résultat est identique. Le REER laisse plus si le taux baisse au retrait, le CELI s'il monte.",
        },
        {
          id: 'celi-savings',
          question: "Un CELI, c'est un compte d'épargne ?",
          answer:
            "Non, c'est une enveloppe. On peut y détenir des actions, des FNB, des obligations ou des CPG, pas seulement des liquidités. L'avantage fiscal porte sur ce que les placements rapportent.",
          account: 'CELI',
          sourceId: 'cra_tfsa',
        },
        {
          id: 'several',
          question: 'Peut-on avoir plusieurs comptes en même temps ?',
          answer:
            "Oui. Vous pouvez avoir un CELI, un REER, un CELIAPP (si vous êtes premier acheteur) et un compte non enregistré, chacun avec ses propres plafonds.",
        },
      ],
    },
    {
      title: 'CELI',
      items: [
        {
          id: 'celi-withdraw',
          question: 'Que se passe-t-il quand je retire de mon CELI ?',
          answer:
            "Rien côté impôt. Le montant retiré redevient cotisable le 1er janvier suivant. Le remettre la même année, sans droits disponibles, crée un excédent pénalisé de 1 % par mois.",
          account: 'CELI',
          sourceId: 'cra_tfsa',
        },
        {
          id: 'celi-room',
          question: 'Combien puis-je cotiser à mon CELI ?',
          answer: `Les droits s'accumulent depuis l'année de vos ${r.tfsa.eligibility_age} ans (au plus tôt 2009) : ${formatMoney(r.tfsa.annual_limits[year])} en ${r.year}, jusqu'à ${formatMoney(r.tfsa_total_since_2009)} au total. Le solde exact de chaque personne est dans Mon dossier de l'ARC.`,
          account: 'CELI',
          sourceId: 'cra_tfsa',
        },
      ],
    },
    {
      title: 'REER',
      items: [
        {
          id: 'reer-refund',
          question: "Le remboursement d'impôt du REER, c'est un cadeau ?",
          answer:
            "C'est un report : l'impôt est payé au retrait. L'effet net dépend de l'écart entre le taux d'imposition à la cotisation et celui au retrait, et de ce qui est fait du remboursement.",
          account: 'REER',
          sourceId: 'cra_rrsp',
        },
        {
          id: 'reer-unused',
          question: 'Mes droits REER inutilisés sont-ils perdus ?',
          answer: `Non, ils se reportent sans limite de temps. Chaque année ajoute ${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu gagné l'année précédente, jusqu'à ${formatMoney(r.rrsp.dollar_limit)}. Une cotisation peut donc être faite une année où le revenu, et la déduction, sont plus élevés.`,
          account: 'REER',
          sourceId: 'cra_rrsp',
        },
        {
          id: 'reer-71',
          question: `Que se passe-t-il à ${r.rrsp_maturity.max_age} ans ?`,
          answer: `Le REER doit être converti au plus tard le 31 décembre de l'année de vos ${r.rrsp_maturity.max_age} ans : en FERR (retraits minimaux imposables chaque année), en rente, ou retiré et imposé d'un coup.`,
          account: 'REER',
          sourceId: 'cra_rrsp_maturity',
        },
      ],
    },
    {
      title: 'CELIAPP',
      items: [
        {
          id: 'fhsa-who',
          question: 'Qui est considéré comme premier acheteur ?',
          answer:
            "Quelqu'un qui n'a pas habité, cette année ou dans les 4 années précédentes, un logement dont lui-même ou son conjoint était propriétaire. Il faut aussi avoir au moins 18 ans et résider au Canada.",
          account: 'CELIAPP',
          sourceId: 'cra_fhsa',
        },
        {
          id: 'fhsa-no-buy',
          question: "Et si je n'achète jamais de maison ?",
          answer: `Le solde peut être transféré au REER sans utiliser vos droits REER, ou retiré en étant imposé. Le compte prend fin au plus tard après ${r.fhsa.max_participation_years} ans ou à ${r.fhsa.max_age} ans.`,
          account: 'CELIAPP',
          sourceId: 'cra_fhsa',
        },
        {
          id: 'fhsa-hbp',
          question: 'Peut-on combiner le CELIAPP et le RAP ?',
          answer: `Oui, pour la même maison : jusqu'à ${formatMoney(r.fhsa.lifetime_limit)} du CELIAPP et ${formatMoney(r.home_buyers_plan.withdrawal_limit)} du REER par personne. Le RAP doit être remboursé au REER sur ${r.home_buyers_plan.repayment_years} ans, le CELIAPP non.`,
          account: 'CELIAPP',
          sourceId: 'cra_hbp',
        },
      ],
    },
    {
      title: 'Placements et impôt',
      items: [
        {
          id: 'us-stocks',
          question: 'Pourquoi la retenue américaine dépend-elle du compte ?',
          answer: `Les États-Unis retiennent ${wh} des dividendes versés à un Canadien. La convention fiscale exempte le REER, mais pas le CELI ni le CELIAPP, où cette retenue est perdue pour de bon.`,
          account: 'REER',
          sourceId: 'canada_us_treaty',
        },
        {
          id: 'bonds',
          question: 'Comment les intérêts sont-ils imposés hors compte enregistré ?',
          answer: `Les intérêts sont imposés en entier, chaque année, au taux marginal. Un gain en capital n'est imposé qu'à ${formatPercent(r.capital_gains.inclusion_rate, 0)}, et seulement à la vente. Dans un compte enregistré, les intérêts ne sont pas imposés chaque année.`,
          account: 'Non enregistré',
          sourceId: 'cra_capital_gains',
        },
        {
          id: 'loss',
          question: 'Puis-je déduire une perte subie dans mon CELI ?',
          answer:
            "Non. Une perte dans un CELI, un REER ou un CELIAPP n'est jamais déductible, et au CELI les droits de cotisation perdus ne reviennent pas. Seul le compte non enregistré permet de déduire une perte de ses gains.",
          account: 'Non enregistré',
          sourceId: 'cra_capital_gains',
        },
      ],
    },
  ]
}
