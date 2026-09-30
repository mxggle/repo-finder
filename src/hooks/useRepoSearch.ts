import { useQuery } from '@tanstack/react-query'
import { searchRepositories } from '../api/github'
import type { SearchState } from '../lib/searchState'

export function useRepoSearch(state: SearchState) {
  return useQuery({
    queryKey: ['repositories', state] as const,
    queryFn: ({ signal }) => searchRepositories(state, signal),
    enabled: state.q !== '',
    // Keep the previous page on screen while the next page or sort order loads,
    // but never show results for a different query under the new one.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1].q === state.q ? previous : undefined,
  })
}
