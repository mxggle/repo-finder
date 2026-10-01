import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeSwitcher } from './ThemeSwitcher'
import { THEME_STORAGE_KEY } from './theme'

/** jsdom has no matchMedia; this stub lets a test flip the system colour scheme. */
function stubSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (next: boolean) => {
    dark = next
    listeners.forEach((listener) => listener())
  }
}

const theme = () => document.documentElement.dataset.theme

describe('ThemeSwitcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.theme
  })

  it('follows the system theme by default, including later changes', () => {
    const setSystemDark = stubSystemTheme(true)
    render(<ThemeSwitcher />)

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(theme()).toBe('dark')

    act(() => setSystemDark(false))
    expect(theme()).toBe('light')
  })

  it('lets light mode override a dark system theme and remembers it', async () => {
    const setSystemDark = stubSystemTheme(true)
    const user = userEvent.setup()
    const { unmount } = render(<ThemeSwitcher />)

    await user.click(screen.getByRole('radio', { name: 'Light' }))

    expect(theme()).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    act(() => setSystemDark(true))
    expect(theme()).toBe('light')

    unmount()
    render(<ThemeSwitcher />)
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  })

  it('returns to the system theme and forgets the saved choice', async () => {
    stubSystemTheme(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const user = userEvent.setup()
    render(<ThemeSwitcher />)
    expect(theme()).toBe('dark')

    await user.click(screen.getByRole('radio', { name: 'System' }))

    expect(theme()).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('ignores an unknown saved value', () => {
    stubSystemTheme(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    render(<ThemeSwitcher />)

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(theme()).toBe('light')
  })
})
