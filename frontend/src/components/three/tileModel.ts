/**
 * The description of a 3D tile scene. A screen builds a list of tiles with
 * plain functions (testable without WebGL); `Tile3D` draws it, in three.js
 * when it can and as a flat SVG mosaic otherwise.
 */

/** 1-8: the grey tile scale (1 = ink). The others carry meaning: gain, loss, error, attention. */
export type TileTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 'up' | 'down' | 'alert' | 'warn'

export interface SceneTile {
  /** Position on the ground plane, in tile units. */
  x: number
  z: number
  /** Height; negative grows downwards from the base (a fall). */
  h: number
  /** Footprint, 1 × 1 by default. */
  w?: number
  d?: number
  /** Height of the base the tile stands on (to stack tiles). */
  y?: number
  tone: TileTone
  /** Shown when the tile is pointed at: « NVDA · -2,01 % ». */
  label?: string
  /**
   * Short text always written on the scene, next to the tile (« NVDA », « CELI »): what makes the
   * scene readable without pointing. A tag that would cover an earlier one is left out, in tile order.
   */
  tag?: string
  /** Where the tag sits: above the tile (default) or under its front edge. */
  tagAt?: 'top' | 'base'
  /** Opaque key handed back by `onSelect`. */
  id?: string
}

/** Small tiles travelling from one point of the ground to another, in a loop (data moving between stages). */
export interface SceneFlow {
  from: [x: number, z: number]
  to: [x: number, z: number]
  /** Tiles on the way at once (default 3). */
  count?: number
  tone?: TileTone
}

/** A translucent horizontal plane (a limit): what rises above it sticks out. */
export interface ScenePlane {
  y: number
}

/** `rise`: tiles grow once; `wave`: they grow, then breathe gently; `none`: drawn in place. */
export type SceneMotion = 'rise' | 'wave' | 'none'

/** `iso`: three-quarter view from above; `front`: lower, facing the rows; `top`: almost flat. */
export type SceneView = 'iso' | 'front' | 'top'

export interface TileSceneProps {
  tiles: SceneTile[]
  flows?: SceneFlow[]
  plane?: ScenePlane | null
  motion?: SceneMotion
  view?: SceneView
  onHover?: (tile: SceneTile | null) => void
  onSelect?: (tile: SceneTile) => void
  /**
   * Makes the tiles draggable up and down: called while one is dragged, with how far it
   * moved since the last call, in scene height units (positive = up).
   */
  onAdjust?: (tile: SceneTile, delta: number) => void
  /**
   * Called when a dragged tile is let go: `outside` when the pointer left the scene (the tile
   * was dragged out), `distance` in pixels from where the drag started.
   */
  onDrop?: (tile: SceneTile, drop: { outside: boolean; distance: number }) => void
}

/** The CSS variable each tone is painted with (resolved at run time, so dark mode follows). */
export const TONE_VARIABLES: Record<TileTone, string> = {
  1: '--tile-1',
  2: '--tile-2',
  3: '--tile-3',
  4: '--tile-4',
  5: '--tile-5',
  6: '--tile-6',
  7: '--tile-7',
  8: '--tile-8',
  up: '--success',
  down: '--destructive',
  alert: '--destructive',
  warn: '--warning',
}

/** The same tones as SVG fills, for the flat fallback and the 2D tile motifs. */
export const TONE_FILLS: Record<TileTone, string> = {
  1: 'fill-tile-1',
  2: 'fill-tile-2',
  3: 'fill-tile-3',
  4: 'fill-tile-4',
  5: 'fill-tile-5',
  6: 'fill-tile-6',
  7: 'fill-tile-7',
  8: 'fill-tile-8',
  up: 'fill-success',
  down: 'fill-destructive',
  alert: 'fill-destructive',
  warn: 'fill-warning',
}

/** Small seeded generator, so a decorative mosaic is the same on every load. */
export function seeded(seed: number): () => number {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

/** A grey tone from a 0-1 intensity: 0 → softest (7), 1 → ink (1). */
export function greyTone(intensity: number): TileTone {
  const clamped = Math.min(1, Math.max(0, intensity))
  return (7 - Math.round(clamped * 6)) as TileTone
}
