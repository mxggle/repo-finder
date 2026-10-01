import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchState } from '../searchState'
import {
  SEARCH_HISTORY_KEY,
  parseSearchHistory,
  readSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
  writeSearchHistory,
  type SearchHistoryEntry,
} from './historyStore'

export function useSearchHistory() {
  const [entries, setEntries] = useState(readSearchHistory)
  const current = useRef(entries)

  const update = useCallback((next: SearchHistoryEntry[]) => {
    current.current = next
    setEntries(next)
    writeSearchHistory(next)
  }, [])

  const record = useCallback((state: SearchState) => {
    const next = recordSearchHistory(current.current, state, Date.now())
    if (next !== current.current) update(next)
  }, [update])

  const remove = useCallback((entry: SearchHistoryEntry) => {
    update(removeSearchHistory(current.current, entry))
  }, [update])

  const clear = useCallback(() => update([]), [update])

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== SEARCH_HISTORY_KEY && event.key !== null) return
      // Ignore sessionStorage events, which share the same browser event type.
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return
      } catch {
        return
      }
      const next = parseSearchHistory(event.key === null ? null : event.newValue)
      current.current = next
      setEntries(next)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return { entries, record, remove, clear }
}
