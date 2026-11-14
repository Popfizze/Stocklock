import * as THREE from 'three'
import { TONE_VARIABLES, type SceneTile, type TileSceneProps, type TileTone } from './tileModel'

/** Seconds a tile takes to grow, and the delay between two tiles. */
const GROW_S = 0.7
const STAGGER_S = 0.012
const MAX_STAGGER_S = 0.9
/** Share of its cell a tile fills: the gap is the mosaic's white joint. */
const FILL = 0.9
const FLOW_SIZE = 0.24
const VIEW_DIRECTIONS = {
  iso: [1, 0.95, 1],
  front: [0.25, 0.55, 1],
  top: [0.15, 1.6, 0.6],
} as const

/** A token's colour as three.js wants it: painted on a 1 px canvas, so any CSS colour syntax works. */
function tokenColor(context: CanvasRenderingContext2D, variable: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = value || 'gray'
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}

const ease = (q: number) => q * q * (3 - 2 * q)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export interface TileEngineProps extends TileSceneProps {
  reducedMotion: boolean
}

/** What the component shares with the running engine: the latest props, and whether they changed. */
export interface TileEngineState {
  props: TileEngineProps
  dirty: boolean
}

/**
 * Starts the three.js renderer of a tile scene on `canvas`: one instanced mesh
 * of boxes on an orthographic camera fitted to the tiles. It runs only while
 * the canvas is on screen and the tab is visible; with reduced motion it draws
 * a single still frame. Returns the function that stops it and disposes
 * everything it created.
 */
