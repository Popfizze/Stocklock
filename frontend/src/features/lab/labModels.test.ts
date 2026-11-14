import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '@/test/lab'
import { SCORE_RUN_LIST, SCORE_RUN_RUNNING, SCORE_RUN_SUCCEEDED, SCORE_RUN_TICKERS } from '@/test/pipeline'
import { RUN_BATCH, RUN_DETAIL_BATCH, RUN_DETAIL_LAB, RUN_LAB, RUN_SCORE_PIPELINE, RUN_STAGE_LAB } from '@/test/runs'
import { columnSummary, shapeGlyph, shapeText } from './artifacts/artifactModel'
import { compareRows, compareScene, compareSide } from './compare/compareModel'
import { fittingSize, groupProblem, labGroup, numberSpec, scoreRequest, SCORE_DEFAULTS, type GroupDraft } from './launch/launchModel'
import { conveyorScene } from './run/conveyorScene'
import { catalogFlow, reachedColumn, scoreFlow } from './run/flowModel'
import { groupScene } from './run/groupScene'
import { viewFromRegistry, viewFromScore } from './run/runView'
import { matchesFilters, summaryFromScoreRun, timelineScene, withinRange } from './runs/runModel'

describe('timeline', () => {
  it('draws one column per run, taller for a group, with tiles hopping over a running one', () => {
    const { tiles, flows } = timelineScene([RUN_LAB, RUN_BATCH, RUN_SCORE_PIPELINE])
    const columns = tiles.filter((tile) => tile.id)
    expect(columns.map((tile) => tile.id)).toEqual([RUN_LAB.run_id, RUN_BATCH.run_id, RUN_SCORE_PIPELINE.run_id])
    expect(columns[1].h).toBeGreaterThan(columns[0].h)
    expect(columns.map((tile) => tile.tone)).toEqual(['warn', 'warn', 6])
    // Lanes: the score pipeline in front, the Labo's score step behind it.
    expect(columns.map((tile) => tile.z)).toEqual([1, 1, 0])
    expect(flows).toHaveLength(1)
    // One slab for the single day.
    expect(tiles.filter((tile) => !tile.id)).toHaveLength(1)
    expect(columns[0].label).toContain('SHOP.TO')
  })

  it('filters by date on the client and maps score pipeline records to summaries', () => {
    const now = new Date('2026-11-20T12:00:00Z')
    expect(withinRange(RUN_LAB, 'today', now)).toBe(false)
    expect(withinRange(RUN_LAB, '7d', now)).toBe(true)
    expect(withinRange(RUN_LAB, 'today', new Date('2026-11-14T23:00:00Z'))).toBe(true)

    const summary = summaryFromScoreRun(SCORE_RUN_LIST.runs[0])
    expect(summary).toMatchObject({ pipeline: 'score_pipeline', kind: 'pipeline', status: 'succeeded', key_result: { value: 15 } })
    expect(matchesFilters(summary, { pipeline: 'lab' })).toBe(false)
    expect(matchesFilters(summary, { pipeline: 'score_pipeline', trigger: 'api' })).toBe(true)
    expect(matchesFilters(RUN_LAB, { pipeline: 'lab', persona: 'amira', status: 'warning' })).toBe(true)
  })
})

describe('run flow', () => {
  it('reads a score run live: where it is, and its titles standing there', () => {
    const view = viewFromScore({ ...SCORE_RUN_RUNNING, group: SCORE_RUN_TICKERS.group })
    expect(reachedColumn(view.nodes)).toBe('bronze')
    expect(view.travellers).toHaveLength(4)
    expect(view.travellers[0]).toMatchObject({ label: 'AAPL', column: 'bronze', status: 'running' })

    const { tiles, flows } = conveyorScene(view.nodes, view.travellers, null)
    expect(tiles.filter((tile) => tile.id?.startsWith('titre:'))).toHaveLength(4)
    expect(flows.length).toBeGreaterThan(0)
    expect(flows[0].count).toBe(4)
    expect(viewFromScore(SCORE_RUN_SUCCEEDED).travellers).toHaveLength(0)
    expect(conveyorScene(scoreFlow(SCORE_RUN_LIST.stages, undefined), [], null).flows).toHaveLength(0)
  })

  it('draws a group from the catalog stages, its titles at the exit, each with its run', () => {
    const view = viewFromRegistry(RUN_DETAIL_BATCH, LAB_CATALOG.steps[0].stages)
    expect(view.kind).toBe('batch')
    expect(view.nodes.map((node) => node.label)).toEqual(['Paramètres', 'Collecte', 'Notation', 'Résultat'])
    expect(view.travellers.map((traveller) => traveller.column)).toEqual(['sortie', 'sortie', 'sortie'])
    expect(view.travellers[0]).toMatchObject({ runId: 'run-nvda', status: 'ok' })
    expect(view.travellers[2].status).toBe('error')
    // The chosen stage stands on a plate.
    const withPlate = conveyorScene(view.nodes, view.travellers, 'fetch').tiles.length
    expect(withPlate).toBe(conveyorScene(view.nodes, view.travellers, null).tiles.length + 1)
    expect(catalogFlow(LAB_CATALOG.steps[0].stages, 'running').filter((node) => node.status === 'running')).toHaveLength(2)

    const bars = groupScene(RUN_DETAIL_BATCH.children)
    expect(bars[0].h).toBeGreaterThan(bars[1].h)
    expect(bars[2]).toMatchObject({ tone: 'alert', h: 0.15 })
  })
})

