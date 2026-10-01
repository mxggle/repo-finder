import { z } from 'zod'
import {
  buildSearchUrl,
  GitHubApiError,
  parseSearchResponse,
  type RepositorySearchRequest,
  type SearchResult,
} from '../../domain/repository'

const API_VERSION = '2026-03-10'
// GitHub's guidance when a secondary rate limit gives no explicit wait time.
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000

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

export async function searchRepositories(
  state: RepositorySearchRequest,
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
    const nextAttempt = waitUntil ?? Date.now() + DEFAULT_RATE_LIMIT_WAIT_MS
    blockedUntil = nextAttempt
    throw new GitHubApiError('rate-limited', 'GitHub search rate limit reached.', new Date(nextAttempt))
  }
  if (response.status === 422) {
    throw new GitHubApiError('invalid-query', message || 'GitHub could not process this search query.')
  }
  if (response.status >= 500) {
    throw new GitHubApiError('unavailable', 'GitHub search is temporarily unavailable.')
  }
  throw new GitHubApiError('unexpected-response', message || `GitHub responded with status ${response.status}.`)
}
