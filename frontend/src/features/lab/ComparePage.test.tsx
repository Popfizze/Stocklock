import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { LAB_CATALOG } from '@/test/lab'
import { PERSONAS } from '@/test/personas'
import { RUN_DETAIL_LAB, RUN_STAGE_LAB } from '@/test/runs'
import { ComparePage } from './ComparePage'

const ORIGINAL_FETCH = globalThis.fetch
const OTHER = {
  ...RUN_DETAIL_LAB,
  run_id: 'other-run',
  title: 'SHOP.TO (fenêtre 1 an)',
  options: { 'fetch.window': '1y', 'scoring.method': 'rank' },
  key_result: { label: 'Score', value: 64 },
}

function renderCompare(route: string) {
  mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: /\/api\/runs\/[^/]+\/stages\//, responses: [json(RUN_STAGE_LAB)] },
    { match: '/api/runs/other-run', responses: [json(OTHER)] },
    { match: `/api/runs/${RUN_DETAIL_LAB.run_id}`, responses: [json(RUN_DETAIL_LAB)] },
    { match: '/api/', responses: [json({ detail: 'introuvable' }, 404)] },
  ])
  renderWithProviders(<ComparePage />, { route, personaId: 'amira' })
}

describe('ComparePage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it('puts two runs side by side: what differs first, everything on demand', async () => {
    const user = userEvent.setup()
    renderCompare(`/labo/comparer?a=${RUN_DETAIL_LAB.run_id}&b=other-run`)

    expect(await screen.findByRole('link', { name: /Exécution A.*SHOP\.TO/ })).toHaveAttribute('href', `/labo/executions/${RUN_DETAIL_LAB.run_id}`)
    expect(screen.getByRole('link', { name: /Exécution B.*fenêtre 1 an/ })).toHaveAttribute('href', '/labo/executions/other-run')
    expect(screen.getByRole('img', { name: /Comparaison 3D des mesures communes aux deux exécutions \(Durée \(s\), Score\)/ })).toBeInTheDocument()
    expect(screen.getByText('2 différences entre ces deux exécutions.')).toBeInTheDocument()

    const params = within(screen.getByRole('region', { name: 'Paramètres' }))
    expect(params.getAllByRole('listitem')).toHaveLength(1)
    expect(params.getByRole('listitem')).toHaveTextContent('option fetch.windowA5yB1y')
    const results = within(screen.getByRole('region', { name: 'Résultats' }))
    expect(results.getByRole('listitem')).toHaveTextContent('ScoreA72B64')
    expect(await within(screen.getByRole('region', { name: 'Décisions' })).findByText('Identiques dans les deux exécutions.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tout afficher' }))
    expect(params.getAllByRole('listitem').length).toBeGreaterThan(1)
  })

  it('asks for two existing runs', async () => {
    renderCompare('/labo/comparer?a=missing')

    expect(await screen.findByRole('alert')).toHaveTextContent('Il faut deux exécutions existantes pour comparer')
  })
})
