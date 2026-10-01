import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { parseSearchState, toQueryString, type SearchState } from './searchState'

const URL_CHANGE = 'repo-finder:urlchange'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(URL_CHANGE, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(URL_CHANGE, onChange)
  }
}

const getSearch = () => window.location.search

function writeUrl(search: string, mode: 'push' | 'replace') {
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
  window.dispatchEvent(new Event(URL_CHANGE))
}

/**
 * The URL query string is the single source of truth for the search, so
 * results are shareable and the browser's back/forward buttons work.
 */
export function useSearchState() {
  const search = useSyncExternalStore(subscribe, getSearch)
  const state = useMemo(() => parseSearchState(search), [search])
  const canonical = toQueryString(state)

  // Rewrite hand-edited or out-of-range URLs (e.g. ?page=abc) to what is shown.
  useEffect(() => {
    if (search !== canonical) writeUrl(canonical, 'replace')
  }, [search, canonical])

  const navigate = useCallback((next: SearchState) => {
    const target = toQueryString(next)
    if (target !== window.location.search) writeUrl(target, 'push')
  }, [])

  return [state, navigate] as const
}
