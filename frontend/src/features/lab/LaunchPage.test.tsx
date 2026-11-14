import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useParams } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { LAB_BATCH_RUN, LAB_CATALOG, LAB_GROUPS, LAB_RUN } from '@/test/lab'
import { PERSONAS } from '@/test/personas'
import { SCORE_RUN_LIST, SCORE_RUN_LIST_RUNNING, SCORE_RUN_LIST_UNCONFIGURED, SCORE_RUN_RUNNING } from '@/test/pipeline'
import { LaunchPage } from './LaunchPage'

const ORIGINAL_FETCH = globalThis.fetch

function Landed() {
  return <p>Page du run {useParams().runId}</p>
}

interface Mocks {
  scoreRuns?: MockResponse
  scoreStart?: MockResponse[]
  batch?: MockResponse[]
  single?: MockResponse
}

function renderLaunch(route: string, mocks: Mocks = {}) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: '/api/lab/groups', responses: [json(LAB_GROUPS)] },
    { match: '/api/lab/run-batch', responses: mocks.batch ?? [json(LAB_BATCH_RUN)] },
    { match: '/api/lab/run', responses: [mocks.single ?? json(LAB_RUN)] },
    { match: '/api/universe/search', responses: [json({ query: 'nv', total: 1, results: [{ ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'Nasdaq', country: 'US' }], crypto: [] })] },
    // GET lists the runs; POST starts one.
    { match: '/api/pipeline/score/runs', responses: [mocks.scoreRuns ?? json(SCORE_RUN_LIST), ...(mocks.scoreStart ?? [json(SCORE_RUN_RUNNING, 202)])] },
  ])
  renderWithProviders(
    <Routes>
      <Route path="/labo/lancer" element={<LaunchPage />} />
      <Route path="/labo/executions/:runId" element={<Landed />} />
    </Routes>,
    { route, personaId: 'amira' },
  )
  return calls
}

const bodyOf = (calls: Array<{ url: string; init: RequestInit }>, path: string) => {
  const call = calls.find((candidate) => candidate.url.endsWith(path) && candidate.init.method === 'POST')
  return call ? (JSON.parse(String(call.init.body)) as Record<string, unknown>) : undefined
}

