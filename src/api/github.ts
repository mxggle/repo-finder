import { z } from 'zod'
import { PER_PAGE, type SearchState } from '../lib/searchState'

const SEARCH_URL = 'https://api.github.com/search/repositories'
const API_VERSION = '2026-03-10'
// GitHub's guidance when a secondary rate limit gives no explicit wait time.
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

export type Repository = {
  id: number
  fullName: string
  owner: { login: string; avatarUrl: string | null }
  url: string
  description: string | null
  language: string | null
  stars: number
  forks: number
  topics: string[]
  license: string | null
  updatedAt: Date | null
  archived: boolean
  fork: boolean
}

export type SearchResult = {
  /** The page these items belong to. */
  page: number
  totalCount: number
  incompleteResults: boolean
  items: Repository[]
  /** Items dropped because GitHub returned a shape we could not display safely. */
  skippedCount: number
}

export type ApiErrorKind =
  | 'rate-limited'
  | 'invalid-query'
  | 'unavailable'
  | 'network'
  | 'unexpected-response'

export class GitHubApiError extends Error {
  readonly kind: ApiErrorKind
  /** Earliest time a retry is allowed. Only set for `rate-limited`. */
  readonly retryAt: Date | null

  constructor(kind: ApiErrorKind, message: string, retryAt: Date | null = null) {
    super(message)
    this.name = 'GitHubApiError'
    this.kind = kind
    this.retryAt = retryAt
  }
}

const httpsUrl = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).protocol === 'https:')

const repositorySchema = z.object({
  id: z.number(),
  full_name: z.string().min(1),
  owner: z
    .object({
      login: z.string(),
      avatar_url: httpsUrl.nullish().catch(null),
    })
    .nullish(),
  // Only link to GitHub itself, never to an arbitrary scheme or host.
  html_url: z.string().refine((value) => value.startsWith('https://github.com/')),
  description: z.string().nullish().catch(null),
  language: z.string().nullish().catch(null),
  stargazers_count: z.number().catch(0),
  forks_count: z.number().catch(0),
  topics: z.array(z.string()).catch([]),
  license: z.object({ spdx_id: z.string().nullish(), name: z.string().nullish() }).nullish().catch(null),
  updated_at: z.string().nullish().catch(null),
  archived: z.boolean().catch(false),
  fork: z.boolean().catch(false),
})

const envelopeSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(z.unknown()),
})

function toRepository(raw: z.infer<typeof repositorySchema>): Repository {
  const updatedAt = raw.updated_at ? new Date(raw.updated_at) : null
  const spdx = raw.license?.spdx_id
  return {
    id: raw.id,
    fullName: raw.full_name,
    owner: {
      login: raw.owner?.login ?? raw.full_name.split('/')[0],
      avatarUrl: raw.owner?.avatar_url ?? null,
    },
    url: raw.html_url,
    description: raw.description?.trim() || null,
    language: raw.language ?? null,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    topics: raw.topics,
    // GitHub uses NOASSERTION for licenses it could not identify.
    license: spdx && spdx !== 'NOASSERTION' ? spdx : (raw.license?.name ?? null),
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
    archived: raw.archived,
    fork: raw.fork,
  }
}

export function parseSearchResponse(body: unknown, page = 1): SearchResult {
  const envelope = envelopeSchema.safeParse(body)
  if (!envelope.success) {
    throw new GitHubApiError('unexpected-response', 'GitHub returned a response we could not read.')
  }
  const items: Repository[] = []
  let skippedCount = 0
  for (const item of envelope.data.items) {
    const parsed = repositorySchema.safeParse(item)
    if (parsed.success) items.push(toRepository(parsed.data))
    else skippedCount += 1
  }
  return {
    page,
    totalCount: envelope.data.total_count,
    incompleteResults: envelope.data.incomplete_results,
    items,
    skippedCount,
  }
}

// While GitHub has told us to wait, fail fast locally instead of sending
// requests that are guaranteed to be rejected (and that GitHub may penalise).
let blockedUntil = 0

export function resetRateLimitGate() {
  blockedUntil = 0
}

function rateLimitWaitUntil(response: Response, now: number): number | null {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (retryAfter > 0) return now + retryAfter * 1000

  const remaining = response.headers.get('x-ratelimit-remaining')
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (remaining === '0' && reset > 0) return Math.max(reset * 1000, now)

  return null
}

const errorBodySchema = z.object({
  message: z.string().optional(),
  // 422 responses carry the specific reason here, e.g. "The search is longer than 256 characters."
  errors: z.array(z.object({ message: z.string().optional() }).loose()).optional(),
})

async function readMessage(response: Response): Promise<string> {
  try {
    const body = errorBodySchema.safeParse(await response.json())
    if (!body.success) return ''
    const details = (body.data.errors ?? []).flatMap((error) => (error.message ? [error.message] : []))
    return details.length > 0 ? details.join(' ') : (body.data.message ?? '')
  } catch {
    // Non-JSON error bodies are not useful to show.
    return ''
  }
}

export function buildSearchUrl({ q, sort, page }: SearchState): string {
  const params = new URLSearchParams({ q, per_page: String(PER_PAGE), page: String(page) })
  if (sort !== 'best-match') {
    params.set('sort', sort)
    params.set('order', 'desc')
  }
  return `${SEARCH_URL}?${params}`
}

export async function searchRepositories(
  state: SearchState,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const now = Date.now()
  if (now < blockedUntil) {
    throw new GitHubApiError('rate-limited', 'GitHub search rate limit reached.', new Date(blockedUntil))
  }

  let response: Response
  try {
    response = await fetch(buildSearchUrl(state), {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new GitHubApiError('network', 'Could not reach GitHub.')
  }

  const waitUntil = rateLimitWaitUntil(response, Date.now())

  if (response.ok) {
    // The quota is used up; the next request would be rejected.
    if (waitUntil !== null) blockedUntil = waitUntil
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new GitHubApiError('unexpected-response', 'GitHub returned a response we could not read.')
    }
    return parseSearchResponse(body, state.page)
  }

  const message = await readMessage(response)

  if (response.status === 429 || (response.status === 403 && (waitUntil !== null || /rate limit/i.test(message)))) {
    blockedUntil = waitUntil ?? Date.now() + DEFAULT_RATE_LIMIT_WAIT_MS
    throw new GitHubApiError('rate-limited', 'GitHub search rate limit reached.', new Date(blockedUntil))
  }
  if (response.status === 422) {
    throw new GitHubApiError('invalid-query', message || 'GitHub could not process this search query.')
  }
  if (response.status >= 500) {
    throw new GitHubApiError('unavailable', 'GitHub search is temporarily unavailable.')
  }
  throw new GitHubApiError('unexpected-response', message || `GitHub responded with status ${response.status}.`)
}
