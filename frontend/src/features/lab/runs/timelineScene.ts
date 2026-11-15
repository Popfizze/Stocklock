/** The « Frise » of the Labo: the runs along time, one named row per pipeline, by day or run by run. */

import type { RunPipeline, RunStatus, RunSummary } from '@/api/runs'
import type { SceneFlow, SceneTile } from '@/components/three'
import { dayKey, formatCount, formatTime, runSize, runSummaryLine, STATUS_TONES } from './runModel'

/** `days`: one stack per day and pipeline (the overview); `runs`: one tile per run (the detail). */
export type TimelineZoom = 'days' | 'runs'

/** The rows, back to front, with the name written at the head of each (and its short form for a phone). */
const LANES: Array<{ pipeline: RunPipeline; name: string; short: string }> = [
  { pipeline: 'score_pipeline', name: 'Score AWS', short: 'AWS' },
  { pipeline: 'lab.score', name: 'Labo · Score', short: 'Score' },
  { pipeline: 'lab.explain_move', name: 'Labo · Comprendre', short: 'Compr.' },
  { pipeline: 'lab.tax', name: 'Labo · Fiscalité', short: 'Fisc.' },
  { pipeline: 'lab.bias', name: 'Labo · Biais', short: 'Biais' },
]

/** Columns drawn at once: beyond, the frieze is paged along time. */
export const WINDOW: Record<TimelineZoom, { wide: number; narrow: number }> = {
  days: { wide: 14, narrow: 6 },
  runs: { wide: 24, narrow: 9 },
}

const DAY_SHORT = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', timeZone: 'America/Toronto' })
/** Distance between two rows: far enough apart for a row to show above the one in front of it. */
const PITCH = 1.7
const STACK_ORDER: RunStatus[] = ['succeeded', 'warning', 'failed', 'running']
export const DAY_PREFIX = 'jour:'

export interface TimelineDay {
  key: string
  /** « 14 nov. » */
  label: string
  runs: RunSummary[]
  counts: Record<RunStatus, number>
}

/** The runs grouped by the day they started, oldest day first, each day's runs oldest first. */
export function timelineDays(runs: RunSummary[]): TimelineDay[] {
  const days = new Map<string, TimelineDay>()
  const ordered = [...runs].sort((a, b) => a.started_at.localeCompare(b.started_at))
  for (const run of ordered) {
    const key = dayKey(run.started_at)
    let day = days.get(key)
    if (!day) {
      day = { key, label: DAY_SHORT.format(new Date(run.started_at)), runs: [], counts: { running: 0, succeeded: 0, warning: 0, failed: 0 } }
      days.set(key, day)
    }
    day.runs.push(run)
    day.counts[run.status]++
  }
  return [...days.values()]
}

export interface TimelineScene {
  tiles: SceneTile[]
  flows: SceneFlow[]
  /** The rows drawn, back to front. */
  lanes: string[]
  /** What the window covers: « 12 nov. – 14 nov. » */
  span: string
  /** Position of the window among the columns (days or runs), for the pager. */
  from: number
  to: number
  total: number
}

export interface TimelineOptions {
  zoom: TimelineZoom
  /** Columns drawn at once. */
  size: number
  /** Index after the last column drawn, among the columns in time order; null: the most recent ones. */
  end: number | null
  /** Runs to make stand out: the one pointed at in the frieze, those picked for a comparison. */
  selected: string[]
}

const plural = (count: number, word: string) => `${formatCount(count)} ${word}${count > 1 ? 's' : ''}`

/**
 * The frieze's tiles. Time runs left to right; each pipeline that ran has its own named row; a bar under
 * the rows carries each day's date. By day, a stack per pipeline counts the day's runs, shaded by status.
 * Run by run, a tile is taller when it handled more titles; failures, running runs, the largest run and
 * the selected ones are tagged.
 */
