import { useEffect, useRef } from 'react'
import { startTileEngine, type TileEngineProps, type TileEngineState } from './tileEngine'

/**
 * The canvas of a tile scene. three.js lives in `tileEngine`, started when
 * the canvas mounts and disposed when it unmounts; this component only hands
 * it the latest props.
 */
export default function TileCanvas(props: TileEngineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  // The engine reads the latest props without being torn down on every change.
  const state = useRef<TileEngineState>({ props, dirty: true })
  useEffect(() => {
    state.current.props = props
    state.current.dirty = true
  })

  useEffect(() => {
    const canvas = canvasRef.current
    state.current.tagLayer = tagRef.current
    return canvas ? startTileEngine(canvas, state.current) : undefined
  }, [])

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="block size-full" />
      {/* The tiles' tags, written by the engine; the same words are in the scene's label and on the page. */}
      <div ref={tagRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" />
    </>
  )
}
