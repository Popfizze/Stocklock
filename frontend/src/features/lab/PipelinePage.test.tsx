import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { LAB_CATALOG, LAB_RUN } from '@/test/lab'
import { readLabRuns } from './labHistory'
import { PipelinePage } from './PipelinePage'

const ORIGINAL_FETCH = globalThis.fetch

function renderPipeline(id: string, runResponses: MockResponse[] = [json(LAB_RUN)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: '/api/lab/run', responses: runResponses },
    { match: '/api/pipeline/score/runs', responses: [json({ configured: false, stages: [], runs: [] })] },
  ])
  renderWithProviders(
    <Routes>
      <Route path="/labo/:pipelineId" element={<PipelinePage />} />
    </Routes>,
    { route: `/labo/${id}`, personaId: 'amira' },
  )
  return calls
}

const flow = () => within(screen.getByRole('list', { name: 'Diagramme du pipeline 1. Score' }))
const column = (name: string) => within(flow().getByRole('region', { name }))
const params = () => within(screen.getByRole('region', { name: 'Paramètres du run' }))

describe('PipelinePage (lab pipeline)', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('draws the diagram by layer and opens the parameters with their defaults', async () => {
    renderPipeline('score')

    expect(await screen.findByRole('heading', { level: 1, name: '1. Score' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Labo' })).toHaveAttribute('href', '/labo')

    // Entrées → Bronze → Silver → Gold → Sortie, each stage in its layer.
    expect(flow().getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      'Entrées',
      'Bronze',
      'Silver',
      'Gold',
      'Sortie',
    ])
    expect(column('Entrées').getByRole('button', { name: /Paramètres/ })).toBeInTheDocument()
    expect(column('Bronze').getByRole('button', { name: /Collecte/ })).toHaveTextContent('Pas encore exécuté')
    expect(column('Gold').getByRole('button', { name: /Notation/ })).toBeInTheDocument()
    expect(column('Silver').getByText('Aucune étape')).toBeInTheDocument()
    expect(column('Sortie').getByRole('button', { name: /Résultat/ })).toBeInTheDocument()

    // First visit: the « Lancer » panel is open, prefilled.
    expect(screen.getByRole('button', { name: 'Lancer' })).toHaveAttribute('aria-expanded', 'true')
    expect(await params().findByDisplayValue('Amira')).toHaveAttribute('readonly')
    expect(params().getByLabelText('Titre')).toHaveValue('SHOP.TO')
    expect(params().getByLabelText('Pairs')).toHaveValue('RY.TO, TD.TO')
    expect(params().getByLabelText('Montant')).toHaveValue(1000)
    expect(params().getByRole('combobox', { name: 'Fenêtre' })).toHaveTextContent('1 an')
    // An option whose lab value differs from the production default is marked.
    const method = params().getByRole('combobox', { name: 'Méthode' })
    expect(method).toHaveTextContent('Rangs')
    expect(within(method.parentElement as HTMLElement).getByText('Modifié')).toBeInTheDocument()
    expect(params().getAllByText('Modifié')).toHaveLength(1)
  })

  it('runs with the changed option and inputs, then shows each stage and the result', async () => {
    const calls = renderPipeline('score')
    await screen.findByRole('heading', { level: 1, name: '1. Score' })
    await params().findByDisplayValue('Amira')

    await userEvent.click(params().getByRole('combobox', { name: 'Fenêtre' }))
    await userEvent.click(await screen.findByRole('option', { name: '5 ans' }))
    expect(params().getAllByText('Modifié')).toHaveLength(2)
    await userEvent.clear(params().getByLabelText('Pairs'))
    await userEvent.type(params().getByLabelText('Pairs'), 'shop.to, ry.to')
    await userEvent.click(params().getByRole('button', { name: 'Exécuter' }))

    // The result opens once the run is back.
    const result = within(await screen.findByRole('region', { name: 'Détail : Résultat' }))
    const runCall = calls.find((call) => call.url.endsWith('/api/lab/run'))
    expect(JSON.parse(String(runCall?.init.body))).toEqual({
      step: 'score',
      persona_id: 'amira',
      inputs: { ticker: 'SHOP.TO', peers: ['SHOP.TO', 'RY.TO'], as_of: '2026-11-13', amount: 1000, include_esg: false },
      options: { 'fetch.window': '5y', 'scoring.method': 'rank' },
    })
    expect(result.getByText('Score de 72 sur 100.')).toBeInTheDocument()
    expect(result.getByRole('row', { name: /Marge 0,31 % positif Rapport annuel/ })).toBeInTheDocument()
    expect(result.getByText('Sources citées').closest('li')).toHaveTextContent('Passé')
    expect(result.getByText('Gouvernance')).toHaveTextContent('Échouée')

    // The diagram carries each stage's status, duration and row count.
    const collecte = column('Bronze').getByRole('button', { name: /Collecte/ })
    expect(collecte).toHaveTextContent('OK')
    expect(collecte).toHaveTextContent('420 ms')
    expect(collecte).toHaveTextContent('3 lignes')
    expect(column('Gold').getByRole('button', { name: /Notation/ })).toHaveTextContent('Avertissement')
    expect(column('Sortie').getByRole('button', { name: /Résultat/ })).toHaveTextContent('OK')

    // A stage's detail: metrics, sources, decisions, datasets.
    await userEvent.click(collecte)
    const detail = within(screen.getByRole('region', { name: 'Détail : Collecte' }))
    expect(detail.getByText('Récupère les prix.')).toBeInTheDocument()
    expect(detail.getByText('fournisseur')).toBeInTheDocument()
    expect(detail.getByRole('link', { name: 'Yahoo Finance' })).toHaveAttribute(
      'href',
      'https://finance.yahoo.com/quote/SHOP.TO',
    )
    const decision = detail.getByText('Quelle source de prix pour SHOP.TO ?').closest('li') as HTMLElement
    expect(decision).toHaveTextContent('kit de départ (prices_daily.csv)')
    expect(within(decision).getByText('option source = starter')).toBeInTheDocument()
    const prices = detail.getByText('Prix quotidiens SHOP.TO (kit, prices_daily.csv)').closest('details') as HTMLElement
    expect(prices).toHaveTextContent('2 lignes × 4 colonnes')
    await userEvent.click(within(prices).getByText('Prix quotidiens SHOP.TO (kit, prices_daily.csv)'))
    expect(within(prices).getByRole('row', { name: /1 2026-11-12 SHOP\.TO 101,5/ })).toBeInTheDocument()
    expect(detail.getByText('Faits XBRL EDGAR (companyfacts)').closest('details')).toHaveTextContent(
      'Tronqué : 1 ligne sur 3',
    )

    await userEvent.click(column('Gold').getByRole('button', { name: /Notation/ }))
    const scoring = within(screen.getByRole('region', { name: 'Détail : Notation' }))
    expect(scoring.getByText('Données ESG manquantes')).toBeInTheDocument()
    expect(scoring.getByText(/Durée : 80 ms/)).toBeInTheDocument()
  })

  it('keeps a summary of each run in this browser and compares two of them', async () => {
    renderPipeline('score', [
      json(LAB_RUN),
      json({
        ...LAB_RUN,
        run_id: 'run-2',
        key_result: { label: 'Score', value: 65 },
        stages: [
          { ...LAB_RUN.stages[0], decisions: [{ ...(LAB_RUN.stages[0].decisions ?? [])[0], answer: 'yfinance en direct' }] },
          LAB_RUN.stages[1],
        ],
      }),
    ])
    await screen.findByRole('heading', { level: 1, name: '1. Score' })
    await params().findByDisplayValue('Amira')
    await userEvent.click(params().getByRole('button', { name: 'Exécuter' }))
    await screen.findByRole('region', { name: 'Détail : Résultat' })

    // The panel closed after the run; reopen it, change an option and run again.
    await userEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await userEvent.click(params().getByRole('combobox', { name: 'Fenêtre' }))
    await userEvent.click(await screen.findByRole('option', { name: '5 ans' }))
    await userEvent.click(params().getByRole('button', { name: 'Exécuter' }))

    const history = within(screen.getByRole('region', { name: 'Historique' }))
    await history.findByText('Score : 65')
    const rows = history.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Score : 65')
    expect(rows[0]).toHaveTextContent('Collecte · Fenêtre : 5 ans ; Notation · Méthode : Rangs')
    expect(rows[1]).toHaveTextContent('Score : 72')
    expect(rows[1]).toHaveTextContent('Gouvernance échouée')
    // Stored without the datasets.
    const stored = readLabRuns('score')
    expect(stored.map((run) => run.keyResult)).toEqual(['Score : 65', 'Score : 72'])
    expect(JSON.stringify(stored)).not.toContain('prices_SHOP.TO')

    const boxes = history.getAllByRole('checkbox')
    await userEvent.click(boxes[0])
    await userEvent.click(boxes[1])
    const compare = within(history.getByRole('region', { name: 'Comparaison de deux runs' }))
    expect(compare.getByRole('row', { name: /Collecte · Fenêtre 5 ans 1 an/ })).toBeInTheDocument()
    expect(compare.getByRole('row', { name: /Résultat clé Score : 65 Score : 72/ })).toBeInTheDocument()
    expect(
      compare.getByRole('row', {
        name: /Quelle source de prix pour SHOP\.TO \? yfinance en direct kit de départ/,
      }),
    ).toBeInTheDocument()
    // Parameters that are the same are left out.
    expect(compare.queryByRole('row', { name: /^Titre / })).not.toBeInTheDocument()
  })

  it('explains a failed run and keeps the history empty', async () => {
    renderPipeline('score', [json({ detail: 'Bedrock indisponible' }, 503)])
    await screen.findByRole('heading', { level: 1, name: '1. Score' })
    await params().findByDisplayValue('Amira')
    await userEvent.click(params().getByRole('button', { name: 'Exécuter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "L'exécution a échoué (erreur 503) : Bedrock indisponible",
    )
    expect(within(screen.getByRole('region', { name: 'Historique' })).getByText('Aucun run pour l’instant.')).toBeInTheDocument()
    expect(column('Bronze').getByRole('button', { name: /Collecte/ })).toHaveTextContent('Pas encore exécuté')
  })

  it('says so for an unknown pipeline', async () => {
    renderPipeline('inconnu')

    expect(await screen.findByRole('alert')).toHaveTextContent("Ce pipeline n'existe pas.")
  })
})
