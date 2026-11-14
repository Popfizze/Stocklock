import type {
  AccountOutcome,
  AccountProjection,
  AssetSummary,
  TaxRules,
} from '@/api/accounts'

/** Fixtures shaped like the `/api/accounts/*` responses (values trimmed from real runs). */

export const RULES: TaxRules = {
  year: 2026,
  jurisdiction: 'Canada (fédéral) et Québec',
  sources: [
    { id: 'cra_tfsa', title: 'ARC, calcul des droits de cotisation CELI', url: 'https://www.canada.ca/tfsa' },
    { id: 'cra_fhsa', title: 'ARC, CELIAPP : droits de participation', url: 'https://www.canada.ca/fhsa' },
  ],
  tfsa: { eligibility_age: 18, annual_limits: { '2025': 7000, '2026': 7000 }, source_id: 'cra_tfsa' },
  rrsp: { rate_of_earned_income: 0.18, dollar_limit: 33810, source_id: 'cra_rrsp' },
  fhsa: { annual_limit: 8000, lifetime_limit: 40000, max_participation_years: 15, max_age: 71, source_id: 'cra_fhsa' },
  capital_gains: { inclusion_rate: 0.5, source_id: 'cra_capital_gains' },
  eligible_dividends: {
    gross_up: 0.38,
    federal_credit_rate: 0.150198,
    quebec_credit_rate: 0.117,
    source_ids: ['cra_dividend_credit', 'rq_dividend_credit'],
  },
  us_dividend_withholding: { rate: 0.15, exempt_accounts: ['REER'], source_id: 'canada_us_treaty' },
  rrsp_maturity: { max_age: 71, source_id: 'cra_rrsp_maturity' },
  home_buyers_plan: { withdrawal_limit: 60000, repayment_years: 15, source_id: 'cra_hbp' },
  tfsa_total_since_2009: 109000,
  projection_returns: { canadian_equities: 0.063, us_equities: 0.064 },
  projection_source_id: 'iqpf_2026',
}

