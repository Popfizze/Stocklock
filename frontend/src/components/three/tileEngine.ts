import * as THREE from 'three'
import { acquireRenderer } from './sharedRenderer'
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
  /** The layer above the canvas where the engine writes the tiles' tags. */
  tagLayer?: HTMLElement | null
}

/** Under this width a scene is narrow: tiles write their `tagShort`. */
const COMPACT_PX = 480

const TAG_CLASS =
  'pointer-events-none absolute top-0 left-0 rounded-sm bg-background/80 px-1 text-center text-[10px] leading-3 font-medium whitespace-pre text-foreground tabular-nums'

/**
 * Starts a tile scene on `canvas`: one instanced mesh of boxes on an orthographic
 * camera fitted to the tiles, drawn by the app's shared WebGL renderer and copied
 * to this 2D canvas (one WebGL context for all the scenes, see `sharedRenderer.ts`).
 * It runs only while the canvas is on screen and the tab is visible; with reduced
 * motion it draws a single still frame. Returns the function that stops it and
 * disposes everything it created.
 */
export function startTileEngine(canvas: HTMLCanvasElement, state: TileEngineState): () => void {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probe) return () => {}
  const surface = canvas.getContext('2d')
  if (!surface) return () => {}
  // After a lost context comes back, the scene is painted again.
  const renderer = acquireRenderer(() => {
    state.dirty = true
    schedule()
  })
  if (!renderer) return () => {}

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
  // Where each identified tile currently stands: a tile that changes place glides there.
  const places = new Map<string, { x: number; z: number }>()
  let lastFrame = performance.now()
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
    const glide = reducedMotion ? 1 : 1 - Math.exp(-Math.min(0.1, (now - lastFrame) / 1000) * 9)
    lastFrame = now
    // Only the first tile of an id glides: stacked tiles may share their column's id.
    const gliding = new Set<string>()
    tiles.forEach((tile, index) => {
      const grown = reducedMotion || motion === 'none' ? 1 : ease(clamp01((elapsed - index * stagger) / GROW_S))
      if (grown < 1) moving = true
      const wave = motion === 'wave' && !reducedMotion ? Math.sin(time * 0.9 + tile.x * 0.55 + tile.z * 0.4) * 0.07 : 0
      const h = tile.h * grown + (tile.h >= 0 ? wave : -wave)
      const size = Math.max(Math.abs(h), 0.03)
      let x = tile.x
      let z = tile.z
      if (tile.id !== undefined && (tile.y ?? 0) === 0 && !gliding.has(tile.id)) {
        gliding.add(tile.id)
        const place = places.get(tile.id)
        if (place) {
          place.x += (tile.x - place.x) * glide
          place.z += (tile.z - place.z) * glide
          if (Math.abs(tile.x - place.x) + Math.abs(tile.z - place.z) > 0.004) moving = true
          x = place.x
          z = place.z
        } else {
          places.set(tile.id, { x, z })
        }
      }
      P.set(x, (tile.y ?? 0) + (h >= 0 ? size / 2 : -size / 2), z)
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

  // Tags: one small text per tagged tile, kept on its tile as it grows or moves. A tag that would
  // cover an earlier one is hidden rather than piled up.
  const tagNodes: HTMLSpanElement[] = []
  const tagSizes = new Map<string, [number, number]>()
  const placeTags = () => {
    const layer = state.tagLayer
    if (!layer || !mesh || width === 0 || height === 0) return
    let used = 0
    const taken: Array<[number, number, number, number]> = []
    const { tiles } = state.props
    // Tags marked `tagFirst` are placed first: they are the ones kept where tags would overlap.
    const order = tiles.map((_, index) => index).filter((index) => tiles[index].tag)
    order.sort((a, b) => Number(Boolean(tiles[b].tagFirst)) - Number(Boolean(tiles[a].tagFirst)) || a - b)
    order.forEach((index) => {
      const tile = tiles[index]
      if (!tile.tag || !mesh) return
      let node = tagNodes[used]
      if (!node) {
        node = document.createElement('span')
        node.className = TAG_CLASS
        layer.appendChild(node)
        tagNodes.push(node)
      }
      used++
      // On a narrow scene (a phone), a tile's shorter tag is written when it has one.
      const text = width < COMPACT_PX && tile.tagShort ? tile.tagShort : tile.tag
      if (node.textContent !== text) node.textContent = text
      let size = tagSizes.get(text)
      if (!size) {
        size = [node.offsetWidth, node.offsetHeight]
        tagSizes.set(text, size)
      }
      mesh.getMatrixAt(index, M)
      P.setFromMatrixPosition(M)
      S.setFromMatrixScale(M)
      const below = tile.tagAt === 'base'
      corner.set(P.x, below ? P.y - S.y / 2 : P.y + S.y / 2, below ? P.z + S.z / 2 : P.z).project(camera)
      const [w, h] = size
      const left = Math.min(Math.max(0, (corner.x * 0.5 + 0.5) * width - w / 2), Math.max(0, width - w))
      const top = Math.min(Math.max(0, (-corner.y * 0.5 + 0.5) * height + (below ? 4 : -h - 4)), Math.max(0, height - h))
      const hit = taken.some(([l, t, r, b]) => left < r + 2 && left + w + 2 > l && top < b + 1 && top + h + 1 > t)
      node.style.visibility = hit ? 'hidden' : 'visible'
      if (hit) return
      taken.push([left, top, left + w, top + h])
      node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    })
    for (let i = used; i < tagNodes.length; i++) tagNodes[i].style.visibility = 'hidden'
  }

  const tick = (now: number) => {
    frame = 0
    if (!visible || document.hidden) return
    if (state.dirty) {
      state.dirty = false
      build()
    }
    const moving = place(now)
    renderer.draw(scene, camera, surface, width, height)
    placeTags()
    if (moving) frame = requestAnimationFrame(tick)
  }
  function schedule() {
    if (frame === 0) frame = requestAnimationFrame(tick)
  }

  const resize = () => {
    const parent = canvas.parentElement
    if (!parent) return
    width = parent.clientWidth
    height = parent.clientHeight
    if (width === 0 || height === 0) return
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
  // Light ↔ dark: the tokens changed, so the tiles are painted again.
  const theme = new MutationObserver(() => {
    colors.clear()
    state.dirty = true
    schedule()
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  // Props changed: redraw on the next frame.
  const poll = window.setInterval(() => {
    // Off-screen or in a hidden tab, the change waits: it is drawn when the scene comes back.
    if (state.dirty && visible && !document.hidden) schedule()
  }, 120)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const pick = (event: { clientX: number; clientY: number }): SceneTile | null => {
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
  let downX = 0
  let downY = 0
  const onDown = (event: PointerEvent) => {
    const tile = state.props.onAdjust || state.props.onDrop ? pick(event) : null
    if (!tile?.id) return
    dragged = tile.id
    lastY = event.clientY
    downX = event.clientX
    downY = event.clientY
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
    const tile = state.props.tiles.find((candidate) => candidate.id === dragged)
    dragged = null
    canvas.classList.remove('cursor-grabbing')
    if (tile) {
      const rect = canvas.getBoundingClientRect()
      let side: 'top' | 'bottom' | 'left' | 'right' | null = null
      if (event.clientX < rect.left) side = 'left'
      else if (event.clientX > rect.right) side = 'right'
      else if (event.clientY > rect.bottom) side = 'bottom'
      else if (event.clientY < rect.top) side = 'top'
      const outside = side !== null
      const distance = Math.hypot(event.clientX - downX, event.clientY - downY)
      if (distance > 4) didDrag = true
      state.props.onDrop?.(tile, { outside, side, distance })
    }
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
  // On a touch screen the page keeps scrolling from the scene, except when the finger lands on a
  // tile that can be dragged: only then is the gesture kept for the drag.
  const onTouchStart = (event: TouchEvent) => {
    if (!state.props.onAdjust && !state.props.onDrop) return
    const touch = event.touches[0]
    if (touch && pick(touch)?.id !== undefined) event.preventDefault()
  }
  canvas.addEventListener('touchstart', onTouchStart, { passive: false })
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
    theme.disconnect()
    for (const node of tagNodes) node.remove()
    canvas.removeEventListener('touchstart', onTouchStart)
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
    renderer.release()
  }
}
