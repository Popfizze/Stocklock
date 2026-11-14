import type {
  ScoreRun,
  ScoreRunInfo,
  ScoreRunList,
  ScoreRunParams,
  ScoreRunStage,
  ScoreStageDef,
  ScoreStageId,
} from '@/api/pipeline'

/** Test fixtures shaped like the score pipeline API (values taken from a real 15-title run). */

export const SCORE_RUN_PARAMS: ScoreRunParams = {
  max_titles: 15,
  ca_share: 0.3,
  etf_share: 0.1,
  news_per_title: 6,
  max_llm_articles: 1200,
}

export const SCORE_STAGE_DEFS: ScoreStageDef[] = [
  { id: 'bronze_titres', layer: 'bronze', label: 'Liste des titres', datasets: ['titres_bruts'], description: 'Copie brute du jour des répertoires SEC et TMX.' },
  { id: 'silver_univers', layer: 'silver', label: 'Univers', datasets: ['univers'], description: 'Fusion SEC + TMX, sélection des titres notés.' },
  { id: 'bronze_releves', layer: 'bronze', label: 'Relevés financiers', datasets: ['releves_bruts'], description: 'SEC EDGAR, Yahoo Finance.' },
  { id: 'bronze_cours', layer: 'bronze', label: 'Cours quotidiens', datasets: ['cours_bruts'], description: 'Yahoo Finance, Stooq en repli.' },
  { id: 'bronze_articles', layer: 'bronze', label: 'Articles', datasets: ['articles_bruts'], description: 'GDELT, Federal Register.' },
  { id: 'silver_releves', layer: 'silver', label: 'Relevés normalisés', datasets: ['releves_normalises'], description: 'Une ligne par trimestre.' },
  { id: 'silver_cours', layer: 'silver', label: 'Cours propres', datasets: ['cours_propres'], description: 'Calendriers alignés.' },
  { id: 'silver_evenements', layer: 'silver', label: 'Événements structurés', datasets: ['evenements_structures'], description: 'Claude Haiku sur Bedrock.' },
  { id: 'gold', layer: 'gold', label: 'Score par titre', datasets: ['indicateurs_bruts', 'rangs', 'score_par_titre'], description: '12 indicateurs, rangs, 6 sous-scores.' },
]

function stage(id: ScoreStageId, overrides: Partial<ScoreRunStage> = {}): ScoreRunStage {
  const def = SCORE_STAGE_DEFS.find((d) => d.id === id) ?? SCORE_STAGE_DEFS[0]
  return {
    id,
    layer: def.layer,
    label: def.label,
    status: 'pending',
    started_at: null,
    finished_at: null,
    duration_s: null,
    rows: {},
    decisions: [],
    samples: [],
    warnings: [],
    outputs: [],
    metrics: {},
    sources: [],
    error: null,
    ...overrides,
  }
}

const RUN_ID = '20261114T215336Z-c41b40'

const DONE_UNIVERS = stage('silver_univers', {
  status: 'succeeded',
  started_at: '2026-11-14T21:53:39Z',
  finished_at: '2026-11-14T21:53:40Z',
  duration_s: 0.5,
  rows: { univers_complet: 14409, univers: 15, univers_action: 13, univers_FNB: 2 },
  decisions: [
    { kind: 'parameter', message: 'Titres notés : max_titles = 15', count: 15 },
    { kind: 'filter', message: 'Certificats de dépôt canadiens (CDR) écartés', count: 10 },
    { kind: 'missing', message: 'Actions sans secteur publié, classées « Non classé »', count: 0 },
  ],
  samples: [
    {
      dataset: 'univers',
      columns: ['symbol', 'name', 'exchange', 'currency', 'asset_type', 'sector', 'market_cap'],
      rows: [
        ['AAPL', 'Apple Inc.', 'Nasdaq', 'USD', 'action', 'Technology', 5177380175872],
        ['RY.TO', 'Royal Bank of Canada', 'TSX', 'CAD', 'action', 'Financial Services', 291000000000],
        ['SPY', 'SPDR S&P 500 ETF Trust', 'NYSE', 'USD', 'FNB', 'FNB', null],
      ],
      total_rows: 15,
    },
  ],
  outputs: [`score/silver/univers/2026-11-14/${RUN_ID}/univers.csv`],
  sources: [{ id: 'yahoo_profile', title: 'Yahoo Finance (profil de société)', url: 'https://finance.yahoo.com/' }],
})

