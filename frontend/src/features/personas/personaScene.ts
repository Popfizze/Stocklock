import { seeded, type SceneTile, type TileTone } from '@/components/three'

const SIDE = 5

function grid(build: (column: number, row: number, random: () => number) => SceneTile | null, seed: number): SceneTile[] {
  const random = seeded(seed)
  const tiles: SceneTile[] = []
  for (let row = 0; row < SIDE; row++) {
    for (let column = 0; column < SIDE; column++) {
      const tile = build(column, row, random)
      if (tile) tiles.push(tile)
    }
  }
  return tiles
}

/** Amira — high risk, long horizon, AI and crypto: tall, uneven, contrasted towers. */
function amira(): SceneTile[] {
  return grid((x, z, random) => {
    const h = 0.6 + random() * random() * 5.4
    const tone = (h > 3.4 ? 1 : h > 2 ? 3 : h > 1.1 ? 5 : 7) as TileTone
    return { x, z, h, tone }
  }, 11)
}

/** Mateo — moderate, ESG, one sector excluded: an even block with a gap where that sector would stand. */
function mateo(): SceneTile[] {
  return grid((x, z, random) => {
    if (x >= 3 && z <= 1) return null
    const h = 1.7 + random() * 0.7
    return { x, z, h, tone: (h > 2.1 ? 3 : 5) as TileTone }
  }, 23)
}

/** Robert — capital preservation, short horizon: a wide protective base, low and level on top. */
function robert(): SceneTile[] {
  const base: SceneTile[] = grid((x, z) => ({ x: x * 1.2 - 0.4, z: z * 1.2 - 0.4, w: 1.2, d: 1.2, h: 0.45, tone: 2 }), 1)
  const top = grid((x, z, random) => {
    if (x === 0 || z === 0 || x === SIDE - 1 || z === SIDE - 1) return null
    return { x, z, y: 0.45, h: 0.7 + random() * 0.25, tone: 6 }
  }, 5)
  return [...base, ...top]
}

/** Any other profile: a calm seeded block, so a new persona still gets its scene. */
function generic(id: string): SceneTile[] {
  const seed = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 3)
  return grid((x, z, random) => ({ x, z, h: 1 + random() * 2, tone: (random() > 0.5 ? 4 : 6) as TileTone }), seed)
}

const SCENES: Record<string, { tiles: () => SceneTile[]; reading: string }> = {
  amira: { tiles: amira, reading: 'des tours hautes et inégales : un profil qui accepte de grands écarts' },
  mateo: { tiles: mateo, reading: 'un bloc régulier avec un vide : le secteur que ce profil exclut' },
  robert: { tiles: robert, reading: 'un socle large et des tuiles basses : préserver avant de faire croître' },
}

/** The figures a profile's sculpture carries, when the profile is known. */
export interface PersonaFigures {
  risk_tolerance: string
  horizon: string
  /** The profile's limits, when the API gives them: the highest volatility it accepts is tagged too. */
  limits?: { max_volatility: number }
}

const PERCENT = new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 0 })

/**
 * The tile composition that embodies an investor profile, and how to read it. With the profile's
 * figures, two discreet tags are written on it: the risk level on its tallest tile, the horizon at its foot.
 */
export function personaScene(personaId: string, figures?: PersonaFigures): { tiles: SceneTile[]; reading: string } {
  const scene = SCENES[personaId]
  const tiles = scene ? scene.tiles() : generic(personaId)
  const reading = scene ? scene.reading : 'un bloc de tuiles propre à ce profil'
  if (figures && tiles.length > 0) {
    const top = (tile: SceneTile) => (tile.y ?? 0) + tile.h
    const tallest = tiles.reduce((best, tile) => (top(tile) > top(best) ? tile : best))
    const front = tiles.reduce((best, tile) => (tile.z - tile.x > best.z - best.x ? tile : best))
    // The right-most tile (other than the two already tagged) carries the volatility ceiling.
    const others = tiles.filter((tile) => tile !== tallest && tile !== front)
    const side = others.length > 0 ? others.reduce((best, tile) => (tile.x > best.x ? tile : best)) : null
    const volatility = figures.limits ? PERCENT.format(figures.limits.max_volatility) : null
    const tagged = tiles.map((tile) => {
      if (tile === tallest) return { ...tile, tag: `Risque : ${figures.risk_tolerance.toLowerCase()}`, tagFirst: true }
      if (tile === front) return { ...tile, tag: `Horizon : ${figures.horizon.toLowerCase()}`, tagAt: 'base' as const }
      if (tile === side && volatility) return { ...tile, tag: `Volatilité max : ${volatility}` }
      return tile
    })
    const limit = volatility ? `, volatilité max ${volatility}` : ''
    return {
      tiles: tagged,
      reading: `${reading} (risque ${figures.risk_tolerance.toLowerCase()}, horizon ${figures.horizon.toLowerCase()}${limit})`,
    }
  }
  return { tiles, reading }
}
