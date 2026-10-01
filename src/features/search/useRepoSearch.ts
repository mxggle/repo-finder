import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GitHubApiError } from '../../domain/repository'
import { searchRepositories } from './github'
import type { SearchState } from './searchState'
import { PER_PAGE } from './searchState'
import { readSearchCache, writeSearchCache } from './searchCache'

export function useRepoSearch(state: SearchState) {
  const queryClient = useQueryClient()
  const normalizedState = useMemo(
    () => ({ q: state.q.trim(), sort: state.sort, page: state.page }),
    [state.q, state.sort, state.page],
  )
  const cached = useMemo(
    () => queryClient.getQueryData(['repositories', normalizedState]) === undefined
      ? readSearchCache(normalizedState)
      : undefined,
    [queryClient, normalizedState],
  )
  return useQuery({
    queryKey: ['repositories', normalizedState] as const,
    queryFn: async ({ signal }) => {
      const result = await searchRepositories({ ...normalizedState, perPage: PER_PAGE }, signal)
      if (!signal.aborted) writeSearchCache(normalizedState, result)
      return result
    },
    initialData: cached,
    initialDataUpdatedAt: cached?.fetchedAt.getTime(),
    enabled: normalizedState.q !== '',
    retry: (failureCount, error) =>
      failureCount < 1 &&
      error instanceof GitHubApiError &&
      (error.kind === 'network' || error.kind === 'unavailable'),
    retryDelay: 2_000,
    // Keep the previous page on screen while the next page or sort order loads,
    // but never show results for a different query under the new one.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1].q === normalizedState.q ? previous : undefined,
  })
}
