import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { LAB_CATALOG } from '@/test/lab'
import { SCORE_RUN_LIST, SCORE_RUN_LIST_UNCONFIGURED } from '@/test/pipeline'
import { LabPage } from './LabPage'
import { storeLabRuns, type StoredLabRun } from './labHistory'

const ORIGINAL_FETCH = globalThis.fetch

function renderLab(scoreRuns: MockResponse = json(SCORE_RUN_LIST), catalog: MockResponse = json(LAB_CATALOG)) {
  mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [catalog] },
    { match: '/api/pipeline/score/runs', responses: [scoreRuns] },
  ])
  return renderWithProviders(<LabPage />, { route: '/labo', personaId: 'amira' })
}

const STORED: StoredLabRun = {
  runId: 'run-1',
  at: '2026-11-14T15:30:00Z',
  status: 'warning',
  durationMs: 1840,
  keyResult: 'Score : 72',
  governancePassed: false,
  changedOptions: [],
  params: {},
  decisions: {},
}

describe('LabPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('lists the pipelines, each one opening its page', async () => {
    renderLab()

    expect(screen.getByRole('heading', { level: 1, name: 'Labo' })).toBeInTheDocument()
    const list = within(screen.getByRole('list', { name: 'Pipelines' }))
    expect(list.getByRole('link', { name: /Table des scores/ })).toHaveAttribute('href', '/labo/scores')
    expect(await list.findByRole('link', { name: /1\. Score/ })).toHaveAttribute('href', '/labo/score')
    const fluctuations = list.getByRole('link', { name: /2\. Fluctuations/ })
    expect(fluctuations).toHaveAttribute('href', '/labo/fluctuations')
    expect(fluctuations).toHaveTextContent('Synchrone · 1 étapes')
    expect(list.getByRole('link', { name: /1\. Score/ })).toHaveTextContent('Collecte → Notation')
  })

  it('shows the last run of each pipeline, or that it never ran', async () => {
    storeLabRuns('score', [STORED])
    renderLab()

    const list = within(screen.getByRole('list', { name: 'Pipelines' }))
    // The score pipeline's last run comes from AWS.
    const scores = list.getByRole('link', { name: /Table des scores/ })
    expect(await within(scores).findByText('Terminé')).toBeInTheDocument()
    expect(scores).toHaveTextContent(/14 nov\. 2026/)
    // The lab pipelines' from this browser's history.
    const score = await list.findByRole('link', { name: /1\. Score/ })
    expect(within(score).getByText('Avertissement')).toBeInTheDocument()
    expect(score).toHaveTextContent(/14 nov\. 2026/)
    expect(list.getByRole('link', { name: /2\. Fluctuations/ })).toHaveTextContent('Jamais exécuté')
  })

  it('says the score pipeline never ran where it is not deployed', async () => {
    renderLab(json(SCORE_RUN_LIST_UNCONFIGURED))

    const scores = screen.getByRole('link', { name: /Table des scores/ })
    expect(await within(scores).findByText('Jamais exécuté')).toBeInTheDocument()
  })

  it('explains a catalog that cannot be loaded, and still lists the score pipeline', async () => {
    renderLab(json(SCORE_RUN_LIST), json({ detail: 'boom' }, 500))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Le serveur n'a pas pu fournir les pipelines (erreur 500)",
    )
    expect(screen.getByRole('link', { name: /Table des scores/ })).toBeInTheDocument()
  })
})
