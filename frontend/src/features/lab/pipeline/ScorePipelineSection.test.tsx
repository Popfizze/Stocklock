import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import {
  SCORE_RUN_FAILED,
  SCORE_RUN_LIST,
  SCORE_RUN_LIST_UNCONFIGURED,
  SCORE_RUN_RUNNING,
  SCORE_RUN_SUCCEEDED,
} from '@/test/pipeline'
import { ScorePipelineSection } from './ScorePipelineSection'

const ORIGINAL_FETCH = globalThis.fetch

function mockApi(list: MockResponse[], run: MockResponse[] = [json(SCORE_RUN_SUCCEEDED)]) {
  return mockFetchByUrl([
    { match: /\/api\/pipeline\/score\/runs\/.+/, responses: run },
    { match: '/api/pipeline/score/runs', responses: list },
  ])
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('ScorePipelineSection', () => {
  it('says the pipeline is not deployed and offers no button', async () => {
    mockApi([json(SCORE_RUN_LIST_UNCONFIGURED)])
    renderWithProviders(<ScorePipelineSection />)

    expect(await screen.findByText(/n'est pas déployé sur ce serveur/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lancer le pipeline des scores' })).not.toBeInTheDocument()
  })

  it('shows the latest run: flow, stages with counts, decisions, samples and the result', async () => {
    mockApi([json(SCORE_RUN_LIST)])
    renderWithProviders(<ScorePipelineSection />)

    const view = within(await screen.findByRole('region', { name: 'Run affiché' }))
    expect(await view.findByText('20261114T215336Z-c41b40')).toBeInTheDocument()
    const flow = within(view.getByRole('list', { name: 'Étapes du run' }))
    expect(flow.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'EntréesTerminé',
      'BronzeTerminé',
      'SilverTerminé',
      'GoldTerminé',
      'SortieTerminé',
    ])

    // Entrées
    expect(view.getByText('Titres demandés').nextElementSibling).toHaveTextContent('15')
    expect(view.getByText('Actions canadiennes').nextElementSibling).toHaveTextContent('30 %')

    // A stage: status, row counts, timing; opened: decisions and a dataset sample.
    const univers = view.getByText('2. Univers').closest('li') as HTMLElement
    expect(univers).toHaveTextContent('Silver')
    expect(univers).toHaveTextContent('Terminé')
    expect(univers).toHaveTextContent(/univers_complet : 14\s409/)
    expect(univers).toHaveTextContent('0,5 s')
    await userEvent.click(within(univers).getByText('2. Univers'))
    expect(within(univers).getByText('Certificats de dépôt canadiens (CDR) écartés')).toBeVisible()
    expect(within(univers).getByText(/Échantillon de univers · 3 sur 15 lignes/)).toBeVisible()
    expect(within(univers).getByRole('row', { name: /RY\.TO Royal Bank of Canada TSX CAD action/ })).toBeInTheDocument()
    expect(within(univers).getByRole('link', { name: 'Yahoo Finance (profil de société)' })).toBeInTheDocument()

    // Sortie
    expect(view.getByText('Titres notés').nextElementSibling).toHaveTextContent('15')
    expect(view.getByText('Dont scores partiels').nextElementSibling).toHaveTextContent('4')
    expect(view.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/titres/NVDA')
    expect(view.getByRole('link', { name: /Voir « Meilleurs scores »/ })).toHaveAttribute(
      'href',
      '/#section-meilleurs-scores',
    )

    // Recent runs: the other one can be opened.
    expect(screen.getByRole('button', { name: 'Voir le run 20261114T215336Z-c41b40' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Voir le run 20261113T110000Z-aa11bb' })).toBeInTheDocument()
  })

  it('starts a run with its parameters and follows it', async () => {
    const calls = mockFetchByUrl([
      // The latest run first, then the one just started.
      { match: /\/api\/pipeline\/score\/runs\/.+/, responses: [json(SCORE_RUN_SUCCEEDED), json(SCORE_RUN_RUNNING)] },
      {
        match: '/api/pipeline/score/runs',
        // GET list, POST start, then the refreshed list.
        responses: [json(SCORE_RUN_LIST), json(SCORE_RUN_RUNNING, 202), json(SCORE_RUN_LIST)],
      },
    ])
    renderWithProviders(<ScorePipelineSection />)

    const titles = await screen.findByLabelText('Nombre de titres')
    expect(titles).toHaveValue(200)
    await userEvent.clear(titles)
    await userEvent.type(titles, '15')
    await userEvent.click(screen.getByRole('button', { name: 'Lancer le pipeline des scores' }))

    const post = await vi.waitFor(() => {
      const call = calls.find((candidate) => candidate.init.method === 'POST')
      expect(call).toBeDefined()
      return call
    })
    expect(JSON.parse(String(post?.init.body))).toEqual({
      max_titles: 15,
      ca_share: 0.3,
      etf_share: 0.1,
      news_per_title: 6,
      max_llm_articles: 1200,
    })

    const view = within(await screen.findByRole('region', { name: 'Run affiché' }))
    const flow = within(await view.findByRole('list', { name: 'Étapes du run' }))
    await vi.waitFor(() =>
      expect(flow.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'EntréesTerminé',
        'BronzeEn cours',
        'SilverEn cours',
        'GoldEn attente',
        'SortieEn attente',
      ]),
    )
    expect(view.getByText('5. Articles').closest('li')).toHaveTextContent('En cours')
    expect(view.getByText('4 étapes sur 9 terminées')).toBeInTheDocument()
    expect(view.getByText(/en cours : Articles/)).toBeInTheDocument()
    expect(view.getByRole('progressbar', { name: 'Avancement du run' })).toHaveAttribute('value', '4')
    expect(view.getByText(/sera écrite à la fin de l’étape Gold/)).toBeInTheDocument()
    // No second run while this one is going.
    expect(screen.getByRole('button', { name: /Run en cours/ })).toBeDisabled()
  })

  it('shows a failed run with the stage that broke', async () => {
    mockApi([json(SCORE_RUN_LIST)], [json(SCORE_RUN_FAILED)])
    renderWithProviders(<ScorePipelineSection />)

    const view = within(await screen.findByRole('region', { name: 'Run affiché' }))
    expect(await view.findByText(/Le run a échoué : RuntimeError/)).toBeInTheDocument()
    const articles = view.getByText('5. Articles').closest('li') as HTMLElement
    expect(articles).toHaveTextContent('Échec')
    expect(within(articles).getByRole('alert')).toHaveTextContent("Aucun filtre Yahoo Finance n'a répondu")
    expect(view.getByText('Ce run n’a pas produit de table des scores.')).toBeInTheDocument()
  })

  it('explains a refused start', async () => {
    mockFetchByUrl([
      { match: /\/api\/pipeline\/score\/runs\/.+/, responses: [json(SCORE_RUN_SUCCEEDED)] },
      {
        match: '/api/pipeline/score/runs',
        responses: [json(SCORE_RUN_LIST), json({ detail: 'run en cours' }, 409), json(SCORE_RUN_LIST)],
      },
    ])
    renderWithProviders(<ScorePipelineSection />)

    await userEvent.click(await screen.findByRole('button', { name: 'Lancer le pipeline des scores' }))
    expect(await screen.findByText(/Un run est déjà en cours/)).toBeInTheDocument()
  })
})