export const SCORE_RUN_RUNNING: ScoreRun = {
  run_id: RUN_ID,
  status: 'running',
  trigger: 'api',
  date: '2026-11-14',
  params: SCORE_RUN_PARAMS,
  started_at: '2026-11-14T21:53:36Z',
  finished_at: null,
  duration_s: null,
  current_stage: 'bronze_articles',
  summary: null,
  error: null,
  stages: [
    stage('bronze_titres', { status: 'succeeded', duration_s: 2.0, rows: { sec: 10404, tmx_tsx: 2349, titres_bruts: 14172 } }),
    DONE_UNIVERS,
    stage('bronze_releves', { status: 'succeeded', duration_s: 2.8, rows: { releves_bruts: 13, edgar: 8, yahoo: 5 } }),
    stage('bronze_cours', { status: 'succeeded', duration_s: 2.2, rows: { cours_bruts: 7651, titres: 16 } }),
    stage('bronze_articles', { status: 'running', started_at: '2026-11-14T21:53:41Z' }),
    stage('silver_releves'),
    stage('silver_cours'),
    stage('silver_evenements'),
    stage('gold'),
  ],
}

export const SCORE_RUN_SUCCEEDED: ScoreRun = {
  ...SCORE_RUN_RUNNING,
  status: 'succeeded',
  finished_at: '2026-11-14T21:55:12Z',
  duration_s: 96.0,
  current_stage: null,
  summary: {
    titles_selected: 15,
    titles_scored: 15,
    partial: 4,
    table_key: 'score/gold/score_par_titre/latest.json',
    bedrock_calls: 5,
    bedrock_input_tokens: 16047,
    bedrock_output_tokens: 9575,
    top: [
      { symbol: 'SPY', score: 71.8, partiel: true },
      { symbol: 'NVDA', score: 71.35, partiel: false },
      { symbol: 'GOOGL', score: 67.67, partiel: false },
    ],
  },
  stages: SCORE_RUN_RUNNING.stages.map((s) =>
    s.status === 'succeeded'
      ? s
      : stage(s.id, {
          status: 'succeeded',
          duration_s: 1.0,
          ...(s.id === 'silver_evenements'
            ? {
                rows: { evenements_structures: 92 },
                metrics: { bedrock_calls: 5, input_tokens: 16047, output_tokens: 9575 },
                decisions: [
                  { kind: 'info', message: "Extraits non retrouvés mot pour mot dans l'article, remplacés par le titre", count: 6 },
                ],
              }
            : {}),
          ...(s.id === 'gold'
            ? {
                rows: { score_par_titre: 15 },
                metrics: { titles_scored: 15, partial: 4, table_key: 'score/gold/score_par_titre/latest.json' },
                samples: [
                  {
                    dataset: 'score_par_titre',
                    columns: ['symbol', 'score', 'partiel', 'rentabilite', 'evenements'],
                    rows: [
                      ['NVDA', 71.35, false, 95.45, 32.5],
                      ['SPY', 71.8, true, null, null],
                    ],
                    total_rows: 15,
                  },
                ],
              }
            : {}),
        }),
  ),
}

export const SCORE_RUN_FAILED: ScoreRun = {
  ...SCORE_RUN_RUNNING,
  status: 'failed',
  finished_at: '2026-11-14T21:54:10Z',
  duration_s: 34.0,
  current_stage: null,
  error: { error: 'RuntimeError', message: "RuntimeError: Aucun filtre Yahoo Finance n'a répondu" },
  stages: SCORE_RUN_RUNNING.stages.map((s) =>
    s.id === 'bronze_articles'
      ? { ...s, status: 'failed', error: "RuntimeError: Aucun filtre Yahoo Finance n'a répondu" }
      : s,
  ),
}

/** A run as GET /runs lists it: without its stages. */
function info(run: ScoreRun): ScoreRunInfo {
  return {
    run_id: run.run_id,
    status: run.status,
    trigger: run.trigger,
    date: run.date,
    params: run.params,
    started_at: run.started_at,
    finished_at: run.finished_at,
    duration_s: run.duration_s,
    current_stage: null,
    summary: run.summary,
    error: run.error,
  }
}

export const SCORE_RUN_LIST: ScoreRunList = {
  configured: true,
  stages: SCORE_STAGE_DEFS,
  runs: [info(SCORE_RUN_SUCCEEDED), { ...info(SCORE_RUN_FAILED), run_id: '20261113T110000Z-aa11bb', trigger: 'schedule' }],
}

export const SCORE_RUN_LIST_RUNNING: ScoreRunList = {
  ...SCORE_RUN_LIST,
  runs: [{ ...info(SCORE_RUN_RUNNING), run_id: '20261115T110000Z-cc22dd' }, ...SCORE_RUN_LIST.runs],
}

export const SCORE_RUN_LIST_UNCONFIGURED: ScoreRunList = {
  configured: false,
  stages: SCORE_STAGE_DEFS,
  runs: [],
}
