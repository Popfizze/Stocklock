import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import type { RunDetail } from '@/api/runs'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { LAB_CATALOG } from '@/test/lab'
import { PERSONAS } from '@/test/personas'
import { SCORE_RUN_LIST, SCORE_RUN_RUNNING, SCORE_RUN_TICKERS } from '@/test/pipeline'
import {
  RUN_ARTIFACT_PREVIEW,
  RUN_ARTIFACTS,
  RUN_BATCH,
  RUN_DETAIL_BATCH,
  RUN_DETAIL_LAB,
  RUN_LAB,
  RUN_PAGE,
  RUN_SCORE_PIPELINE,
  RUN_STAGE_LAB,
} from '@/test/runs'
import { RunPage } from './RunPage'

const ORIGINAL_FETCH = globalThis.fetch

const SCORE_DETAIL: RunDetail = {
  ...RUN_SCORE_PIPELINE,
  run_id: SCORE_RUN_TICKERS.run_id,
  status: 'succeeded',
  inputs: null,
  options: null,
  group: null,
  stages: [],
  result: null,
  children: [],
  table: null,
  params: SCORE_RUN_TICKERS.params,
  summary: SCORE_RUN_TICKERS.summary,
}

function renderRun(runId: string, extra: Array<{ match: string | RegExp; responses: MockResponse[] }> = []) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    ...extra,
    { match: /\/api\/runs\/[^/]+\/artifacts\/.+/, responses: [json(RUN_ARTIFACT_PREVIEW)] },
    { match: /\/api\/runs\/[^/]+\/artifacts/, responses: [json(RUN_ARTIFACTS)] },
    { match: /\/api\/runs\/[^/]+\/stages\//, responses: [json(RUN_STAGE_LAB)] },
    { match: '/api/runs?', responses: [json(RUN_PAGE)] },
    { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST)] },
  ])
  renderWithProviders(
    <Routes>
      <Route path="/labo/executions/:runId" element={<RunPage />} />
    </Routes>,
    { route: `/labo/executions/${runId}`, personaId: 'amira' },
  )
  return calls
}

