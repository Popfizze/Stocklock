import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { LAB_CATALOG, LAB_RUN } from '@/test/lab'
import { LabPage } from './LabPage'

const ORIGINAL_FETCH = globalThis.fetch

function renderLab(runResponses: MockResponse[] = [json(LAB_RUN)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/lab/pipelines', responses: [json(LAB_CATALOG)] },
    { match: '/api/lab/run', responses: runResponses },
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

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des pipelines…')
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
    expect(panel.getByText('101,5')).not.toBeVisible()
    await userEvent.click(panel.getByText('Aperçu des données (2 lignes)'))
    expect(panel.getByText('101,5')).toBeVisible()

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
})
