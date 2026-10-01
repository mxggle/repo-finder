import type { RepositorySearchRequest } from './model'

const SEARCH_URL = 'https://api.github.com/search/repositories'

export function buildSearchUrl({ q, sort, page, perPage = 20 }: RepositorySearchRequest): string {
  const params = new URLSearchParams({ q, per_page: String(perPage), page: String(page) })
  if (sort !== 'best-match') {
    params.set('sort', sort)
    params.set('order', 'desc')
  }
  return `${SEARCH_URL}?${params}`
}

