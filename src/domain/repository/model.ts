export type Repository = {
  id: number
  fullName: string
  owner: { login: string; avatarUrl: string | null }
  url: string
  description: string | null
  language: string | null
  /** Null when GitHub omitted the count or sent something other than a whole number. */
  stars: number | null
  forks: number | null
  topics: string[]
  license: string | null
  updatedAt: Date | null
  /** Last push to any branch; distinct from `updatedAt` and from when this app fetched the data. */
  pushedAt: Date | null
  /** Null when unknown, so a missing flag is never mistaken for `false`. */
  archived: boolean | null
  fork: boolean | null
}

export type SearchResult = {
  /** The page these items belong to. */
  page: number
  totalCount: number
  incompleteResults: boolean
  items: Repository[]
  /** When the successful response was parsed; cached reads keep the original time. */
  fetchedAt: Date
  /** Items dropped because GitHub returned a shape we could not display safely. */
  skippedCount: number
}

/** Transport parameters, independent of browser URL state and pagination UI. */
export type RepositorySortKey = 'best-match' | 'stars' | 'forks' | 'updated'

export type RepositorySearchRequest = {
  q: string
  sort: RepositorySortKey
  page: number
  perPage?: number
}
