import { SORT_OPTIONS, type SearchState, type SortKey } from '../searchState'

export type SearchHistoryEntry = {
  q: string
  sort: SortKey
  lastSearchedAt: number
}

export const SEARCH_HISTORY_KEY = 'repo-finder:search-history'
export const SEARCH_HISTORY_LIMIT = 10
export const SEARCH_HISTORY_QUERY_LIMIT = 4096
const STORED_HISTORY_LIMIT = 65_536
const HISTORY_VERSION = 1

function validQuery(q: unknown): q is string {
  return typeof q === 'string' && q.length <= SEARCH_HISTORY_QUERY_LIMIT && q.trim().length > 0
}

function validSort(sort: unknown): sort is SortKey {
  return SORT_OPTIONS.some((option) => option.value === sort)
}

function sameSearch(a: Pick<SearchHistoryEntry, 'q' | 'sort'>, b: Pick<SearchHistoryEntry, 'q' | 'sort'>) {
  return a.q === b.q && a.sort === b.sort
}

function serialize(entries: SearchHistoryEntry[]) {
  return JSON.stringify({ version: HISTORY_VERSION, entries })
}

/** Untrusted storage is bounded and versioned; invalid snapshots start empty. */
export function parseSearchHistory(raw: string | null): SearchHistoryEntry[] {
  if (!raw || raw.length > STORED_HISTORY_LIMIT) return []
  try {
    const stored: unknown = JSON.parse(raw)
    if (!stored || typeof stored !== 'object' || !('version' in stored) || stored.version !== HISTORY_VERSION) return []
    if (!('entries' in stored) || !Array.isArray(stored.entries) || stored.entries.length > SEARCH_HISTORY_LIMIT) return []

    const entries: SearchHistoryEntry[] = []
    for (const value of stored.entries) {
      if (!value || typeof value !== 'object') return []
      const { q, sort, lastSearchedAt } = value
      if (!validQuery(q) || !validSort(sort) || !Number.isSafeInteger(lastSearchedAt) || lastSearchedAt < 0) return []
      entries.push({ q: q.trim(), sort, lastSearchedAt })
    }
    return entries
      .sort((a, b) => b.lastSearchedAt - a.lastSearchedAt)
      .filter((entry, index, sorted) => sorted.findIndex((candidate) => sameSearch(candidate, entry)) === index)
  } catch {
    return []
  }
}

export function readSearchHistory(): SearchHistoryEntry[] {
  try {
    return parseSearchHistory(window.localStorage.getItem(SEARCH_HISTORY_KEY))
  } catch {
    return []
  }
}

/** Storage failures must not prevent this session's searches or history controls. */
export function writeSearchHistory(entries: SearchHistoryEntry[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(SEARCH_HISTORY_KEY)
    else window.localStorage.setItem(SEARCH_HISTORY_KEY, serialize(entries))
  } catch {
    // The hook keeps its in-memory history when storage is blocked or full.
  }
}

export function recordSearchHistory(
  entries: SearchHistoryEntry[],
  state: SearchState,
  lastSearchedAt: number,
): SearchHistoryEntry[] {
  if (!validQuery(state.q) || !validSort(state.sort)) return entries
  const entry: SearchHistoryEntry = { q: state.q.trim(), sort: state.sort, lastSearchedAt }
  const next = [entry, ...entries.filter((candidate) => !sameSearch(candidate, entry))].slice(0, SEARCH_HISTORY_LIMIT)
  // Escaped characters can cost six stored characters each; retain newest queries
  // whole rather than persisting a snapshot that our reader would reject.
  while (serialize(next).length > STORED_HISTORY_LIMIT) next.pop()
  return next
}

export function removeSearchHistory(entries: SearchHistoryEntry[], entry: SearchHistoryEntry): SearchHistoryEntry[] {
  return entries.filter((candidate) => !sameSearch(candidate, entry))
}
