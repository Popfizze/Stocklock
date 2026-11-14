/** Pure helpers of « Lancer »: the group draft, the parameters' ranges, and the request bodies. */

import type { ApiError } from '@/api/client'
import type { LabGroup, LabInput, LabInputValue } from '@/api/lab'
import type { ScoreRunGroup, ScoreRunParams, ScoreRunRequest } from '@/api/pipeline'

/** The launcher's id for the AWS score pipeline; the other pipelines are Labo step ids. */
export const SCORE_PIPELINE = 'score_pipeline'

export const SCORE_PIPELINE_INFO = {
  label: 'Pipeline de score',
  description: 'Reconstruit sur AWS la table des scores lue par le tableau de bord et les fiches titre.',
  timing: '5 titres ≈ 50 s · 200 titres ≈ 4 à 5 min',
}

/** `auto`: the score pipeline's own selection; `portfolio` and `custom` are sent as a list of tickers. */
export type GroupKind = 'auto' | 'section' | 'sector' | 'portfolio' | 'custom'

export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  auto: 'Sélection automatique',
  section: 'Section du tableau de bord',
  sector: 'Secteur',
  portfolio: 'Mon portefeuille',
  custom: 'Titres choisis',
}

export interface GroupDraft {
  kind: GroupKind
  /** The section id or sector name. */
  ref: string | null
  /** Titles asked from a section, a sector or the automatic selection. */
  size: number
  /** The custom set. */
  tickers: string[]
}

/** What a group can be, for the pipeline at hand. */
export interface GroupLimits {
  /** Most titles a list, a section or a sector can hold. */
  cap: number
  /** Most titles of the automatic selection (score pipeline only). */
  autoCap: number
  defaults: Record<'auto' | 'section' | 'sector', number>
}

export const scoreLimits = (maxTickers: number): GroupLimits => ({
  cap: maxTickers,
  autoCap: 600,
  defaults: { auto: 200, section: 30, sector: 50 },
})

export const labLimits = (maxTitles: number): GroupLimits => ({
  cap: maxTitles,
  autoCap: maxTitles,
  defaults: { auto: maxTitles, section: Math.min(10, maxTitles), sector: Math.min(10, maxTitles) },
})

/** The tickers a draft sends itself (`portfolio`, `custom`), cut to the cap; null for a server-resolved group. */
export function draftTickers(draft: GroupDraft, portfolio: string[], cap: number): string[] | null {
  if (draft.kind === 'portfolio') return portfolio.slice(0, cap)
  if (draft.kind === 'custom') return draft.tickers.slice(0, cap)
  return null
}

/** Titles the run will ask for. */
export function groupSize(draft: GroupDraft, portfolio: string[], cap: number): number {
  return draftTickers(draft, portfolio, cap)?.length ?? draft.size
}

/** Why the group cannot be launched yet, or null. */
export function groupProblem(draft: GroupDraft, portfolio: string[], cap: number): string | null {
  if ((draft.kind === 'section' || draft.kind === 'sector') && !draft.ref) {
    return draft.kind === 'section' ? 'Choisissez une section.' : 'Choisissez un secteur.'
  }
  if (groupSize(draft, portfolio, cap) === 0) {
    return draft.kind === 'portfolio' ? 'Le portefeuille de ce profil est vide.' : 'Ajoutez au moins un titre au groupe.'
  }
  return null
}

export const SCORE_DEFAULTS: ScoreRunParams = {
  max_titles: 200,
  ca_share: 0.3,
  etf_share: 0.1,
  news_per_title: 6,
  max_llm_articles: 1200,
}

export interface NumberSpec {
  min: number
  max: number
  step: number
  /** `percent`: a 0-1 fraction shown as a percentage. */
  format: 'count' | 'percent' | 'money'
}

export interface ScoreParamSpec extends NumberSpec {
  key: Exclude<keyof ScoreRunParams, 'max_titles'>
  label: string
  help: string
  /** The group kinds the parameter applies to. */
  kinds: GroupKind[]
}

