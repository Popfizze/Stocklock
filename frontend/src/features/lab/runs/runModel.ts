/**
 * Pure helpers of the « Exécutions » console: labels, filters, the fallback list built from
 * the score pipeline's own records (the 3D timeline's tiles are in `timelineScene`).
 */

import type { ApiError } from '@/api/client'
import type { ScoreRunInfo } from '@/api/pipeline'
import type { RunFilters, RunStatus, RunSummary, RunTrigger } from '@/api/runs'
import type { TileTone } from '@/components/three'
import { API_BASE_URL } from '@/lib/env'

const LOCALE = 'fr-CA'
const ZONE = 'America/Toronto'

export const STATUS_LABELS: Record<RunStatus, string> = {
  running: 'En cours',
  succeeded: 'Réussi',
  warning: 'Avertissements',
  failed: 'Échec',
}

export const STATUS_VARIANTS: Record<RunStatus, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  running: 'secondary',
  succeeded: 'success',
  warning: 'warning',
  failed: 'destructive',
}

/** Shade = status: a finished run is ink, a running one is still pale, trouble takes its colour. */
export const STATUS_TONES: Record<RunStatus, TileTone> = {
  running: 6,
  succeeded: 2,
  warning: 'warn',
  failed: 'alert',
}

/** The same shades for the flat status square of the list. */
export const STATUS_SWATCHES: Record<RunStatus, string> = {
  running: 'bg-tile-6 motion-safe:animate-pulse',
  succeeded: 'bg-tile-2',
  warning: 'bg-warning',
  failed: 'bg-destructive',
}

export const TRIGGER_LABELS: Record<RunTrigger, string> = {
  labo: 'Labo',
  api: 'Lancé à la main',
  schedule: 'Planifié',
  local: 'Local',
}

export type PipelineFilter = NonNullable<RunFilters['pipeline']>

export const PIPELINE_LABELS: Record<PipelineFilter, string> = {
  score_pipeline: 'Pipeline de score',
  lab: 'Labo (tous)',
  'lab.score': 'Labo · Score',
  'lab.explain_move': 'Labo · Comprendre',
  'lab.tax': 'Labo · Fiscalité',
  'lab.bias': 'Labo · Biais',
}

export type DateRange = 'all' | 'today' | '7d' | '30d'

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: 'Toutes les dates',
  today: "Aujourd'hui",
  '7d': '7 jours',
  '30d': '30 jours',
}

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE })
const DAY_LABEL = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'full', timeZone: ZONE })
const TIME = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short', timeZone: ZONE })
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONE })
const COUNT = new Intl.NumberFormat(LOCALE)

/** `2026-11-14` in Toronto: runs are grouped by the day they started. */
export function dayKey(iso: string): string {
  return DAY_KEY.format(new Date(iso))
}

export function formatDay(iso: string): string {
  return DAY_LABEL.format(new Date(iso))
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso))
}

export function formatDateTime(iso: string | null): string {
  return iso === null ? '—' : DATE_TIME.format(new Date(iso))
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : COUNT.format(value)
}

/** 850 → 850 ms · 2 800 → 2,8 s · 96 000 → 1 min 36 s */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

export function formatKeyResult(result: RunSummary['key_result']): string | null {
  if (!result || result.value === null) return null
  const value = typeof result.value === 'number' ? result.value.toLocaleString(LOCALE, { maximumFractionDigits: 2 }) : result.value
  return `${result.label} : ${value}`
}

/**
 * The start of a date range, as the registry's `since` (an ISO date-time): local midnight, today or
 * as many days ago — stable through the day, so the list is not asked again at every render.
 */
export function sinceOf(range: DateRange, now: Date): string | undefined {
  if (range === 'all') return undefined
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range !== 'today') start.setDate(start.getDate() - (range === '7d' ? 7 : 30))
  return start.toISOString()
}

/** The same range on the client, for the list built without the registry (and the last-day edge). */
export function withinRange(run: RunSummary, range: DateRange, now: Date): boolean {
  if (range === 'all') return true
  if (range === 'today') return dayKey(run.started_at) === dayKey(now.toISOString())
  const days = range === '7d' ? 7 : 30
  return now.getTime() - new Date(run.started_at).getTime() <= days * DAY_MS
}

/** Titles a run handled, as far as its summary says: a group's titles, a score run's count, else one. */
export function runSize(run: RunSummary): number {
  if (run.child_count > 0) return run.child_count
  if (run.kind === 'pipeline' && typeof run.key_result?.value === 'number') return Math.max(1, run.key_result.value)
  return 1
}

/** One line that says what a run is, for a tile's caption and for assistive technology. */
export function runSummaryLine(run: RunSummary): string {
  const size = runSize(run)
  return [
    run.pipeline_label,
    run.title,
    STATUS_LABELS[run.status],
    size > 1 ? `${formatCount(size)} titres` : null,
    formatKeyResult(run.key_result),
    `${formatDay(run.started_at)} ${formatTime(run.started_at)}`,
    run.duration_ms === null ? null : formatDuration(run.duration_ms),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * A score pipeline run as a registry summary: what the console lists when the registry is
 * not available where the API runs (the score pipeline keeps its own records).
 */
export function summaryFromScoreRun(run: ScoreRunInfo): RunSummary {
  const scored = run.summary?.titles_scored ?? null
  return {
    run_id: run.run_id,
    pipeline: 'score_pipeline',
    pipeline_label: 'Pipeline de score',
    kind: 'pipeline',
    status: run.status,
    trigger: run.trigger,
    persona_id: null,
    title: run.group?.label ?? `Pipeline de score${run.date ? ` du ${run.date}` : ''}`,
    started_at: run.started_at ?? new Date(0).toISOString(),
    finished_at: run.finished_at,
    duration_ms: run.duration_s === null ? null : run.duration_s * 1000,
    key_result: scored === null ? null : { label: 'Titres notés', value: scored },
    governance_passed: null,
    error: run.error?.message ?? null,
    parent_id: null,
    child_count: 0,
  }
}

/** The registry's filters applied to a list built on the client (the fallback above). */
export function matchesFilters(run: RunSummary, filters: RunFilters): boolean {
  if (filters.pipeline === 'lab' ? !run.pipeline.startsWith('lab.') : filters.pipeline && run.pipeline !== filters.pipeline) {
    return false
  }
  if (filters.persona && run.persona_id !== filters.persona) return false
  if (filters.status && run.status !== filters.status) return false
  return !filters.trigger || run.trigger === filters.trigger
}

export function feedErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré, puis rechargez la page.`
  }
  return `Le serveur n'a pas pu fournir les exécutions (erreur ${error.status}). Rechargez la page pour réessayer.`
}
