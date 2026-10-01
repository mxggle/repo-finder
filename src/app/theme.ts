import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

// index.html repeats this key and the resolution below so the theme applies before first paint.
export const THEME_STORAGE_KEY = 'repo-finder:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
    return 'system'
  }
}

function writePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // The choice still applies for this visit.
  }
}

function systemPrefersDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

/** Sets the resolved theme on <html>; `styles/tokens.css` switches tokens on `data-theme`. */
function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

/**
 * The visitor's theme preference. "system" follows the operating system and
 * tracks changes to it; an explicit light or dark choice is remembered.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState(readPreference)

  useEffect(() => {
    applyTheme(preference)
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    writePreference(next)
    setPreferenceState(next)
  }, [])

  return [preference, setPreference] as const
}
