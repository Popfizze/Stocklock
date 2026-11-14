import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { LAB_CATALOG, LAB_RUN } from '@/test/lab'
import { SCORE_RUN_LIST_UNCONFIGURED } from '@/test/pipeline'
import { LabPage } from './LabPage'

const ORIGINAL_FETCH = globalThis.fetch

function renderLab(runResponses: MockResponse[] = [json(LAB_RUN)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: '/api/lab/run', responses: runResponses },
    { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST_UNCONFIGURED)] },
  ])
  renderWithProviders(<LabPage />, { route: '/labo', personaId: 'amira' })
  return calls
}

const scorePanel = () => screen.getByRole('tabpanel', { name: '1. Score' })
const runsCard = () => screen.getByText('Exécutions').closest('[data-slot=card]') as HTMLElement

describe('LabPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('loads the catalog: one tab per step, inputs at their defaults, options at lab_default ?? default', async () => {
    renderLab()

    expect(screen.getByText('Chargement des pipelines…')).toHaveAttribute('role', 'status')
    expect(await screen.findByRole('tab', { name: '1. Score' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '2. Fluctuations' })).toBeInTheDocument()

    const panel = within(scorePanel())
    expect(await panel.findByDisplayValue('Amira')).toHaveAttribute('readonly')
    expect(panel.getByLabelText('Titre')).toHaveValue('SHOP.TO')
    expect(panel.getByLabelText('Titre')).toHaveAccessibleDescription('Symbole boursier')
    expect(panel.getByLabelText('Pairs')).toHaveValue('RY.TO, TD.TO')
    expect(panel.getByLabelText('Date')).toHaveValue('2026-11-13')
    expect(panel.getByLabelText('Montant')).toHaveValue(1000)
    expect(panel.getByLabelText('Inclure ESG')).not.toBeChecked()

    expect(panel.getByText('1. Collecte')).toBeInTheDocument()
    expect(panel.getByText('Récupère les prix.')).toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: 'Fenêtre' })).toHaveTextContent('1 an')
    expect(panel.getByRole('combobox', { name: 'Méthode' })).toHaveTextContent('Rangs')

    expect(within(runsCard()).getByText("Aucune exécution pour l'instant.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '2. Fluctuations' }))
    const fluctuations = within(screen.getByRole('tabpanel', { name: '2. Fluctuations' }))
    expect(fluctuations.getByLabelText('Question')).toHaveValue('Pourquoi ?')
    expect(fluctuations.getByText('1. Actualités')).toBeInTheDocument()
  })

  it('runs with the changed option and inputs, then shows every stage and the final result', async () => {
    const calls = renderLab()
    const panel = within(await screen.findByRole('tabpanel', { name: '1. Score' }))
    await panel.findByDisplayValue('Amira')

    await userEvent.click(panel.getByRole('combobox', { name: 'Fenêtre' }))
    await userEvent.click(await screen.findByRole('option', { name: '5 ans' }))
    expect(panel.getByRole('combobox', { name: 'Fenêtre' })).toHaveTextContent('5 ans')

    await userEvent.clear(panel.getByLabelText('Pairs'))
    await userEvent.type(panel.getByLabelText('Pairs'), 'shop.to, ry.to')
    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))

    expect(await panel.findByText('OK')).toBeInTheDocument()
    const runCall = calls.find((call) => call.url.endsWith('/api/lab/run'))
    expect(runCall?.init.method).toBe('POST')
    expect(JSON.parse(String(runCall?.init.body))).toEqual({
      step: 'score',
      persona_id: 'amira',
      inputs: {
        ticker: 'SHOP.TO',
        peers: ['SHOP.TO', 'RY.TO'],
        as_of: '2026-11-13',
        amount: 1000,
        include_esg: false,
      },
      options: { 'fetch.window': '5y', 'scoring.method': 'rank' },
    })

    // Stages
    expect(panel.getByText('Avertissement')).toBeInTheDocument()
    expect(panel.getByText('Durée : 420 ms')).toBeInTheDocument()
    expect(panel.getByText('fournisseur')).toBeInTheDocument()
    expect(panel.getByText('0,42')).toBeInTheDocument()
    expect(panel.getByText('Données ESG manquantes')).toBeInTheDocument()
    expect(panel.getAllByRole('link', { name: 'Yahoo Finance' })[0]).toHaveAttribute(
      'href',
      'https://finance.yahoo.com/quote/SHOP.TO',
    )
    expect(panel.getByText('— au 2026-11-13')).toBeInTheDocument()

    // Decisions: question → answer, the reason, then the rule and the inputs.
    const decision = panel.getByText('Quelle source de prix pour SHOP.TO ?').closest('li') as HTMLElement
    expect(decision).toHaveTextContent('kit de départ (prices_daily.csv)')
    expect(decision).toHaveTextContent("Choix de l'option de l'étape.")
    expect(within(decision).getByText('option source = starter')).toBeInTheDocument()
    const filter = panel.getByText('Quelles séances garder ?').closest('li') as HTMLElement
    expect(filter).toHaveTextContent('2 séances sur 1255')
    expect(within(filter).getByText('début :').nextElementSibling).toHaveTextContent('2026-11-12')
    expect(panel.getByText('Que faire des sous-scores manquants ?')).toBeInTheDocument()

    // Datasets: collapsed, with their counts and source; every column and row once opened.
    expect(panel.queryByText('101,5')).not.toBeInTheDocument()
    expect(panel.queryByText('Aperçu des données (2 lignes)')).not.toBeInTheDocument()
    const prices = panel.getByText('Prix quotidiens SHOP.TO (kit, prices_daily.csv)').closest('details') as HTMLElement
    expect(prices).toHaveTextContent('2 lignes × 4 colonnes')
    expect(prices).toHaveTextContent('Source : Yahoo Finance')
    await userEvent.click(within(prices).getByText('Prix quotidiens SHOP.TO (kit, prices_daily.csv)'))
    const table = within(within(prices).getByRole('table'))
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Ligne#',
      'date',
      'ticker',
      'close',
      'volume',
    ])
    expect(table.getByRole('row', { name: /1 2026-11-12 SHOP\.TO 101,5 1[\s\u202f\u00a0]200/ })).toBeInTheDocument()
    expect(table.getByRole('row', { name: /2 2026-11-13 SHOP\.TO — 900/ })).toBeInTheDocument()
    expect(prices).toHaveTextContent('Lignes 1–2 sur 2')

    const edgar = panel.getByText('Faits XBRL EDGAR (companyfacts)').closest('details') as HTMLElement
    expect(edgar).toHaveTextContent('3 lignes × 3 colonnes')
    expect(edgar).toHaveTextContent('Tronqué : 1 ligne sur 3')
    expect(edgar).toHaveTextContent('Calculé par StockLock')

    // Final result
    expect(panel.getByText('Résultat final')).toBeInTheDocument()
    expect(panel.getByText('Score de 72 sur 100.')).toBeInTheDocument()
    expect(panel.getByRole('row', { name: /Marge 0,31 % positif Rapport annuel/ })).toBeInTheDocument()
    expect(panel.getByText('Prix de clôture ajustés')).toBeInTheDocument()
    expect(panel.getByText('Pas de données intrajournalières')).toBeInTheDocument()
    expect(panel.getByText('Sources citées').closest('li')).toHaveTextContent('Passé')
    expect(panel.getByText('Fraîcheur').closest('li')).toHaveTextContent('Échoué')
    expect(panel.getByText('Gouvernance')).toHaveTextContent('Échouée')
  })

  it('adds one row per run to the « Exécutions » table, newest first', async () => {
    renderLab([json(LAB_RUN), json({ ...LAB_RUN, run_id: 'run-2', key_result: { label: 'Score', value: 65 } })])
    const panel = within(await screen.findByRole('tabpanel', { name: '1. Score' }))
    await panel.findByDisplayValue('Amira')

    await userEvent.click(panel.getByRole('combobox', { name: 'Fenêtre' }))
    await userEvent.click(await screen.findByRole('option', { name: '5 ans' }))
    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))
    await within(runsCard()).findByText('Score : 72')

    const [, firstRun] = within(runsCard()).getAllByRole('row')
    expect(firstRun).toHaveTextContent('1. Score')
    expect(firstRun).toHaveTextContent('Collecte · Fenêtre : 5 ans')
    expect(firstRun).toHaveTextContent('Notation · Méthode : Rangs')
    expect(firstRun).toHaveTextContent('1,5 s')
    expect(firstRun).toHaveTextContent('Échouée')

    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))
    await within(runsCard()).findByText('Score : 65')
    const rows = within(runsCard()).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Score : 65')
    expect(rows[2]).toHaveTextContent('Score : 72')
  })

  it('shows the 422 detail when the server refuses the inputs', async () => {
    renderLab([
      json(
        { detail: [{ loc: ['body', 'inputs', 'ticker'], msg: 'Field required', type: 'missing' }] },
        422,
      ),
    ])
    const panel = within(await screen.findByRole('tabpanel', { name: '1. Score' }))
    await panel.findByDisplayValue('Amira')

    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Entrée invalide : inputs.ticker : Field required',
    )
    expect(within(runsCard()).getByText("Aucune exécution pour l'instant.")).toBeInTheDocument()
  })

  it('pages through a large dataset instead of drawing every row', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => [`2026-01-01`, `R${i + 1}`])
    const big = {
      id: 'big',
      title: 'Grand jeu',
      source_id: null,
      columns: ['date', 'ref'],
      rows,
      total_rows: 250,
      truncated: false,
    }
    const run = { ...LAB_RUN, stages: [{ ...LAB_RUN.stages[0], datasets: [big] }, LAB_RUN.stages[1]] }
    renderLab([json(run)])
    const panel = within(await screen.findByRole('tabpanel', { name: '1. Score' }))
    await panel.findByDisplayValue('Amira')
    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))

    const dataset = (await panel.findByText('Grand jeu')).closest('details') as HTMLElement
    expect(dataset).toHaveTextContent('250 lignes × 2 colonnes')
    await userEvent.click(within(dataset).getByText('Grand jeu'))
    expect(within(dataset).getAllByRole('row')).toHaveLength(101)
    expect(dataset).toHaveTextContent('Lignes 1–100 sur 250')
    expect(within(dataset).getByRole('button', { name: 'Précédentes' })).toBeDisabled()

    await userEvent.click(within(dataset).getByRole('button', { name: 'Suivantes' }))
    await userEvent.click(within(dataset).getByRole('button', { name: 'Suivantes' }))
    expect(dataset).toHaveTextContent('Lignes 201–250 sur 250')
    expect(within(dataset).getByText('R250')).toBeInTheDocument()
    expect(within(dataset).queryByText('R1')).not.toBeInTheDocument()
    expect(within(dataset).getByRole('button', { name: 'Suivantes' })).toBeDisabled()
  })

  it('falls back to the short preview when a stage sends no dataset (older backend)', async () => {
    const run = {
      ...LAB_RUN,
      stages: LAB_RUN.stages.map((stage) => ({ ...stage, datasets: undefined, decisions: undefined })),
    }
    renderLab([json(run)])
    const panel = within(await screen.findByRole('tabpanel', { name: '1. Score' }))
    await panel.findByDisplayValue('Amira')
    await userEvent.click(panel.getByRole('button', { name: 'Exécuter' }))

    expect(await panel.findByText('Aperçu des données (2 lignes)')).toBeInTheDocument()
    expect(panel.getByText('101,5')).not.toBeVisible()
    await userEvent.click(panel.getByText('Aperçu des données (2 lignes)'))
    expect(panel.getByText('101,5')).toBeVisible()
    expect(panel.queryByText(/Décisions/)).not.toBeInTheDocument()
  })
})
