import * as THREE from 'three'
import { sharedGlCanvas } from './webglCanvas'

/**
 * One WebGLRenderer for every tile scene of the app, so a page never holds more than one
 * WebGL context however many scenes it shows.
 *
 * How: the renderer draws on a canvas that is not in the page (`webglCanvas.ts`). A scene
 * asks for its picture; it is rendered in the bottom-left corner of that canvas, at the
 * scene's size, and copied at once to the scene's own 2D canvas with `drawImage`. Each scene
 * therefore keeps a real element in the layout — its own stacking, scrolling, clipping and
 * pointer events, exactly as before — which a single full-page overlay canvas would not give
 * (it lags behind the scroll and passes over cards, menus and dialogs).
 *
 * The drawing buffer only grows, to the largest scene seen, and is given back a moment after
 * the last scene has gone.
 */

const MAX_PIXEL_RATIO = 2
/** The buffer grows by steps, so resizing a window does not reallocate it at every pixel. */
const BUFFER_STEP = 64
/** How long the buffer is kept once no scene is left (a page change brings new scenes at once). */
const IDLE_MS = 4000

export interface SharedRenderer {
  /** Renders `scene` at `width` × `height` CSS pixels and copies it to `target`'s canvas (resized to match). */
  draw: (scene: THREE.Scene, camera: THREE.Camera, target: CanvasRenderingContext2D, width: number, height: number) => void
  /** To call once when the scene stops using the renderer. */
  release: () => void
}

let renderer: THREE.WebGLRenderer | null = null
let bufferWidth = 0
let bufferHeight = 0
let users = 0
let idleTimer = 0
/** Called when the context comes back after being lost: every scene draws itself again. */
const redraws = new Set<() => void>()

function draw(scene: THREE.Scene, camera: THREE.Camera, target: CanvasRenderingContext2D, width: number, height: number): void {
  if (!renderer || width <= 0 || height <= 0 || renderer.getContext().isContextLost()) return
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
  if (width + 1 > bufferWidth || height + 1 > bufferHeight) {
    bufferWidth = Math.max(bufferWidth, Math.ceil((width + 1) / BUFFER_STEP) * BUFFER_STEP)
    bufferHeight = Math.max(bufferHeight, Math.ceil((height + 1) / BUFFER_STEP) * BUFFER_STEP)
    renderer.setSize(bufferWidth, bufferHeight, false)
  }
  // The same rounding as three.js applies to its viewport.
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  const canvas = target.canvas
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  renderer.setViewport(0, 0, width, height)
  renderer.setScissor(0, 0, width, height)
  renderer.setScissorTest(true)
  renderer.render(scene, camera)
  // Copied in the same task as the render: the drawing buffer is still intact.
  const source = renderer.domElement
  target.clearRect(0, 0, pixelWidth, pixelHeight)
  target.drawImage(source, 0, source.height - pixelHeight, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight)
}

/** Gives the buffer's memory back; the context itself stays, ready for the next scene. */
function shrink(): void {
  idleTimer = 0
  if (!renderer || users > 0) return
  renderer.renderLists.dispose()
  renderer.setSize(1, 1, false)
  bufferWidth = 0
  bufferHeight = 0
}

/**
 * The shared renderer, for one more scene; `null` without WebGL 2. `onRestored` is called if the
 * context was lost and has come back: the scene must draw itself again.
 */
export function acquireRenderer(onRestored: () => void): SharedRenderer | null {
  if (!renderer) {
    const canvas = sharedGlCanvas()
    if (!canvas) return null
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    } catch {
      return null
    }
    // A lost context (GPU reset, tab kept long in the background) is restored by the browser when it
    // can: three.js sets itself up again, then every scene on the page redraws.
    canvas.addEventListener('webglcontextlost', (event) => event.preventDefault())
    canvas.addEventListener('webglcontextrestored', () => redraws.forEach((redraw) => redraw()))
  }
  users++
  window.clearTimeout(idleTimer)
  idleTimer = 0
  redraws.add(onRestored)
  let released = false
  return {
    draw,
    release: () => {
      if (released) return
      released = true
      redraws.delete(onRestored)
      users--
      if (users === 0) idleTimer = window.setTimeout(shrink, IDLE_MS)
    },
  }
}
