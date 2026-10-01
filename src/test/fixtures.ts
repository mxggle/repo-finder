import { parseSearchResponse, type Repository } from '../domain/repository'

// Shapes mirror the GitHub Search API response (snake_case) so tests exercise
// the same parsing path as production.

export function makeRepo(id: number, overrides: Record<string, unknown> = {}) {
  const name = `project-${id}`
  return {
    id,
    name,
    full_name: `octo-org/${name}`,
    owner: { login: 'octo-org', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
    html_url: `https://github.com/octo-org/${name}`,
    description: `Description for ${name}`,
    language: 'TypeScript',
    stargazers_count: 1000 + id,
    forks_count: 100 + id,
    topics: ['search', 'react'],
    license: { spdx_id: 'MIT', name: 'MIT License' },
    updated_at: '2026-09-01T12:00:00Z',
    pushed_at: '2026-09-15T08:30:00Z',
    archived: false,
    fork: false,
    ...overrides,
  }
}

export function makeSearchBody({
  page = 1,
  perPage = 20,
  total = 45,
  prefix = 0,
  incomplete = false,
}: { page?: number; perPage?: number; total?: number; prefix?: number; incomplete?: boolean } = {}) {
  const start = (page - 1) * perPage
  const count = Math.max(0, Math.min(perPage, Math.min(total, 1000) - start))
  return {
    total_count: total,
    incomplete_results: incomplete,
    items: Array.from({ length: count }, (_, index) => makeRepo(prefix + start + index + 1)),
  }
}

/** A parsed repository, built through the real parser so it has the app's runtime shape. */
export function makeRepository(id: number, overrides: Record<string, unknown> = {}): Repository {
  const body = { total_count: 1, incomplete_results: false, items: [makeRepo(id, overrides)] }
  return parseSearchResponse(body).items[0]
}

export const FETCHED_AT = '2026-09-20T10:00:00.000Z'
