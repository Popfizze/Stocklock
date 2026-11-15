import { SUB_SCORE_SHORT, type ReweightedRow } from '@/api/scoring'
import type { ScoreIndicator, ScoreRow, SubScore } from '@/api/stocks'
import type { SceneTile, TileTone } from '@/components/three'
import { formatIndicator, formatPoints, formatScore, formatWeight } from './format'

/** Height of a score of 100, in tile units; a point of score is `UNIT` high. */
export const MAX_HEIGHT = 5
const UNIT = MAX_HEIGHT / 100
const SPACING = 2
/** A pillar's side: a base, plus what its weight adds (the square root keeps areas honest). */
const BASE_SIDE = 0.7
const WEIGHT_SIDE = 1.4
const FLAT = 0.06
const TOWER_SIDE = 1.5
const TOWER_GAP = 1.4
/** The sub-scores' tile steps, in the API's order: the same as the gauge and the list. */
const TONES: TileTone[] = [1, 2, 3, 4, 5, 6]

export const BETTER_LABELS: Record<ScoreIndicator['better'], string> = {
  higher: 'Plus haut, mieux',
  lower: 'Plus bas, mieux',
}

const toneOf = (index: number): TileTone => TONES[index % TONES.length]

/** A tower: each sub-score's contribution stacked on the previous ones, up to the score. */
function tower(
  parts: Array<{ id: string; label: string; contribution: number }>,
  x: number,
  name: string,
  tag: string,
): SceneTile[] {
  let base = 0
  const last = parts.reduce((found, part, index) => (part.contribution > 0 ? index : found), -1)
  return parts.flatMap((part, index) => {
    if (part.contribution <= 0) return []
    const tile: SceneTile = {
      id: part.id,
      x,
      z: 0,
      w: TOWER_SIDE,
      d: TOWER_SIDE,
      y: base,
      h: part.contribution * UNIT,
      tone: toneOf(index),
      label: `${name} · ${part.label} apporte ${formatPoints(part.contribution)} pts`,
      // The tower's name and total are written on its top tile.
      tag: index === last ? tag : undefined,
    }
    base += tile.h
    return [tile]
  })
}

/**
 * The score being built: one pillar per sub-score (height = its score, footprint
 * = its weight after redistribution), then the tower their contributions stack
 * into — and, with the user's own weights, a second tower for their score.
 */
export function overviewTiles(row: ScoreRow, personal?: ReweightedRow): SceneTile[] {
  const pillars = row.sub_scores.map((subScore, index): SceneTile => {
    const missing = subScore.score === null
    const side = missing ? BASE_SIDE : BASE_SIDE + Math.sqrt(subScore.effective_weight) * WEIGHT_SIDE
    return {
      id: subScore.id,
      x: index * SPACING,
      z: 0,
      w: side,
      d: side,
      h: missing ? FLAT : Math.max(FLAT, (subScore.score ?? 0) * UNIT),
      tone: missing ? 7 : toneOf(index),
      tag: `${SUB_SCORE_SHORT[subScore.id] ?? subScore.label}\n${missing ? 'n. d.' : formatScore(subScore.score ?? 0)}`,
      tagShort: missing ? 'n. d.' : formatScore(subScore.score ?? 0),
      label: missing
        ? `${subScore.label} · non disponible`
        : `${subScore.label} · ${formatScore(subScore.score ?? 0)} / 100 · poids ${formatWeight(subScore.effective_weight)} · +${formatPoints(subScore.contribution)} pts`,
    }
  })
  const towerX = row.sub_scores.length * SPACING + TOWER_GAP
  const stockLock = tower(row.sub_scores, towerX, `Score StockLock ${formatScore(row.score)}`, `Score\n${formatScore(row.score)}`)
  const own =
    personal && personal.custom_score !== null
      ? tower(personal.sub_scores, towerX + TOWER_SIDE + 0.6, `Votre score ${formatScore(personal.custom_score)}`, `Le vôtre\n${formatScore(personal.custom_score)}`)
      : []
  return [...pillars, ...stockLock, ...own]
}

/** A sub-score opened: one column per raw indicator, as tall as its rank among comparable titles. */
export function indicatorTiles(subScore: SubScore, index: number): SceneTile[] {
  return subScore.indicators.map((indicator, position) => ({
    id: indicator.id,
    x: position * SPACING,
    z: 0,
    w: 1.3,
    d: 1.3,
    h: indicator.rank === null ? FLAT : Math.max(FLAT, indicator.rank * UNIT),
    tone: indicator.rank === null ? 7 : toneOf(index),
    tag: `${indicator.label.length > 22 ? `${indicator.label.slice(0, 21)}…` : indicator.label}\n${
      indicator.rank === null ? 'rang inconnu' : `rang ${formatScore(indicator.rank)}`
    }`,
    label: `${indicator.label} · ${formatIndicator(indicator.value, indicator.unit)} · ${
      indicator.rank === null ? 'rang inconnu' : `rang ${formatScore(indicator.rank)} sur 100`
    } · ${BETTER_LABELS[indicator.better].toLowerCase()}`,
  }))
}
