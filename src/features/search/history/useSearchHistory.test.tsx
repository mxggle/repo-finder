import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEARCH_HISTORY_KEY } from './historyStore'
import { useSearchHistory } from './useSearchHistory'

const state = (q: string) => ({ q, sort: 'best-match' as const, page: 1 })
const stored = (q: string) => JSON.stringify({ version: 1, entries: [{ q, sort: 'stars', lastSearchedAt: 100 }] })

afterEach(() => vi.restoreAllMocks())

describe('useSearchHistory', () => {
  it('persists searches across remounts, removes entries, and clears only its own key', () => {
    window.localStorage.setItem('another-feature', 'keep me')
    const first = renderHook(useSearchHistory)
    act(() => first.result.current.record(state('react')))
    act(() => first.result.current.record(state('vue')))
    expect(JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY)!)).toMatchObject({
      version: 1, entries: [{ q: 'vue' }, { q: 'react' }],
    })
    first.unmount()

    const second = renderHook(useSearchHistory)
    expect(second.result.current.entries.map(({ q }) => q)).toEqual(['vue', 'react'])
    act(() => second.result.current.remove(second.result.current.entries[0]))
    expect(second.result.current.entries.map(({ q }) => q)).toEqual(['react'])
    expect(JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY)!).entries).toHaveLength(1)
    act(() => second.result.current.clear())
    expect(second.result.current.entries).toEqual([])
    expect(window.localStorage.getItem(SEARCH_HISTORY_KEY)).toBeNull()
    expect(window.localStorage.getItem('another-feature')).toBe('keep me')
  })

  it('keeps stable callbacks and serializes rapid actions without losing entries', () => {
    const { result, rerender } = renderHook(useSearchHistory, { wrapper: StrictMode })
    const { record, remove, clear } = result.current
    act(() => {
      record(state('react'))
      record(state('vue'))
      record(state('react'))
    })
    rerender()
    expect(result.current.entries.map(({ q }) => q)).toEqual(['react', 'vue'])
    expect(result.current.record).toBe(record)
    expect(result.current.remove).toBe(remove)
    expect(result.current.clear).toBe(clear)
  })

  it('recovers from corrupt storage on the next recorded search', () => {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, 'corrupt')
    const { result } = renderHook(useSearchHistory)
    expect(result.current.entries).toEqual([])
    act(() => result.current.record(state('react')))
    expect(JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY)!).entries[0].q).toBe('react')
  })

  it('keeps history usable in memory when writes fail because storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    const { result } = renderHook(useSearchHistory)
    act(() => result.current.record(state('react')))
    act(() => result.current.record(state('vue')))
    expect(result.current.entries.map(({ q }) => q)).toEqual(['vue', 'react'])
    act(() => result.current.remove(result.current.entries[0]))
    expect(result.current.entries[0].q).toBe('react')
    act(() => result.current.clear())
    expect(result.current.entries).toEqual([])
  })

  it('works when accessing localStorage throws and when deleting from it fails', () => {
    const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    try {
      const { result } = renderHook(useSearchHistory)
      act(() => result.current.record(state('react')))
      expect(result.current.entries[0].q).toBe('react')
      act(() => result.current.clear())
      expect(result.current.entries).toEqual([])
    } finally {
      blocked.mockRestore()
    }
  })

  it('receives other-tab updates and clears without writing them back', () => {
    const { result } = renderHook(useSearchHistory)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: SEARCH_HISTORY_KEY, newValue: stored('rust'), storageArea: window.localStorage,
    })))
    expect(result.current.entries).toEqual([{ q: 'rust', sort: 'stars', lastSearchedAt: 100 }])
    expect(setItem).not.toHaveBeenCalled()
    act(() => result.current.record(state('react')))
    expect(result.current.entries.map(({ q }) => q)).toEqual(['react', 'rust'])
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SEARCH_HISTORY_KEY, newValue: null })))
    expect(result.current.entries).toEqual([])
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SEARCH_HISTORY_KEY, newValue: stored('vue') })))
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
    expect(result.current.entries).toEqual([])
  })

  it('ignores other keys and sessionStorage, rejects corrupt updates, and removes its listener on unmount', () => {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, stored('react'))
    const { result, unmount } = renderHook(useSearchHistory)
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: stored('vue') })))
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: SEARCH_HISTORY_KEY, newValue: stored('vue'), storageArea: window.sessionStorage,
    })))
    expect(result.current.entries[0].q).toBe('react')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SEARCH_HISTORY_KEY, newValue: 'invalid' })))
    expect(result.current.entries).toEqual([])
    const removeListener = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(removeListener).toHaveBeenCalledWith('storage', expect.any(Function))
  })
})
