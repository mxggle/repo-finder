export const PER_PAGE = 20
/** The Search API only ever returns the first 1,000 matches of a query. */
export const MAX_ACCESSIBLE_RESULTS = 1000
export const MAX_PAGE = Math.ceil(MAX_ACCESSIBLE_RESULTS / PER_PAGE)

export const SORT_OPTIONS = [
  { value: 'best-match', label: 'Best match' },
  { value: 'stars', label: 'Most stars' },
  { value: 'forks', label: 'Most forks' },
  { value: 'updated', label: 'Recently updated' },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]['value']

export type SearchState = {
  q: string
  sort: SortKey
  page: number
}

export const EMPTY_SEARCH: SearchState = { q: '', sort: 'best-match', page: 1 }

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
}

/** Reads search state from a URL query string, falling back to safe defaults. */
export function parseSearchState(search: string): SearchState {
  const params = new URLSearchParams(search)
  const q = (params.get('q') ?? '').trim()
  const sortParam = params.get('sort')
  const sort = isSortKey(sortParam) ? sortParam : 'best-match'

  const pageParam = params.get('page')
  const page = pageParam !== null && /^\d+$/.test(pageParam) ? Number(pageParam) : 1

  if (!q) return EMPTY_SEARCH
  return { q, sort, page: Math.min(Math.max(page, 1), MAX_PAGE) }
}

/** Serialises search state to a query string, omitting default values. */
export function toQueryString({ q, sort, page }: SearchState): string {
  if (!q) return ''
  const params = new URLSearchParams({ q })
  if (sort !== 'best-match') params.set('sort', sort)
  if (page > 1) params.set('page', String(page))
  return `?${params}`
}

/** Number of pages the user can actually reach for a result total. */
export function lastPageFor(totalCount: number): number {
  const reachable = Math.min(totalCount, MAX_ACCESSIBLE_RESULTS)
  return Math.max(1, Math.ceil(reachable / PER_PAGE))
}