/** The score pipeline's settings besides the group's size (which the group step sets). */
export const SCORE_PARAM_SPECS: ScoreParamSpec[] = [
  { key: 'ca_share', label: 'Part TSX', help: 'Part des actions canadiennes parmi les actions.', min: 0, max: 1, step: 0.05, format: 'percent', kinds: ['auto', 'sector'] },
  { key: 'etf_share', label: 'Part FNB', help: 'Part des FNB parmi les titres.', min: 0, max: 0.5, step: 0.05, format: 'percent', kinds: ['auto'] },
  { key: 'news_per_title', label: 'Articles par titre', help: 'Articles gardés au plus pour chaque titre.', min: 0, max: 20, step: 1, format: 'count', kinds: ['auto', 'section', 'sector', 'portfolio', 'custom'] },
  { key: 'max_llm_articles', label: 'Articles lus par Bedrock', help: 'Plafond d’articles envoyés à Claude Haiku dans le run.', min: 0, max: 3000, step: 100, format: 'count', kinds: ['auto', 'section', 'sector', 'portfolio', 'custom'] },
]

const LOCALE = 'fr-CA'

export function formatNumber(value: number, format: NumberSpec['format']): string {
  if (format === 'percent') return `${(value * 100).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} %`
  if (format === 'money') return `${value.toLocaleString(LOCALE, { maximumFractionDigits: 0 })} $`
  return value.toLocaleString(LOCALE)
}

/** A slider's range for a numeric Labo input, from its name and default (the catalog gives no bounds). */
export function numberSpec(input: LabInput): NumberSpec {
  const value = typeof input.default === 'number' ? input.default : 0
  if (/year|horizon/i.test(input.name)) return { min: 1, max: 40, step: 1, format: 'count' }
  if (/return/i.test(input.name)) return { min: 0, max: 0.15, step: 0.0025, format: 'percent' }
  if (/rate|share/i.test(input.name) || (value > 0 && value < 1)) return { min: 0, max: 0.6, step: 0.0025, format: 'percent' }
  const max = Math.max(1000, value * 4)
  return { min: 0, max, step: max >= 100_000 ? 1000 : 250, format: 'money' }
}

/** The score pipeline's request for a group draft. */
export function scoreRequest(draft: GroupDraft, params: ScoreRunParams, portfolio: string[], cap: number): ScoreRunRequest {
  const tickers = draftTickers(draft, portfolio, cap)
  const group: ScoreRunGroup = tickers
    ? { kind: 'tickers', tickers }
    : draft.kind === 'section'
      ? { kind: 'section', id: draft.ref ?? '', limit: draft.size }
      : draft.kind === 'sector'
        ? { kind: 'sector', name: draft.ref ?? '', max_titles: draft.size, ca_share: params.ca_share }
        : { kind: 'auto', max_titles: draft.size, ca_share: params.ca_share, etf_share: params.etf_share }
  return { ...params, max_titles: draft.kind === 'auto' ? draft.size : params.max_titles, group }
}

/** The Labo's group for a draft. */
export function labGroup(draft: GroupDraft, portfolio: string[], cap: number): LabGroup {
  const tickers = draftTickers(draft, portfolio, cap)
  if (tickers) return { kind: draft.kind === 'portfolio' ? 'portfolio' : 'tickers', tickers }
  return { kind: draft.kind === 'sector' ? 'sector' : 'section', ref: draft.ref ?? '', limit: draft.size }
}

/** The inputs' defaults as request values. */
export function defaultInputs(inputs: LabInput[]): Record<string, LabInputValue> {
  return Object.fromEntries(inputs.map((input) => [input.name, input.default]))
}

/** The size the server says would fit, from its 422 (« Lancez 12 titres au plus… »). */
export function fittingSize(error: ApiError | null): number | null {
  if (!error || error.status !== 422) return null
  const match = /Lancez (\d+) titres? au plus/.exec(error.message)
  return match ? Number(match[1]) : null
}

export function scoreErrorMessage(error: ApiError): string {
  if (error.status === 0) return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  if (error.status === 409) return 'Un run du pipeline de score est déjà en cours : ouvrez-le plutôt que d’en lancer un autre.'
  if (error.status === 503) return 'Le pipeline de score n’est pas déployé sur ce serveur.'
  if (error.status === 422) {
    const detail = error.message === 'Request failed' ? 'vérifiez le groupe et les paramètres.' : error.message
    return `Groupe ou paramètres refusés : ${detail}`
  }
  return `Le lancement a échoué (erreur ${error.status}). Réessayez dans un instant.`
}
