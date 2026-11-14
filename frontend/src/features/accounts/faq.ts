/** Frequently asked questions of the Comptes tab, grouped by theme. Amounts come from the rules. */

import type { AccountId, TaxRules } from '@/api/accounts'
import { formatMoney, formatPercent } from './format'

export interface FaqItem {
  id: string
  question: string
  answer: string
  /** Shown as « Bon à savoir » on this account's page. */
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
            "Le moment où vous payez l'impôt. Au CELI, avant de verser l'argent ; au REER, au retrait. Si votre taux d'imposition est le même aux deux moments, le résultat est identique : le REER gagne seulement si votre taux baisse à la retraite.",
        },
        {
          id: 'celi-savings',
          question: "Un CELI, c'est un compte d'épargne ?",
          answer:
            "Non, c'est une enveloppe. On peut y détenir des actions, des FNB, des obligations ou des CPG, pas seulement de l'épargne à faible intérêt. Laisser son CELI en liquidités, c'est se priver de l'essentiel de l'avantage.",
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
            "Rien côté impôt. Le montant retiré redevient cotisable le 1er janvier suivant. Attention : le remettre la même année, sans droits disponibles, crée un excédent pénalisé de 1 % par mois.",
          account: 'CELI',
          sourceId: 'cra_tfsa',
        },
        {
          id: 'celi-room',
          question: 'Combien puis-je cotiser à mon CELI ?',
          answer: `Les droits s'accumulent depuis l'année de vos ${r.tfsa.eligibility_age} ans (au plus tôt 2009) : ${formatMoney(r.tfsa.annual_limits[year])} en ${r.year}, jusqu'à ${formatMoney(r.tfsa_total_since_2009)} au total. Votre solde exact est dans Mon dossier de l'ARC.`,
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
            "Non, c'est un report : l'impôt sera payé au retrait. Le vrai gain vient de l'écart entre votre taux d'aujourd'hui et celui de la retraite, et du remboursement s'il est réinvesti, par exemple au CELI.",
          account: 'REER',
          sourceId: 'cra_rrsp',
        },
        {
          id: 'reer-unused',
          question: 'Mes droits REER inutilisés sont-ils perdus ?',
          answer: `Non, ils se reportent sans limite de temps. Chaque année ajoute ${formatPercent(r.rrsp.rate_of_earned_income, 0)} du revenu gagné l'année précédente, jusqu'à ${formatMoney(r.rrsp.dollar_limit)}. On peut donc attendre une année à revenu plus élevé pour cotiser.`,
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
          question: 'Pourquoi garder les actions américaines dans le REER ?',
          answer: `Les États-Unis retiennent ${wh} des dividendes versés à un Canadien. La convention fiscale exempte le REER, mais pas le CELI ni le CELIAPP, où cette retenue est perdue pour de bon.`,
          account: 'REER',
          sourceId: 'canada_us_treaty',
        },
        {
          id: 'bonds',
          question: 'Pourquoi les obligations sont-elles mal imposées hors abri ?',
          answer: `Les intérêts sont imposés en entier, chaque année, au taux marginal. Un gain en capital n'est imposé qu'à ${formatPercent(r.capital_gains.inclusion_rate, 0)}, et seulement à la vente. Les obligations profitent donc le plus d'un compte enregistré.`,
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

/** The questions tagged for one account, for its « Bon à savoir ». */
export function accountFaq(r: TaxRules, account: AccountId): FaqItem[] {
  return faqGroups(r)
    .flatMap((group) => group.items)
    .filter((item) => item.account === account)
}