export function timelineScene(runs: RunSummary[], { zoom, size, end, selected }: TimelineOptions): TimelineScene {
  const days = timelineDays(runs)
  const lanes = LANES.filter((lane) => runs.some((run) => run.pipeline === lane.pipeline))
  const laneOf = (run: RunSummary) => Math.max(0, lanes.findIndex((lane) => lane.pipeline === run.pipeline)) * PITCH
  const tiles: SceneTile[] = []
  const flows: SceneFlow[] = []
  const front = (lanes.length - 1) * PITCH + 0.5
  const columns = zoom === 'days' ? days.length : runs.length
  const to = Math.min(columns, Math.max(Math.min(size, columns), end ?? columns))
  const from = Math.max(0, to - size)
  let x = 0
  let right = 0
  let first = ''
  let last = ''
  /** The date bar under a day's columns: the time axis. */
  const dayBar = (start: number, stop: number, day: TimelineDay, count: number) => {
    tiles.push({ x: (start + stop) / 2, z: front + 0.35, w: stop - start + 0.9, d: 0.3, h: 0.14, tone: 3, tag: `${day.label}\n${formatCount(count)} exéc.`, tagShort: day.label, tagAt: 'base' })
    first ||= day.label
    last = day.label
    right = stop
  }

  if (zoom === 'days') {
    const shown = days.slice(from, to)
    const tallest = Math.max(1, ...shown.flatMap((day) => lanes.map((lane) => day.runs.filter((run) => run.pipeline === lane.pipeline).length)))
    const unit = Math.min(0.5, 3 / tallest)
    shown.forEach((day) => {
      lanes.forEach((lane, row) => {
        const z = row * PITCH
        const own = day.runs.filter((run) => run.pipeline === lane.pipeline)
        let base = 0
        for (const status of STACK_ORDER) {
          const count = own.filter((run) => run.status === status).length
          if (count === 0) continue
          const failed = status === 'failed'
          tiles.push({
            id: `${DAY_PREFIX}${day.key}`,
            x,
            z,
            y: base,
            h: count * unit,
            w: 1.1,
            tone: STATUS_TONES[status],
            label: `${day.label} · ${lane.name} · ${plural(own.length, 'exécution')}`,
            tag: failed ? plural(count, 'échec') : status === 'running' ? 'En cours' : undefined,
            tagFirst: failed,
          })
          base += count * unit
        }
      })
      dayBar(x, x, day, day.runs.length)
      x += 1.5
    })
  } else {
    const ordered = days.flatMap((day) => day.runs.map((run) => ({ run, day })))
    const shown = ordered.slice(from, to)
    const largest = shown.reduce((best, item) => (runSize(item.run) > runSize(best.run) ? item : best), shown[0])
    let start = 0
    shown.forEach(({ run, day }, index) => {
      const previous = shown[index - 1]
      if (previous && previous.day !== day) {
        dayBar(start, x - 1, previous.day, shown.filter((item) => item.day === previous.day).length)
        x += 0.8
        start = x
      }
      const z = laneOf(run)
      const picked = selected.includes(run.run_id)
      const size = runSize(run)
      const h = run.status === 'running' ? 0.5 : 0.6 + Math.log2(size) * 0.4
      // A selected run stands on an ink plate and says what it is.
      if (picked) tiles.push({ x, z, w: 1.25, d: 1.25, y: -0.03, h: 0.07, tone: 1 })
      let tag: string | undefined
      if (picked) tag = `${run.title.length > 18 ? `${run.title.slice(0, 17)}…` : run.title}\n${formatTime(run.started_at)}`
      else if (run.status === 'failed') tag = 'Échec'
      else if (run.status === 'running') tag = 'En cours'
      else if (run === largest?.run && size > 1) tag = `${formatCount(size)} titres`
      tiles.push({ id: run.run_id, x, z, h, tone: STATUS_TONES[run.status], label: runSummaryLine(run), tag, tagShort: picked ? formatTime(run.started_at) : tag, tagFirst: picked })
      if (run.status === 'running') flows.push({ from: [x - 0.45, z], to: [x + 0.45, z], count: 2, tone: 3 })
      x += 1
    })
    const tail = shown[shown.length - 1]
    if (tail) dayBar(start, x - 1, tail.day, shown.filter((item) => item.day === tail.day).length)
  }

  // Each row: a strip the length of the window, and the pipeline's name at its head.
  lanes.forEach((lane, row) => {
    const z = row * PITCH
    tiles.push({ x: right / 2, z, w: right + 1.2, d: 1.1, y: -0.13, h: 0.1, tone: 8 })
    tiles.push({ x: -1.6, z, w: 1.3, d: 0.9, h: 0.3, tone: 4, tag: lane.name, tagShort: lane.short, tagFirst: true })
  })
  return { tiles, flows, lanes: lanes.map((lane) => lane.name), span: first === last ? first : `${first} – ${last}`, from, to, total: columns }
}

/** What the frieze shows, in a sentence. */
export function timelineLabel(runs: RunSummary[], scene: TimelineScene, zoom: TimelineZoom): string {
  const count = (status: RunStatus) => runs.filter((run) => run.status === status).length
  const parts = [
    plural(runs.length, 'exécution'),
    count('running') > 0 ? `${count('running')} en cours` : null,
    `${count('succeeded')} réussie${count('succeeded') > 1 ? 's' : ''}`,
    count('warning') > 0 ? `${count('warning')} avec avertissements` : null,
    count('failed') > 0 ? `${count('failed')} en échec` : null,
  ]
  const window = scene.to - scene.from < scene.total ? ` Affichées : ${zoom === 'days' ? 'jours' : 'exécutions'} ${scene.from + 1} à ${scene.to} sur ${scene.total} (${scene.span}).` : ''
  return `Frise 3D des exécutions dans le temps, de la plus ancienne à gauche à la plus récente à droite : ${parts.filter(Boolean).join(', ')}. Une rangée par pipeline : ${scene.lanes.join(', ')}.${window} La même liste suit en texte.`
}
