import type {
  RunArtifactList,
  RunArtifactPreview,
  RunDetail,
  RunPage,
  RunStageDetail,
  RunSummary,
} from '@/api/runs'
import { LAB_BATCH_RUN, LAB_RUN } from './lab'

/** Test fixtures shaped like the run registry contract (GET /api/runs…); the values are placeholders. */

export const RUN_LAB: RunSummary = {
  run_id: '20261114T221500Z-a1b2c3',
  pipeline: 'lab.score',
  pipeline_label: 'Labo · 1. Score',
  kind: 'single',
  status: 'warning',
  trigger: 'labo',
  persona_id: 'amira',
  title: 'SHOP.TO',
  started_at: '2026-11-14T22:15:00Z',
  finished_at: '2026-11-14T22:15:02Z',
  duration_ms: 1530,
  key_result: { label: 'Score', value: 72 },
  governance_passed: false,
  error: null,
  parent_id: null,
  child_count: 0,
}

export const RUN_BATCH: RunSummary = {
  ...RUN_LAB,
  run_id: '20261114T221000Z-d4e5f6',
  kind: 'batch',
  title: 'Groupe · Les plus populaires (3 titres)',
  started_at: '2026-11-14T22:10:00Z',
  finished_at: '2026-11-14T22:10:48Z',
  duration_ms: 48200,
  key_result: null,
  governance_passed: null,
  child_count: 3,
}

export const RUN_SCORE_PIPELINE: RunSummary = {
  run_id: '20261114T060000Z-0f9e8d',
  pipeline: 'score_pipeline',
  pipeline_label: 'Pipeline de score',
  kind: 'pipeline',
  status: 'running',
  trigger: 'schedule',
  persona_id: null,
  title: 'Pipeline de score du 2026-11-14',
  started_at: '2026-11-14T06:00:00Z',
  finished_at: null,
  duration_ms: null,
  key_result: null,
  governance_passed: null,
  error: null,
  parent_id: null,
  child_count: 0,
}

export const RUN_PAGE: RunPage = {
  runs: [RUN_LAB, RUN_BATCH, RUN_SCORE_PIPELINE],
  next_cursor: '20261114T060000Z-0f9e8d',
  stored: true,
}

export const RUN_DETAIL_LAB: RunDetail = {
  ...RUN_LAB,
  inputs: { ticker: 'SHOP.TO', peers: ['RY.TO'] },
  options: { 'fetch.window': '5y', 'scoring.method': 'rank' },
  group: null,
  stages: [
    {
      id: 'fetch',
      name: 'Collecte',
      layer: 'bronze',
      status: 'ok',
      duration_ms: 420,
      warnings: 0,
      decisions: 2,
      datasets: [
        { id: 'prices_SHOP.TO', title: 'Prix quotidiens SHOP.TO', source_id: 's1', rows: 2, columns: 4 },
        { id: 'edgar_facts', title: 'Faits XBRL EDGAR', source_id: null, rows: 3, columns: 3 },
      ],
    },
    {
      id: 'scoring',
      name: 'Notation',
      layer: 'gold',
      status: 'warning',
      duration_ms: 80,
      warnings: 1,
      decisions: 1,
      datasets: [],
    },
  ],
  result: LAB_RUN.result,
  children: [],
  table: null,
  params: null,
  summary: null,
}

export const RUN_DETAIL_BATCH: RunDetail = {
  ...RUN_BATCH,
  inputs: { peers: ['RY.TO'], as_of: '2026-11-13' },
  options: LAB_BATCH_RUN.options_used,
  group: LAB_BATCH_RUN.group,
  stages: [],
  result: null,
  children: LAB_BATCH_RUN.items.map((item) => ({
    ...RUN_LAB,
    run_id: item.run_id ?? `missing-${item.ticker}`,
    kind: 'batch_item' as const,
    title: item.ticker,
    status: item.status === 'ok' ? ('succeeded' as const) : item.status === 'timeout' ? ('failed' as const) : ('warning' as const),
    key_result: item.key_result,
    governance_passed: item.governance_passed,
    error: item.error,
    parent_id: RUN_BATCH.run_id,
  })),
  table: LAB_BATCH_RUN.table,
  params: null,
  summary: null,
}

export const RUN_STAGE_LAB: RunStageDetail = { pipeline: 'lab', stage: LAB_RUN.stages[0] }

export const RUN_ARTIFACTS: RunArtifactList = {
  run_id: RUN_LAB.run_id,
  artifacts: [
    {
      id: 'lab:fetch:dataset:prices_SHOP.TO',
      kind: 'dataset',
      stage_id: 'fetch',
      title: 'Prix quotidiens SHOP.TO',
      format: 'table',
      path: null,
      size_bytes: 180,
      rows: 2,
      columns: 4,
    },
    {
      id: 'lab:fetch:decisions',
      kind: 'decisions',
      stage_id: 'fetch',
      title: 'Décisions · Collecte',
      format: 'table',
      path: null,
      size_bytes: null,
      rows: 2,
      columns: 5,
    },
    {
      id: 'file:c2lsdmVyL3VuaXZlcnMvMjAyNi0xMS0xNC91bml2ZXJzLmNzdg',
      kind: 'file',
      stage_id: 'silver_univers',
      title: 'univers.csv',
      format: 'csv',
      path: 'score/silver/univers/2026-11-14/20261114T060000Z-0f9e8d/univers.csv',
      size_bytes: 48213,
      rows: null,
      columns: null,
    },
  ],
}

export const RUN_ARTIFACT_PREVIEW: RunArtifactPreview = {
  artifact: RUN_ARTIFACTS.artifacts[0],
  columns: ['date', 'ticker', 'close', 'volume'],
  rows: [
    ['2026-11-12', 'SHOP.TO', 101.5, 1200],
    ['2026-11-13', 'SHOP.TO', null, 900],
  ],
  offset: 0,
  limit: 100,
  total_rows: 2,
  has_more: false,
  note: null,
}