describe('artifacts', () => {
  it('summarizes a table: its silhouette and the distribution of a key column', () => {
    expect(shapeText(25604, 9)).toMatch(/^25\s604 lignes × 9 colonnes$/)
    expect(shapeText(null, null)).toBe('lignes : à lire')
    expect(shapeGlyph(3, 20)).toEqual({ columns: 12, rows: 1 })
    expect(shapeGlyph(25604, 9).rows).toBeGreaterThan(shapeGlyph(48, 9).rows)

    const rows = Array.from({ length: 40 }, (_, index) => [index, index < 30 ? 'action' : 'FNB', index * 2.5])
    const numeric = columnSummary(['id', 'type', 'close'], rows)
    expect(numeric).toMatchObject({ column: 'close', kind: 'numeric' })
    expect(numeric?.bars).toHaveLength(12)
    const category = columnSummary(['type', 'nom'], rows.map((row) => [row[1], `titre ${row[0]}`]))
    expect(category).toMatchObject({ column: 'type', kind: 'category', bars: [1, 1 / 3] })
    expect(columnSummary(['a'], [['x'], ['y']])).toBeNull()
  })
})

describe('compare', () => {
  it('lists what differs between two runs and pairs the numbers they share', () => {
    const left = compareSide(viewFromRegistry(RUN_DETAIL_LAB), [RUN_STAGE_LAB])
    const right = compareSide(
      viewFromRegistry({ ...RUN_DETAIL_LAB, run_id: 'other', options: { 'fetch.window': '1y', 'scoring.method': 'rank' }, key_result: { label: 'Score', value: 64 } }),
      [],
    )
    const params = compareRows(left.params, right.params)
    expect(params.filter((row) => row.differs).map((row) => row.name)).toEqual(['option fetch.window'])
    expect(compareRows(left.results, right.results).find((row) => row.name === 'Score')).toMatchObject({ left: '72', right: '64', differs: true })
    expect(compareRows(left.decisions, right.decisions)[0]).toMatchObject({ name: 'Collecte · Quelle source de prix pour SHOP.TO ?', right: '—' })

    const scene = compareScene(left, right)
    expect(scene.shared).toEqual(['Durée (s)', 'Score'])
    expect(scene.tiles).toHaveLength(6)

    const score = compareSide(viewFromScore(SCORE_RUN_TICKERS), [])
    expect(score.numbers['Titres notés']).toBe(4)
    expect(Object.keys(score.decisions).some((name) => name.startsWith('Univers · missing'))).toBe(true)
  })
})

describe('launch', () => {
  const draft: GroupDraft = { kind: 'sector', ref: 'Energy', size: 40, tickers: [] }

  it('builds the requests of a group', () => {
    expect(scoreRequest(draft, SCORE_DEFAULTS, [], 100).group).toEqual({ kind: 'sector', name: 'Energy', max_titles: 40, ca_share: 0.3 })
    expect(scoreRequest({ ...draft, kind: 'auto', size: 120 }, SCORE_DEFAULTS, [], 100)).toMatchObject({
      max_titles: 120,
      group: { kind: 'auto', max_titles: 120, etf_share: 0.1 },
    })
    expect(scoreRequest({ ...draft, kind: 'portfolio' }, SCORE_DEFAULTS, ['A', 'B', 'C'], 2).group).toEqual({ kind: 'tickers', tickers: ['A', 'B'] })
    expect(labGroup(draft, [], 25)).toEqual({ kind: 'sector', ref: 'Energy', limit: 40 })
    expect(labGroup({ ...draft, kind: 'custom', tickers: ['NVDA'] }, [], 25)).toEqual({ kind: 'tickers', tickers: ['NVDA'] })
  })

  it('explains an incomplete group, reads the fitting size and guesses slider ranges', () => {
    expect(groupProblem({ ...draft, ref: null }, [], 25)).toBe('Choisissez un secteur.')
    expect(groupProblem({ ...draft, kind: 'portfolio' }, [], 25)).toBe('Le portefeuille de ce profil est vide.')
    expect(groupProblem(draft, [], 25)).toBeNull()
    expect(fittingSize({ status: 422, message: 'Groupe trop grand… Lancez 12 titres au plus avec ces options.' })).toBe(12)
    expect(fittingSize({ status: 500, message: 'Lancez 12 titres au plus' })).toBeNull()
    expect(numberSpec({ name: 'marginal_rate_now', label: '', type: 'number', default: 0.36 })).toMatchObject({ format: 'percent', max: 0.6 })
    expect(numberSpec({ name: 'years', label: '', type: 'number', default: 15 })).toMatchObject({ format: 'count', max: 40 })
    expect(numberSpec({ name: 'income', label: '', type: 'number', default: 85000 })).toMatchObject({ format: 'money', max: 340000 })
  })
})
