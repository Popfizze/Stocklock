import type { PortfolioHolding } from '@/api/persona'

/**
 * An example portfolio per investor profile, to start the « Mon portefeuille » page
 * before the visitor enters their own holdings (kept in localStorage per profile).
 * Weights are percentages; the API normalises them. Each one is plausible for its
 * profile but keeps one point the analysis should raise.
 */
export const EXAMPLE_PORTFOLIOS: Record<string, PortfolioHolding[]> = {
  // AI and crypto, but spread out; ETH + BTC stay under her 25 % maximum position.
  amira: [
    { ticker: 'NVDA', weight: 20 },
    { ticker: 'AMD', weight: 10 },
    { ticker: 'MSFT', weight: 15 },
    { ticker: 'BTC-USD', weight: 15 },
    { ticker: 'ETH-USD', weight: 5 },
    { ticker: 'SHOP.TO', weight: 10 },
    { ticker: 'XIU.TO', weight: 15 },
    { ticker: 'VFV.TO', weight: 10 },
  ],
  // ESG leaning, at most 15 % per title; Enbridge (Energy) is the point to raise.
  mateo: [
    { ticker: 'MSFT', weight: 12 },
    { ticker: 'AAPL', weight: 10 },
    { ticker: 'RY.TO', weight: 12 },
    { ticker: 'TD.TO', weight: 10 },
    { ticker: 'JNJ', weight: 8 },
    { ticker: 'NEE', weight: 8 },
    { ticker: 'XESG.TO', weight: 15 },
    { ticker: 'ESGV', weight: 15 },
    { ticker: 'ENB.TO', weight: 10 },
  ],
  // Income and capital preservation, at most 10 % per title; the hyped stock is the point to raise.
  robert: [
    { ticker: 'XBB.TO', weight: 10 },
    { ticker: 'ZAG.TO', weight: 10 },
    { ticker: 'RY.TO', weight: 10 },
    { ticker: 'BNS.TO', weight: 8 },
    { ticker: 'BCE.TO', weight: 8 },
    { ticker: 'FTS.TO', weight: 10 },
    { ticker: 'ENB.TO', weight: 8 },
    { ticker: 'JNJ', weight: 8 },
    { ticker: 'PG', weight: 8 },
    { ticker: 'KO', weight: 8 },
    { ticker: 'PLTR', weight: 12 },
  ],
}
