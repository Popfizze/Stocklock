import type { StockDetail } from '@/api/stocks'
import { stockProjection } from './accounts'
import { json, mockFetchByUrl, type MockResponse } from './mockFetch'
import { ESG_AAPL, FIT_NVDA_AMIRA, HYPE_AAPL_LOW } from './persona'
import { PERSONAS } from './personas'
import { SCORE_ABSENT } from './stocks'

type Route = Parameters<typeof mockFetchByUrl>[0][number]

/** The answer of each block of the stock page; a block left out gets a calm default. */
export interface StockPageAnswers {
  fit?: MockResponse
  hype?: MockResponse
  esg?: MockResponse
  score?: MockResponse
  account?: MockResponse
}

/**
 * Mocks every request the stock page (`/titres/:ticker`) fires for `stock`
 * over the default range. `first` routes are tried before the page's own
 * (another range, the step 2 and step 4 analyses…).
 */
export function mockStockPage(stock: StockDetail, answers: StockPageAnswers = {}, first: Route[] = []) {
  return mockFetchByUrl([
    ...first,
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/fit/', responses: [answers.fit ?? json(FIT_NVDA_AMIRA)] },
    { match: '/api/hype/', responses: [answers.hype ?? json(HYPE_AAPL_LOW)] },
    { match: '/api/esg/', responses: [answers.esg ?? json(ESG_AAPL)] },
    { match: '/api/scores/', responses: [answers.score ?? json(SCORE_ABSENT)] },
    { match: `/api/stocks/${stock.ticker}?range=1M`, responses: [json(stock)] },
    {
      match: '/api/accounts/projection',
      responses: [answers.account ?? json(stockProjection(stock.ticker, stock.name))],
    },
  ])
}
