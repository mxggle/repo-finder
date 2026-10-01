import { QueryClient } from '@tanstack/react-query'

// Shared cache defaults. Feature-specific retry policies belong to the query that owns them.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  })
}