export const ASSETS: AssetSummary[] = [
  { ticker: 'RY.TO', name: 'Royal Bank of Canada', asset_class: 'equity', currency: 'CAD', sector: 'Financials' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', asset_class: 'equity', currency: 'USD', sector: 'Health Care' },
  { ticker: 'XBB.TO', name: 'iShares Core Canadian Universe Bond Index ETF', asset_class: 'etf_bond', currency: 'CAD', sector: 'Bonds' },
]

function outcome(account: AccountOutcome['account'], afterTax: number, extra: Partial<AccountOutcome> = {}): AccountOutcome {
  return {
    account,
    eligible: true,
    deposits: 21000,
    side_deposits: 0,
    gross_value: afterTax,
    tax_at_exit: 0,
    after_tax: afterTax,
    annual_tax_paid: 0,
    withholding_lost: 0,
    notes: [],
    after_tax_low: afterTax - 1000,
    after_tax_high: afterTax + 1000,
    ...extra,
  }
}

export const PROJECTION: AccountProjection = {
  profile: {
    persona_id: 'amira',
    name: 'Amira',
    age: 26,
    horizon: '15 ans et plus',
    horizon_years: [15, 40],
    risk_tolerance: 'élevé',
    income: 62000,
    retirement_income: 43400,
    first_home_buyer: true,
    rate_now: 0.3612,
    rate_retirement: 0.2569,
    rate_federal: 0.1712,
    rate_quebec: 0.19,
    eligible_dividend_rate: 0.1639,
    tfsa_room: 57000,
    rrsp_room: 11160,
    fhsa_eligible: true,
    fhsa_years: 15,
    fhsa_reason: 'Admissible : jusqu’à 15 ans de participation (limite des 15 ans).',
    demo_assumptions: ['Revenu de Amira : 62 000 $ (valeur de démonstration).'],
  },
  asset: null,
  inputs: {
    annual_contribution: 7000,
    years: 3,
    total_return: 0.05,
    price_return: 0.05,
    dividend_yield: 0,
    distribution_rate: 0,
    scenario_spread: 0.02,
  },
  series: [
    { year: 1, CELI: 4697, REER: 5460, CELIAPP: 7350, 'Non enregistré': 4685 },
    { year: 2, CELI: 9629, REER: 11193, CELIAPP: 15067, 'Non enregistré': 9578 },
    { year: 3, CELI: 14808, REER: 17213, CELIAPP: 23171, 'Non enregistré': 14684 },
  ],
  accounts: [
    outcome('CELI', 14808),
    outcome('REER', 17213, { tax_at_exit: 5950 }),
    outcome('CELIAPP', 23171),
    outcome('Non enregistré', 14684, { tax_at_exit: 124 }),
  ],
  ranking: [
    { account: 'CELIAPP', after_tax: 23171 },
    { account: 'REER', after_tax: 17213 },
    { account: 'CELI', after_tax: 14808 },
    { account: 'Non enregistré', after_tax: 14684 },
  ],
  comparison: {
    headline:
      'Dans cette simulation, le CELIAPP donne le montant après impôt le plus élevé dans 3 ans : 23 171 $, soit 5 958 $ de plus que le REER.',
    accounts: [],
  },
  profile_flags: [],
  assumptions: ['Montant annuel exprimé avant impôt, versé en début d’année.'],
  limits: ['Simulation éducative, pas un conseil financier personnalisé.'],
  sources: [{ id: 'cra_tfsa', title: 'ARC, calcul des droits de cotisation CELI', url: 'https://www.canada.ca/tfsa' }],
}

export const STOCK_PROJECTION: AccountProjection = {
  ...PROJECTION,
  profile: { ...PROJECTION.profile, first_home_buyer: false, fhsa_eligible: false, fhsa_reason: "Réservé aux premiers acheteurs d'une propriété." },
  asset: {
    ticker: 'JNJ',
    name: 'Johnson & Johnson',
    asset_class: 'equity',
    currency: 'USD',
    market: 'NYSE',
    sector: 'Health Care',
    income_type: 'foreign_dividend',
    income_label: 'Dividendes américains',
    dividend_yield: 0.0186,
    us_withholding: true,
    hist_return: 0.183,
    hist_volatility: 0.178,
    hist_period: '2021-11 à 2026-11',
    expected_return: 0.064,
    expected_return_basis: 'Actions américaines (normes de projection 2026)',
  },
  accounts: [
    outcome('CELI', 14700, { withholding_lost: 40 }),
    outcome('REER', 17300),
    { ...outcome('CELIAPP', 0), eligible: false, notes: ['Non admissible : pas premier acheteur.'], after_tax_low: null, after_tax_high: null },
    outcome('Non enregistré', 14600, { annual_tax_paid: 90 }),
  ],
  series: PROJECTION.series.map((point) => ({ ...point, CELIAPP: null })),
  ranking: [
    { account: 'REER', after_tax: 17300 },
    { account: 'CELI', after_tax: 14700 },
    { account: 'Non enregistré', after_tax: 14600 },
  ],
  comparison: {
    headline: 'Dans cette simulation, le REER donne le montant après impôt le plus élevé dans 3 ans : 17 300 $, soit 2 600 $ de plus que le CELI.',
    accounts: [
      {
        account: 'REER',
        rank: 1,
        standing: 'highest',
        standing_label: 'Montant le plus élevé',
        summary: 'Environ 17 300 $ après impôt dans 3 ans.',
        pros: ['Dividendes américains exemptés de la retenue de 15 % (convention fiscale Canada–États-Unis).'],
        cons: ['Chaque retrait est imposé comme un salaire, gains et dividendes compris.'],
      },
      {
        account: 'CELI',
        rank: 2,
        standing: 'lower',
        standing_label: 'Montant plus bas',
        summary: 'Environ 14 700 $ après impôt dans 3 ans.',
        pros: ["Retraits libres d'impôt, en tout temps ; les droits reviennent l'année suivante."],
        cons: ['Retenue américaine de 15 % non récupérable : environ 40 $ perdus sur 3 ans.'],
      },
      {
        account: 'CELIAPP',
        rank: null,
        standing: 'ineligible',
        standing_label: 'Non admissible',
        summary: "Réservé aux premiers acheteurs d'une propriété.",
        pros: [],
        cons: ["Réservé aux premiers acheteurs d'une propriété."],
      },
    ],
  },
  profile_flags: ['Volatilité historique de 18 % supérieure au maximum du profil (10 %).'],
}

/** STOCK_PROJECTION for another ticker of the starter kit. */
export function stockProjection(ticker: string, name: string): AccountProjection {
  const asset = STOCK_PROJECTION.asset
  return {
    ...STOCK_PROJECTION,
    asset: asset && { ...asset, ticker, name },
    comparison: {
      ...STOCK_PROJECTION.comparison,
      headline: `Dans cette simulation (${name}, ${ticker}), le REER donne le montant après impôt le plus élevé dans 3 ans.`,
    },
  }
}
