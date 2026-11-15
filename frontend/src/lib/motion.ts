/**
 * Animations: on by default — the 3D scenes and the entrances are what this app shows — and
 * reduced only when the visitor says so here, with the switch in the sidebar. The system's
 * « reduce motion » setting does not switch them off on its own: on many Windows machines it
 * is set without the user knowing, and the app would only ever show still frames.
 *
 * The choice is `data-motion="reduced"` on `<html>`: the CSS entrances, Tailwind's
 * `motion-reduce:` / `motion-safe:` variants (see index.css) and the 3D engine all follow it.
 */

export type Motion = 'full' | 'reduced'

const STORAGE_KEY = 'stocklock.motion'
const listeners = new Set<() => void>()

/** The visitor's choice; full motion when nothing is stored or storage is unavailable. */
export function currentMotion(): Motion {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'reduced' ? 'reduced' : 'full'
  } catch {
    return 'full'
  }
}

/** Puts the choice on the page. Called once before the first render, then on every change. */
export function applyMotion(motion: Motion = currentMotion()): void {
  if (motion === 'reduced') document.documentElement.dataset.motion = 'reduced'
  else delete document.documentElement.dataset.motion
}

/** Applies and remembers the visitor's choice, and tells the scenes on screen. Never throws. */
export function chooseMotion(motion: Motion): void {
  try {
    if (motion === 'reduced') window.localStorage.setItem(STORAGE_KEY, motion)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
  applyMotion(motion)
  listeners.forEach((listener) => listener())
}

/** Whether motion is reduced right now (what is on the page, so it also holds with storage blocked). */
export function isMotionReduced(): boolean {
  return document.documentElement.dataset.motion === 'reduced'
}

export function subscribeMotion(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