export function startTileEngine(canvas: HTMLCanvasElement, state: TileEngineState): () => void {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probe) return () => {}
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return () => {}
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 2.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.5)
  sun.position.set(-3, 6, 4)
  scene.add(sun)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)

  const box = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff })
  let mesh: THREE.InstancedMesh | null = null
  let capacity = 0
  const planeGeometry = new THREE.PlaneGeometry(1, 1)
  const planeMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
  const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
  planeMesh.rotation.x = -Math.PI / 2
  planeMesh.visible = false
  scene.add(planeMesh)

  const colors = new Map<TileTone, THREE.Color>()
  const colorOf = (tone: TileTone) => {
    let color = colors.get(tone)
    if (!color) {
      color = tokenColor(probe, TONE_VARIABLES[tone])
      colors.set(tone, color)
    }
    return color
  }

  const P = new THREE.Vector3()
  const S = new THREE.Vector3()
  const Q = new THREE.Quaternion()
  const M = new THREE.Matrix4()
  const bounds = new THREE.Box3()
  const corner = new THREE.Vector3()
  let started = performance.now()
  let builtFor: SceneTile[] | null = null
  let frame = 0
  let visible = true
  let width = 0
  let height = 0

  /** (Re)allocates the mesh, paints the instances and frames the camera on the tiles. */
  const build = () => {
    const { tiles, flows = [], plane, view = 'iso' } = state.props
    const flowCount = flows.reduce((sum, flow) => sum + (flow.count ?? 3), 0)
    const needed = Math.max(1, tiles.length + flowCount)
    if (!mesh || needed > capacity) {
      if (mesh) {
        scene.remove(mesh)
        mesh.dispose()
      }
      capacity = needed
      mesh = new THREE.InstancedMesh(box, material, capacity)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(mesh)
    }
    mesh.count = tiles.length + flowCount
    tiles.forEach((tile, index) => mesh?.setColorAt(index, colorOf(tile.tone)))
    let cursor = tiles.length
    for (const flow of flows) {
      for (let j = 0; j < (flow.count ?? 3); j++) mesh.setColorAt(cursor++, colorOf(flow.tone ?? 3))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    bounds.makeEmpty()
    for (const tile of tiles) {
      const base = tile.y ?? 0
      const halfW = (tile.w ?? 1) / 2
      const halfD = (tile.d ?? 1) / 2
      bounds.expandByPoint(corner.set(tile.x - halfW, Math.min(base, base + tile.h), tile.z - halfD))
      bounds.expandByPoint(corner.set(tile.x + halfW, Math.max(base, base + tile.h), tile.z + halfD))
    }
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1))
    if (plane) {
      bounds.expandByPoint(corner.set(bounds.min.x, plane.y, bounds.min.z))
      planeMesh.visible = true
      planeMesh.position.set((bounds.min.x + bounds.max.x) / 2, plane.y, (bounds.min.z + bounds.max.z) / 2)
      planeMesh.scale.set(bounds.max.x - bounds.min.x + 1, bounds.max.z - bounds.min.z + 1, 1)
      planeMaterial.color.copy(colorOf(1))
    } else {
      planeMesh.visible = false
    }

    // Orthographic camera looking at the centre; its frustum is the tiles' extent seen from there.
    const center = bounds.getCenter(new THREE.Vector3())
    const direction = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize()
    camera.position.copy(center).addScaledVector(direction, 120)
    camera.lookAt(center)
    camera.updateMatrixWorld()
    const inverse = camera.matrixWorldInverse
    let maxX = 0.5
    let maxY = 0.5
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z)
      corner.applyMatrix4(inverse)
      maxX = Math.max(maxX, Math.abs(corner.x))
      maxY = Math.max(maxY, Math.abs(corner.y))
    }
    const aspect = width > 0 && height > 0 ? width / height : 1
    const halfHeight = Math.max(maxY, maxX / aspect) * 1.08
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.updateProjectionMatrix()

    // New tiles grow again; the same tiles with new values glide without restarting.
    if (builtFor === null || builtFor.length !== tiles.length) started = performance.now()
    builtFor = tiles
  }

  /** Places every instance for this instant; returns whether something is still moving. */
  const place = (now: number): boolean => {
    const { tiles, flows = [], motion = 'rise', reducedMotion } = state.props
    if (!mesh) return false
    const elapsed = (now - started) / 1000
    const time = now / 1000
    const stagger = Math.min(STAGGER_S, MAX_STAGGER_S / Math.max(1, tiles.length))
    let moving = false
    tiles.forEach((tile, index) => {
      const grown = reducedMotion || motion === 'none' ? 1 : ease(clamp01((elapsed - index * stagger) / GROW_S))
      if (grown < 1) moving = true
      const wave = motion === 'wave' && !reducedMotion ? Math.sin(time * 0.9 + tile.x * 0.55 + tile.z * 0.4) * 0.07 : 0
      const h = tile.h * grown + (tile.h >= 0 ? wave : -wave)
      const size = Math.max(Math.abs(h), 0.03)
      P.set(tile.x, (tile.y ?? 0) + (h >= 0 ? size / 2 : -size / 2), tile.z)
      S.set((tile.w ?? 1) * FILL, size, (tile.d ?? 1) * FILL)
      mesh?.setMatrixAt(index, M.compose(P, Q, S))
    })
    let cursor = tiles.length
    for (const flow of flows) {
      const count = flow.count ?? 3
      for (let j = 0; j < count; j++) {
        const progress = reducedMotion ? (j + 0.5) / count : (time * 0.35 + j / count) % 1
        P.set(
          flow.from[0] + (flow.to[0] - flow.from[0]) * progress,
          0.35 + Math.sin(progress * Math.PI) * 0.7,
          flow.from[1] + (flow.to[1] - flow.from[1]) * progress,
        )
        mesh.setMatrixAt(cursor++, M.compose(P, Q, S.set(FLOW_SIZE, FLOW_SIZE, FLOW_SIZE)))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    const alive = !reducedMotion && (motion === 'wave' || flows.length > 0)
    return moving || alive
  }

  const tick = (now: number) => {
    frame = 0
    if (!visible || document.hidden) return
    if (state.dirty) {
      state.dirty = false
      build()
    }
    const moving = place(now)
    renderer.render(scene, camera)
    if (moving) frame = requestAnimationFrame(tick)
  }
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(tick)
  }

  const resize = () => {
    const parent = canvas.parentElement
    if (!parent) return
    width = parent.clientWidth
    height = parent.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    state.dirty = true
    schedule()
  }
  const resizeObserver = new ResizeObserver(resize)
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement)
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) schedule()
  })
  intersection.observe(canvas)
  const onVisibility = () => {
    if (!document.hidden) schedule()
  }
  document.addEventListener('visibilitychange', onVisibility)
  // Props changed: redraw on the next frame.
  const poll = window.setInterval(() => {
    if (state.dirty) schedule()
  }, 120)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pick = (event: PointerEvent | MouseEvent): SceneTile | null => {
    if (!mesh) return null
    const rect = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObject(mesh)[0]
    const index = hit?.instanceId
    return index !== undefined ? (state.props.tiles[index] ?? null) : null
  }
  let hovered: SceneTile | null = null
  // Dragging a tile up or down (when the scene allows it): the tile is tracked by id, since the
  // scene is rebuilt with new heights while the drag goes on.
  let dragged: string | null = null
  let lastY = 0
  let didDrag = false
  const onDown = (event: PointerEvent) => {
    const tile = state.props.onAdjust ? pick(event) : null
    if (!tile?.id) return
    dragged = tile.id
    lastY = event.clientY
    didDrag = false
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {
      // No capture (synthetic pointer): the drag still works while the pointer stays on the canvas.
    }
    canvas.classList.add('cursor-grabbing')
  }
  const onUp = (event: PointerEvent) => {
    if (dragged === null) return
    dragged = null
    canvas.classList.remove('cursor-grabbing')
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  const onMove = (event: PointerEvent) => {
    if (dragged !== null) {
      const tile = state.props.tiles.find((candidate) => candidate.id === dragged)
      const delta = ((lastY - event.clientY) * (camera.top - camera.bottom)) / Math.max(1, height)
      lastY = event.clientY
      if (tile && delta !== 0) {
        didDrag = true
        state.props.onAdjust?.(tile, delta)
      }
      return
    }
    const tile = pick(event)
    if (tile === hovered) return
    hovered = tile
    canvas.classList.toggle('cursor-pointer', tile !== null && state.props.onSelect !== undefined)
    canvas.classList.toggle('cursor-grab', tile !== null && state.props.onAdjust !== undefined)
    state.props.onHover?.(tile)
  }
  const onLeave = () => {
    hovered = null
    canvas.classList.remove('cursor-pointer')
    state.props.onHover?.(null)
  }
  const onClick = (event: MouseEvent) => {
    if (didDrag) {
      didDrag = false
      return
    }
    const tile = pick(event)
    if (tile) state.props.onSelect?.(tile)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onClick)

  resize()

  return () => {
    cancelAnimationFrame(frame)
    window.clearInterval(poll)
    resizeObserver.disconnect()
    intersection.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('click', onClick)
    mesh?.dispose()
    box.dispose()
    material.dispose()
    planeGeometry.dispose()
    planeMaterial.dispose()
    renderer.dispose()
  }
}