describe('RunPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('shows a Labo run: its stages on the conveyor, its result and its governance', async () => {
    renderRun(RUN_LAB.run_id, [{ match: new RegExp(`/api/runs/${RUN_LAB.run_id}$`), responses: [json(RUN_DETAIL_LAB)] }])

    expect(await screen.findByRole('heading', { level: 1, name: 'SHOP.TO' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Convoyeur 3D du run SHOP\.TO.*2 étapes, 2 terminées/ })).toBeInTheDocument()

    const stages = within(screen.getByRole('list', { name: 'Étapes du run' }))
    expect(stages.getByRole('button', { name: /1\. Collecte/ })).toHaveTextContent('Terminé · 420 ms · 3 lignes')
    expect(stages.getByRole('button', { name: /2\. Notation/ })).toHaveTextContent('Avertissement')
    // The result is what the page opens on.
    expect(stages.getByRole('button', { name: /Résultat/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Score de 72 sur 100.')).toBeInTheDocument()
    expect(screen.getByText('Marge')).toBeInTheDocument()
    expect(screen.getByText('Fraîcheur')).toBeInTheDocument()
    expect(screen.getByText('Échouée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relancer' })).toHaveAttribute('href', '/labo/lancer?pipeline=score')
  })

  it('opens a stage on its decisions and outputs, and the run inputs', async () => {
    const user = userEvent.setup()
    const calls = renderRun(RUN_LAB.run_id, [{ match: new RegExp(`/api/runs/${RUN_LAB.run_id}$`), responses: [json(RUN_DETAIL_LAB)] }])

    await user.click(await screen.findByRole('button', { name: /1\. Collecte/ }))

    expect(await screen.findByText('Quelle source de prix pour SHOP.TO ?')).toBeInTheDocument()
    expect(screen.getByText('kit de départ (prices_daily.csv)')).toBeInTheDocument()
    expect(screen.getByText('Faits XBRL EDGAR (companyfacts)')).toBeInTheDocument()
    expect(calls.some((call) => call.url.endsWith(`/api/runs/${RUN_LAB.run_id}/stages/fetch`))).toBe(true)

    await user.click(screen.getByRole('button', { name: /Paramètres/ }))
    expect(screen.getByText('peers')).toBeInTheDocument()
    expect(screen.getByText('fetch.window')).toBeInTheDocument()
  })

  it('lists every generated element with its shape, and pages through one as a grid', async () => {
    const user = userEvent.setup()
    renderRun(RUN_LAB.run_id, [{ match: new RegExp(`/api/runs/${RUN_LAB.run_id}$`), responses: [json(RUN_DETAIL_LAB)] }])

    const elements = within(await screen.findByRole('list', { name: 'Éléments générés' }))
    expect(elements.getAllByRole('listitem')).toHaveLength(3)
    const prices = elements.getByRole('button', { name: /Prix quotidiens SHOP\.TO/ })
    expect(prices).toHaveTextContent('2 lignes × 4 colonnes')
    expect(elements.getByRole('button', { name: /univers\.csv/ })).toHaveTextContent('csv')

    await user.click(prices)
    const grid = within(await screen.findByRole('region', { name: 'Données : Prix quotidiens SHOP.TO' }))
    expect(grid.getByRole('columnheader', { name: 'close' })).toBeInTheDocument()
    expect(grid.getByRole('cell', { name: '101,5' })).toBeInTheDocument()
    expect(screen.getByText('Lignes 1–2 sur 2')).toBeInTheDocument()
  })

  it('shows a group run: its titles, the ones that did not finish, and the table across titles', async () => {
    renderRun(RUN_BATCH.run_id, [{ match: new RegExp(`/api/runs/${RUN_BATCH.run_id}$`), responses: [json(RUN_DETAIL_BATCH)] }])

    expect(await screen.findByRole('heading', { level: 3, name: 'Résultat du groupe' })).toBeInTheDocument()
    // The group's stages come from the catalog; its three titles stand on the conveyor.
    expect(screen.getByRole('img', { name: /Convoyeur 3D.*3 titres du groupe/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Résultat du groupe en 3D : une colonne par titre \(3\)/ })).toBeInTheDocument()

    const table = within(screen.getByRole('region', { name: 'Tableau du groupe' }))
    expect(table.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/labo/executions/run-nvda')
    expect(table.getByRole('cell', { name: /^52\s%$/ })).toBeInTheDocument()

    expect(screen.getByText(/Non terminé dans le temps imparti/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relancer ce titre seul' })).toHaveAttribute('href', '/labo/lancer?pipeline=score&titres=INTC')
  })

  it('shows a score pipeline run from its own record: titles scored, top titles, unknown tickers', async () => {
    const id = SCORE_RUN_TICKERS.run_id
    renderRun(id, [
      { match: new RegExp(`/api/runs/${id}$`), responses: [json(SCORE_DETAIL)] },
      { match: `/api/pipeline/score/runs/${id}`, responses: [json(SCORE_RUN_TICKERS)] },
    ])

    expect(await screen.findByRole('heading', { level: 3, name: 'Résultat du run' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Convoyeur 3D.*9 étapes, 9 terminées, 4 titres du groupe/ })).toBeInTheDocument()
    expect(screen.getByText('Appels Bedrock')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SHOP\.TO/ })).toHaveAttribute('href', '/titres/SHOP.TO')
    expect(screen.getByText(/inconnu de l'univers SEC\/TMX/)).toHaveTextContent('ZZZZ')
    expect(screen.getByText(/lu comme BRK-B/)).toBeInTheDocument()
  })

  it('follows a score pipeline run that is still going, even when the registry does not know it', async () => {
    const user = userEvent.setup()
    const id = SCORE_RUN_RUNNING.run_id
    renderRun(id, [
      { match: new RegExp(`/api/runs/${id}$`), responses: [json({ detail: 'Run introuvable' }, 404)] },
      { match: `/api/pipeline/score/runs/${id}`, responses: [json(SCORE_RUN_RUNNING)] },
    ])

    expect(await screen.findByText(/Étape en cours : Articles/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /9 étapes, 4 terminées, 1 en cours/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /2\. Univers/ }))
    expect(screen.getByRole('region', { name: 'Extrait : univers' })).toBeInTheDocument()
  })

  it('says so when the run does not exist', async () => {
    renderRun('nope', [
      { match: '/api/runs/nope', responses: [json({ detail: 'Run introuvable' }, 404)] },
      { match: '/api/pipeline/score/runs/nope', responses: [json({ detail: 'introuvable' }, 404)] },
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce run est introuvable (nope).')
  })
})
