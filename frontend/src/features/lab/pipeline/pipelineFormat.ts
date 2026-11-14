import type { ApiError } from '@/api/client'
import type {
  ScoreLayer,
  ScoreRun,
  ScoreRunParams,
  ScoreRunStage,
  ScoreRunStatus,
  ScoreStageStatus,
} from '@/api/pipeline'

const LOCALE = 'fr-CA'

export const DEFAULT_PARAMS: ScoreRunParams = {
  max_titles: 200,
  ca_share: 0.3,
  etf_share: 0.1,
  news_per_title: 6,
  max_llm_articles: 1200,
}

export const STATUS_LABELS: Record<ScoreStageStatus, string> = {
  pending: 'En attente',
  running: 'En cours',
  succeeded: 'Terminé',
  failed: 'Échec',
}

export const STATUS_VARIANTS: Record<
  ScoreStageStatus,
  'secondary' | 'warning' | 'success' | 'destructive'
> = {
  pending: 'secondary',
  running: 'warning',
  succeeded: 'success',
  failed: 'destructive',
}

export const LAYER_LABELS: Record<ScoreLayer, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
}

export const TRIGGER_LABELS: Record<ScoreRun['trigger'], string> = {
  api: 'Lancé depuis les Coulisses',
  schedule: 'Planifié',
  local: 'Local',
}

/** A layer's status from its stages: failed, running, done, or still waiting. */
export function layerStatus(stages: ScoreRunStage[], layer: ScoreLayer): ScoreStageStatus {
  const own = stages.filter((stage) => stage.layer === layer)
  if (own.some((stage) => stage.status === 'failed')) return 'failed'
  if (own.length > 0 && own.every((stage) => stage.status === 'succeeded')) return 'succeeded'
  if (own.some((stage) => stage.status === 'running' || stage.status === 'succeeded')) return 'running'
  return 'pending'
}

/** The « Sortie » node: done only once the whole run has succeeded. */
export function outputStatus(status: ScoreRunStatus): ScoreStageStatus {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed') return 'failed'
  return 'pending'
}

const SECONDS = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })
const COUNT = new Intl.NumberFormat(LOCALE)
const PERCENT = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Toronto',
})

/** 2.8 → 2,8 s · 96 → 1 min 36 s */
export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${SECONDS.format(seconds)} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : COUNT.format(value)
}

export function formatShare(share: number): string {
  return PERCENT.format(share)
}

/** 2026-11-14T21:53:36Z → 14 nov. 2026, 16 h 53 (Toronto) */
export function formatDateTime(iso: string | null): string {
  return iso === null ? '—' : DATE_TIME.format(new Date(iso))
}

export function pipelineErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  }
  if (error.status === 409) return 'Un run est déjà en cours : attendez sa fin avant d’en lancer un autre.'
  if (error.status === 503) return 'Le pipeline de score n’est pas déployé sur ce serveur.'
  if (error.status === 422) return 'Paramètres refusés par le serveur : vérifiez les valeurs saisies.'
  return `La requête a échoué (erreur ${error.status}). Réessayez dans un instant.`
}
