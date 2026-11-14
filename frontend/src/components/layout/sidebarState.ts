/** Whether the desktop sidebar is deployed or reduced to its icon rail, kept across pages and visits. */

const STORAGE_KEY = 'stocklock.sidebarOpen'

/** DOM id of the sidebar, for the collapse button's `aria-controls`. */
export const SIDEBAR_ID = 'menu-principal'

/** The stored state; deployed when nothing is stored or storage is unavailable. */
export function readSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Never throws: with storage blocked the choice lasts until the page changes. */
export function storeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open))
  } catch {
    // Storage blocked (private window, site data disabled).
  }
}
