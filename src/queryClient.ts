import { QueryClient } from '@tanstack/react-query'
import { GitHubApiError } from './api/github'

// Unauthenticated search allows 10 requests per minute, so requests are
// deliberately conservative: cache generously and retry only transient faults.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          failureCount < 1 &&
          error instanceof GitHubApiError &&
          (error.kind === 'network' || error.kind === 'unavailable'),
        retryDelay: 2_000,
      },
    },
  })
}
