/**
 * The one WebGL canvas of the app. Browsers cap the number of WebGL contexts a page may hold
 * (about 16, fewer on phones) and each one costs memory, so every tile scene is drawn by the
 * same context: this canvas is never put in the page, the shared renderer draws on it and
 * each scene copies its picture to its own 2D canvas (see `sharedRenderer.ts`).
 *
 * It lives here, outside the three.js chunk, because the first question — is there WebGL at
 * all? — is asked before three.js is loaded, and the context opened to answer it is the one
 * the renderer then uses: asking does not cost a second context.
 */
let glCanvas: HTMLCanvasElement | null | undefined

/** The shared WebGL 2 canvas, or `null` where WebGL 2 is not available (the scenes are then flat mosaics). */
export function sharedGlCanvas(): HTMLCanvasElement | null {
  if (glCanvas === undefined) {
    glCanvas = null
    if (typeof document !== 'undefined' && typeof window !== 'undefined' && 'WebGL2RenderingContext' in window) {
      try {
        const canvas = document.createElement('canvas')
        // Default attributes (alpha, antialias, premultiplied alpha): the ones the renderer asks for.
        if (canvas.getContext('webgl2')) glCanvas = canvas
      } catch {
        glCanvas = null
      }
    }
  }
  return glCanvas
}