describe('LaunchPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('offers every pipeline, the score pipeline first', async () => {
    renderLaunch('/labo/lancer')

    const pipelines = within(screen.getByRole('radiogroup', { name: 'Pipeline' }))
    expect(pipelines.getByRole('radio', { name: /Pipeline de score/ })).toBeChecked()
    expect(await pipelines.findByRole('radio', { name: /1\. Score/ })).toHaveTextContent('groupe ou titre seul')
    expect(pipelines.getByRole('radio', { name: /2\. Fluctuations/ })).toHaveTextContent('un scénario à la fois')
  })

  it('starts the score pipeline on a dashboard section and lands on the run', async () => {
    const user = userEvent.setup()
    const calls = renderLaunch('/labo/lancer')

    await user.click(await screen.findByRole('radio', { name: 'Section du tableau de bord' }))
    expect(screen.getByText('Choisissez une section.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Populaires au Canada' }))
    expect(screen.getByText('30 titres')).toBeInTheDocument()
    expect(screen.getByText('· plafond 100')).toBeInTheDocument()

    // A changed setting is marked.
    fireEvent.change(screen.getByRole('slider', { name: 'Articles par titre' }), { target: { value: '3' } })
    expect(screen.getByText('Modifié')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lancer le run' }))

    expect(await screen.findByText(`Page du run ${SCORE_RUN_RUNNING.run_id}`)).toBeInTheDocument()
    expect(bodyOf(calls, '/api/pipeline/score/runs')).toMatchObject({
      news_per_title: 3,
      group: { kind: 'section', id: 'canada-populaires', limit: 30 },
    })
  })

  it('does not start a second score run: it points to the one going', async () => {
    renderLaunch('/labo/lancer', { scoreRuns: json(SCORE_RUN_LIST_RUNNING) })

    expect(await screen.findByRole('link', { name: "l'ouvrir" })).toHaveAttribute('href', '/labo/executions/20261115T110000Z-cc22dd')
    expect(screen.getByRole('button', { name: 'Lancer le run' })).toBeDisabled()
  })

  it('says when the score pipeline is not deployed', async () => {
    renderLaunch('/labo/lancer', { scoreRuns: json(SCORE_RUN_LIST_UNCONFIGURED) })

    expect(await screen.findByRole('note')).toHaveTextContent("n'est pas déployé sur ce serveur")
    expect(screen.getByRole('button', { name: 'Lancer le run' })).toBeDisabled()
  })

  it('runs a Labo step on the profile portfolio as a group, with the options chosen', async () => {
    const user = userEvent.setup()
    const calls = renderLaunch('/labo/lancer?pipeline=score')

    const portfolio = within(await screen.findByRole('list', { name: 'Titres du portefeuille' }))
    expect(portfolio.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByRole('img', { name: /Convoyeur 3D du pipeline 1\. Score.*8 titres du groupe/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '5 ans' }))
    await user.click(screen.getByRole('button', { name: 'Lancer le run' }))

    expect(await screen.findByText('Page du run batch-1')).toBeInTheDocument()
    const body = bodyOf(calls, '/api/lab/run-batch')
    expect(body).toMatchObject({
      step: 'score',
      persona_id: 'amira',
      group: { kind: 'portfolio' },
      options: { 'fetch.window': '5y', 'scoring.method': 'rank' },
    })
    expect((body?.group as { tickers: string[] }).tickers).toContain('NVDA')
    // The per-title input is the group's, not a field.
    expect(body?.inputs).not.toHaveProperty('ticker')
  })

  it('builds a custom set from the universe search; a single title is a single run', async () => {
    const user = userEvent.setup()
    const calls = renderLaunch('/labo/lancer?pipeline=score')

    await user.click(await screen.findByRole('radio', { name: 'Titres choisis' }))
    expect(screen.getByText('Ajoutez au moins un titre au groupe.')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /Titres du groupe/ }), 'nv')
    await user.click(await screen.findByRole('button', { name: 'Ajouter NVDA, NVIDIA Corporation' }))
    expect(screen.getByRole('button', { name: 'Retirer NVDA' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lancer le run' }))

    expect(await screen.findByText('Page du run run-1')).toBeInTheDocument()
    expect(bodyOf(calls, '/api/lab/run')).toMatchObject({ step: 'score', inputs: { ticker: 'NVDA' } })
  })

  it('offers to shrink a group the server finds too large', async () => {
    const user = userEvent.setup()
    const tooLarge = json({ detail: 'Groupe trop grand pour une exécution : environ 400 s estimées pour 8 titres, limite 240 s. Lancez 4 titres au plus avec ces options.' }, 422)
    const calls = renderLaunch('/labo/lancer?pipeline=score', { batch: [tooLarge, json(LAB_BATCH_RUN)] })

    await user.click(await screen.findByRole('button', { name: 'Lancer le run' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Groupe trop grand')
    await user.click(screen.getByRole('button', { name: 'Réduire le groupe à 4 titres' }))
    expect(screen.getByText('4 titres')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lancer le run' }))
    await screen.findByText('Page du run batch-1')
    const posts = calls.filter((call) => call.url.endsWith('/api/lab/run-batch'))
    expect((JSON.parse(String(posts[1].init.body)) as { group: { tickers: string[] } }).group.tickers).toHaveLength(4)
  })

  it('runs a step that takes no title on its one scenario, starting from a preset title when given', async () => {
    const user = userEvent.setup()
    const calls = renderLaunch('/labo/lancer?pipeline=fluctuations')

    expect(await screen.findByRole('textbox', { name: 'Question' })).toHaveValue('Pourquoi ?')
    expect(screen.queryByRole('radiogroup', { name: 'Type de groupe' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lancer le run' }))

    await waitFor(() => expect(bodyOf(calls, '/api/lab/run')).toMatchObject({ step: 'fluctuations', inputs: { question: 'Pourquoi ?' } }))
  })
})
