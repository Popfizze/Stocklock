import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { LAB_CATALOG } from '@/test/lab'
import {
  SCORE_RUN_FAILED,
  SCORE_RUN_LIST,
  SCORE_RUN_LIST_UNCONFIGURED,
  SCORE_RUN_RUNNING,
  SCORE_RUN_SUCCEEDED,
} from '@/test/pipeline'
import { PipelinePage } from './PipelinePage'

const ORIGINAL_FETCH = globalThis.fetch

function renderScores(list: MockResponse[], run: MockResponse[] = [json(SCORE_RUN_SUCCEEDED)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: /\/api\/pipeline\/score\/runs\/.+/, responses: run },
    { match: '/api/pipeline/score/runs', responses: list },
  ])
  renderWithProviders(
    <Routes>
      <Route path="/labo/:pipelineId" element={<PipelinePage />} />
    </Routes>,
    { route: '/labo/scores', personaId: 'amira' },
  )
  return calls
}

const flow = async () =>
  within(await screen.findByRole('list', { name: 'Diagramme du pipeline de score' }))
const node = async (column: string, name: RegExp) =>
  within((await flow()).getByRole('region', { name: column })).getByRole('button', { name })

describe('PipelinePage (score pipeline)', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('draws the nine stages by layer with the latest run’s status, timing and rows', async () => {
    renderScores([json(SCORE_RUN_LIST)])

    expect(await screen.findByRole('heading', { level: 1, name: 'Table des scores' })).toBeInTheDocument()
    expect(await screen.findByText('20261114T215336Z-c41b40')).toBeInTheDocument()
    const diagram = await flow()
    const names = (column: string) =>
      within(diagram.getByRole('region', { name: column }))
        .getAllByRole('button')
        .map((button) => button.textContent?.replace(/(OK|Avertissement|En cours|En attente|Erreur).*/, ''))
    expect(names('Entrées')).toEqual(['Paramètres'])
    expect(names('Bronze')).toEqual(['1. Liste des titres', '3. Relevés financiers', '4. Cours quotidiens', '5. Articles'])
    expect(names('Silver')).toEqual(['2. Univers', '6. Relevés normalisés', '7. Cours propres', '8. Événements structurés'])
    expect(names('Gold')).toEqual(['9. Score par titre'])
    expect(names('Sortie')).toEqual(['Résultat'])

    const univers = await node('Silver', /Univers/)
    await vi.waitFor(() => expect(univers).toHaveTextContent('OK'))
    expect(univers).toHaveTextContent('500 ms')
    expect(univers).toHaveTextContent(/14\s409 lignes/)

    // A stage's detail: rows, decisions, sample, source.
    await userEvent.click(univers)
    const detail = within(screen.getByRole('region', { name: 'Détail : Univers' }))
    expect(detail.getByText('Fusion SEC + TMX, sélection des titres notés.')).toBeInTheDocument()
    expect(detail.getByText('Certificats de dépôt canadiens (CDR) écartés')).toBeInTheDocument()
    expect(detail.getByText(/Échantillon de univers · 3 sur 15 lignes/)).toBeInTheDocument()
    expect(detail.getByRole('row', { name: /RY\.TO Royal Bank of Canada TSX CAD action/ })).toBeInTheDocument()
    expect(detail.getByRole('link', { name: 'Yahoo Finance (profil de société)' })).toBeInTheDocument()

    // Entrées and Sortie.
    await userEvent.click(await node('Entrées', /Paramètres/))
    const inputs = within(screen.getByRole('region', { name: 'Détail : Paramètres' }))
    expect(inputs.getByText('Titres demandés').nextElementSibling).toHaveTextContent('15')
    expect(inputs.getByText('Actions canadiennes').nextElementSibling).toHaveTextContent('30 %')

    const output = within(screen.getByRole('region', { name: 'Résultat du run' }))
    expect(output.getByText('Titres notés').nextElementSibling).toHaveTextContent('15')
    expect(output.getByText('Dont scores partiels').nextElementSibling).toHaveTextContent('4')
    expect(output.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/titres/NVDA')
    expect(output.getByRole('link', { name: /Voir « Meilleurs scores »/ })).toHaveAttribute(
      'href',
      '/#section-meilleurs-scores',
    )
  })

  it('starts a run from the « Lancer » panel and follows it stage by stage', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
      // The latest run first, then the one just started.
      { match: /\/api\/pipeline\/score\/runs\/.+/, responses: [json(SCORE_RUN_SUCCEEDED), json(SCORE_RUN_RUNNING)] },
      // GET list, POST start, then the refreshed list.
      { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST), json(SCORE_RUN_RUNNING, 202), json(SCORE_RUN_LIST)] },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/labo/:pipelineId" element={<PipelinePage />} />
      </Routes>,
      { route: '/labo/scores', personaId: 'amira' },
    )

    const launch = await screen.findByRole('button', { name: 'Lancer' })
    expect(launch).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(launch)
    const panel = within(screen.getByRole('region', { name: 'Paramètres du run' }))
    const titles = panel.getByLabelText('Nombre de titres')
    expect(titles).toHaveValue(200)
    await userEvent.clear(titles)
    await userEvent.type(titles, '15')
    await userEvent.click(panel.getByRole('button', { name: 'Lancer le pipeline des scores' }))

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

    // Live progress, stage by stage.
    expect(await screen.findByText('4 étapes sur 9 terminées')).toBeInTheDocument()
    expect(screen.getByText(/en cours : Articles/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avancement du run' })).toHaveAttribute('value', '4')
    expect(await node('Bronze', /Articles/)).toHaveTextContent('En cours')
    expect(await node('Gold', /Score par titre/)).toHaveTextContent('En attente')
    expect(await node('Sortie', /Résultat/)).toHaveTextContent('En attente')
    // No second run while this one is going.
    expect(screen.getByRole('button', { name: 'Run en cours…' })).toBeDisabled()
  })

  it('shows a failed run with the stage that broke', async () => {
    renderScores([json(SCORE_RUN_LIST)], [json(SCORE_RUN_FAILED)])

    expect(await screen.findByText(/Le run a échoué : RuntimeError/)).toBeInTheDocument()
    const articles = await node('Bronze', /Articles/)
    expect(articles).toHaveTextContent('Erreur')
    await userEvent.click(articles)
    expect(
      within(screen.getByRole('region', { name: 'Détail : Articles' })).getByRole('alert'),
    ).toHaveTextContent("Aucun filtre Yahoo Finance n'a répondu")
    expect(within(screen.getByRole('region', { name: 'Résultat du run' })).getByText('Ce run n’a pas produit de table des scores.')).toBeInTheDocument()
  })

  it('opens the run in progress when a start is refused (409)', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
      { match: /\/api\/pipeline\/score\/runs\/.+/, responses: [json(SCORE_RUN_SUCCEEDED)] },
      { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST), json({ detail: 'run en cours' }, 409), json(SCORE_RUN_LIST)] },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/labo/:pipelineId" element={<PipelinePage />} />
      </Routes>,
      { route: '/labo/scores', personaId: 'amira' },
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Lancer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lancer le pipeline des scores' }))
    expect(await screen.findByText(/Un run est déjà en cours/)).toBeInTheDocument()
  })

  it('lists the runs, shows another one and compares two', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
      { match: '/api/pipeline/score/runs/20261113T110000Z-aa11bb', responses: [json(SCORE_RUN_FAILED)] },
      { match: /\/api\/pipeline\/score\/runs\/.+/, responses: [json(SCORE_RUN_SUCCEEDED)] },
      { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST)] },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/labo/:pipelineId" element={<PipelinePage />} />
      </Routes>,
      { route: '/labo/scores', personaId: 'amira' },
    )

    const history = within(await screen.findByRole('region', { name: 'Historique' }))
    const rows = history.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('15 titres notés')
    expect(rows[0]).toHaveTextContent('Lancé depuis le Labo · 1 min 36 s')
    expect(rows[1]).toHaveTextContent('Planifié')
    expect(within(rows[0]).getByRole('button', { name: /Voir le run/ })).toHaveAttribute('aria-pressed', 'true')

    const boxes = history.getAllByRole('checkbox')
    await userEvent.click(boxes[0])
    await userEvent.click(boxes[1])
    const compare = within(await history.findByRole('region', { name: 'Comparaison de deux runs' }))
    expect(compare.getByRole('row', { name: /Statut Terminé Échec/ })).toBeInTheDocument()
    expect(compare.getByRole('row', { name: /Titres notés 15 —/ })).toBeInTheDocument()
    expect(compare.getByText('Mêmes paramètres pour les deux runs.')).toBeInTheDocument()
    // A decision only one run took shows up as changed.
    expect(compare.getByRole('row', { name: /Événements structurés · Extraits non retrouvés/ })).toBeInTheDocument()
  })

  it('shows the diagram but no launch where the pipeline is not deployed', async () => {
    renderScores([json(SCORE_RUN_LIST_UNCONFIGURED)])

    expect(await screen.findByText(/n'est pas déployé sur ce serveur/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
    expect(await node('Gold', /Score par titre/)).toHaveTextContent('Pas encore exécuté')
    expect(screen.queryByRole('region', { name: 'Historique' })).not.toBeInTheDocument()
  })
})
