/**
 * Light or dark: the visitor's own choice when they made one (kept in localStorage), else the
 * system's. The theme is the `.dark` class on `<html>`; every colour follows from the tokens.
 */

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'stocklock.theme'

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** The theme in force: the stored choice, else the system's. */
export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

/** Puts the theme on the page. Called once before the first render, then on every change. */
export function applyTheme(theme: Theme = currentTheme()): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/** Applies and remembers the visitor's choice. Never throws. */
export function chooseTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
}
