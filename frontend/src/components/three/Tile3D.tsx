import { lazy, Suspense, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'
import { TileFlat } from './TileFlat'
import type { SceneTile, TileSceneProps } from './tileModel'

// three.js stays out of the main bundle: it loads with the first scene drawn.
const TileCanvas = lazy(() => import('./TileCanvas'))

let webglSupport: boolean | undefined

/** Checked once: no WebGL (old browser, test environment) means the flat mosaic. */
function supportsWebGL(): boolean {
  if (webglSupport === undefined) {
    webglSupport = false
    if (typeof window !== 'undefined' && 'WebGLRenderingContext' in window) {
      try {
        const canvas = document.createElement('canvas')
        webglSupport = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
      } catch {
        webglSupport = false
      }
    }
  }
  return webglSupport
}

interface Tile3DProps extends Omit<TileSceneProps, 'onHover'> {
  /** What the scene shows, in a sentence: its accessible equivalent. */
  label: string
  /** Sizes the scene (`h-64 w-full`…). */
  className?: string
  /** Shows the pointed tile's label under the scene (default true). */
  caption?: boolean
}

/**
 * A scene of 3D tiles. Describe the tiles; this draws them with three.js
 * (lazy-loaded), falls back to a flat mosaic without WebGL, and draws one
 * still frame when the visitor asked for less motion. The scene is an image
 * for assistive technology: `label` says what it shows, and the same
 * information must exist as text on the page.
 */
export function Tile3D({ label, className, caption = true, ...scene }: Tile3DProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [hovered, setHovered] = useState<SceneTile | null>(null)
  const flat = <TileFlat tiles={scene.tiles} />

  return (
    <figure className="m-0">
      <div role="img" aria-label={label} className={cn('relative w-full overflow-hidden', className)}>
        {supportsWebGL() ? (
          <Suspense fallback={flat}>
            <TileCanvas {...scene} reducedMotion={reducedMotion} onHover={setHovered} />
          </Suspense>
        ) : (
          flat
        )}
      </div>
      {caption && (
        <figcaption aria-hidden="true" className="eyebrow mt-2 h-4 truncate">
          {hovered?.label ?? ''}
        </figcaption>
      )}
    </figure>
  )
}
