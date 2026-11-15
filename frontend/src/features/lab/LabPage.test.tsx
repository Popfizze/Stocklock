import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { SCORE_RUN_LIST } from '@/test/pipeline'
import { RUN_BATCH, RUN_DETAIL_BATCH, RUN_LAB, RUN_PAGE, RUN_SCORE_PIPELINE } from '@/test/runs'
import { LabPage } from './LabPage'

const ORIGINAL_FETCH = globalThis.fetch

function renderLab(runs: MockResponse = json(RUN_PAGE)) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST)] },
    { match: `/api/runs/${RUN_BATCH.run_id}`, responses: [json(RUN_DETAIL_BATCH)] },
    { match: '/api/runs?', responses: [runs] },
  ])
  renderWithProviders(<LabPage />, { route: '/labo', personaId: 'amira' })
  return calls
}

describe('LabPage (Exécutions)', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('lists every run of every pipeline, each one opening its page, with the 3D frieze described', async () => {
    renderLab()

    expect(screen.getByRole('heading', { level: 1, name: 'Labo des exécutions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lancer une exécution' })).toHaveAttribute('href', '/labo/lancer')

    const list = within(await screen.findByRole('list', { name: /^Exécutions du/ }))
    expect(list.getByRole('link', { name: /SHOP\.TO/ })).toHaveAttribute('href', `/labo/executions/${RUN_LAB.run_id}`)
    expect(list.getByRole('link', { name: /Les plus populaires/ })).toHaveAttribute('href', `/labo/executions/${RUN_BATCH.run_id}`)
    const scheduled = list.getByRole('link', { name: /Pipeline de score du 2026-11-14/ })
    expect(scheduled).toHaveAttribute('href', `/labo/executions/${RUN_SCORE_PIPELINE.run_id}`)
    expect(scheduled).toHaveTextContent('Planifié')
    expect(list.getByText('Score : 72')).toBeInTheDocument()
    expect(list.getByText('En cours')).toBeInTheDocument()

    expect(screen.getByRole('img', { name: /Frise 3D des exécutions.*3 exécutions, 1 en cours/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exécutions plus anciennes' })).toBeInTheDocument()
  })

  it('sends the filters to the registry', async () => {
    const user = userEvent.setup()
    const calls = renderLab()
    await screen.findByRole('list', { name: /^Exécutions du/ })

    await user.click(screen.getByRole('radio', { name: 'Pipeline de score' }))
    await user.click(screen.getByRole('radio', { name: 'Planifié' }))
    await user.click(screen.getByRole('radio', { name: 'Mateo' }))

    const last = calls.filter((call) => call.url.includes('/api/runs?')).pop()
    expect(last?.url).toContain('pipeline=score_pipeline')
    expect(last?.url).toContain('trigger=schedule')
    expect(last?.url).toContain('persona=mateo')
  })

  it('opens a group to show its titles, each one its own run', async () => {
    const user = userEvent.setup()
    renderLab()

    await user.click(await screen.findByRole('button', { name: '3 titres' }))

    const titles = within(await screen.findByRole('list', { name: 'Titres du groupe' }))
    expect(titles.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/labo/executions/run-nvda')
    expect(titles.getAllByRole('link')).toHaveLength(3)
  })

  it('offers the comparison once two runs are picked', async () => {
    const user = userEvent.setup()
    renderLab()

    await user.click(await screen.findByRole('button', { name: 'Comparer SHOP.TO' }))
    expect(screen.getByText('Choisissez une seconde exécution à comparer.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Comparer Groupe/ }))

    expect(screen.getByRole('link', { name: 'Comparer les 2 exécutions choisies' })).toHaveAttribute(
      'href',
      `/labo/comparer?a=${RUN_LAB.run_id}&b=${RUN_BATCH.run_id}`,
    )
  })

  it('falls back to the score pipeline records when the registry is unavailable', async () => {
    renderLab(json({ detail: 'Registre des exécutions illisible' }, 503))

    expect(await screen.findByRole('note')).toHaveTextContent("Le registre des exécutions n'est pas disponible")
    const links = await screen.findAllByRole('link', { name: /Sélection automatique : 15 titres/ })
    expect(links).toHaveLength(2)
  })

  it('says so when no run matches', async () => {
    renderLab(json({ runs: [], next_cursor: null, stored: true }))

    expect(await screen.findByText('Aucune exécution pour ces filtres.')).toBeInTheDocument()
  })
})
