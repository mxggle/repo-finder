import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { makeRepo, makeSearchBody } from '../test/fixtures'
import { SEARCH_ENDPOINT, server } from '../test/server'
import { GitHubApiError, buildSearchUrl, parseSearchResponse, searchRepositories } from './github'

const state = { q: 'react', sort: 'best-match', page: 1 } as const

async function captureError(promise: Promise<unknown>): Promise<GitHubApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof GitHubApiError) return error
    throw error
  }
  throw new Error('Expected the request to fail')
}

describe('buildSearchUrl', () => {
  it('only sends sort and order for an explicit sort', () => {
    const bestMatch = new URL(buildSearchUrl({ q: 'a b', sort: 'best-match', page: 2 }))
    expect(Object.fromEntries(bestMatch.searchParams)).toEqual({ q: 'a b', per_page: '20', page: '2' })

    const stars = new URL(buildSearchUrl({ q: 'a', sort: 'stars', page: 1 }))
    expect(stars.searchParams.get('sort')).toBe('stars')
    expect(stars.searchParams.get('order')).toBe('desc')
  })
})

describe('parseSearchResponse', () => {
  it('normalises nullable and missing fields', () => {
    const result = parseSearchResponse({
      total_count: 1,
      incomplete_results: false,
      items: [
        makeRepo(1, {
          description: null,
          language: null,
          license: { spdx_id: 'NOASSERTION', name: 'Other' },
          topics: undefined,
          owner: null,
          updated_at: 'not a date',
        }),
      ],
    })
    expect(result.items[0]).toMatchObject({
      fullName: 'octo-org/project-1',
      description: null,
      language: null,
      license: 'Other',
      topics: [],
      owner: { login: 'octo-org', avatarUrl: null },
      updatedAt: null,
    })
  })

  it('drops items that cannot be displayed safely and counts them', () => {
    const result = parseSearchResponse({
      total_count: 3,
      incomplete_results: false,
      items: [makeRepo(1), makeRepo(2, { html_url: 'javascript:alert(1)' }), { id: 'x' }],
    })
    expect(result.items.map((item) => item.id)).toEqual([1])
    expect(result.skippedCount).toBe(2)
  })

  it('rejects a response without the expected envelope', () => {
    expect(() => parseSearchResponse({ items: 'nope' })).toThrow(GitHubApiError)
  })
})

describe('searchRepositories', () => {
  it('returns parsed results', async () => {
    const result = await searchRepositories(state)
    expect(result.totalCount).toBe(45)
    expect(result.items).toHaveLength(20)
  })

  it('treats an exhausted primary rate limit as rate-limited until the reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 30
    let calls = 0
    server.use(
      http.get(SEARCH_ENDPOINT, () => {
        calls += 1
        return HttpResponse.json(
          { message: 'API rate limit exceeded' },
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } },
        )
      }),
    )

    const error = await captureError(searchRepositories(state))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAt?.getTime()).toBe(reset * 1000)

    // A second search while blocked must not reach the network.
    const again = await captureError(searchRepositories({ ...state, q: 'vue' }))
    expect(again.kind).toBe('rate-limited')
    expect(calls).toBe(1)
  })

  it('honours retry-after for secondary rate limits', async () => {
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({ message: 'secondary rate limit' }, { status: 429, headers: { 'retry-after': '12' } }),
      ),
    )
    const before = Date.now()
    const error = await captureError(searchRepositories(state))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAt!.getTime() - before).toBeGreaterThanOrEqual(12_000)
    expect(error.retryAt!.getTime() - before).toBeLessThan(13_000)
  })

  it('waits one minute when a rate limit gives no timing headers', async () => {
    server.use(http.get(SEARCH_ENDPOINT, () => HttpResponse.json({ message: 'rate limit' }, { status: 429 })))
    const before = Date.now()
    const error = await captureError(searchRepositories(state))
    expect(error.retryAt!.getTime() - before).toBeGreaterThanOrEqual(60_000)
  })

  it('stops sending requests once a successful response reports no quota left', async () => {
    let calls = 0
    server.use(
      http.get(SEARCH_ENDPOINT, () => {
        calls += 1
        return HttpResponse.json(makeSearchBody(), {
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 20) },
        })
      }),
    )
    await searchRepositories(state)
    const error = await captureError(searchRepositories({ ...state, page: 2 }))
    expect(error.kind).toBe('rate-limited')
    expect(calls).toBe(1)
  })

  it('does not mistake other 403 responses for rate limits', async () => {
    server.use(http.get(SEARCH_ENDPOINT, () => HttpResponse.json({ message: 'Forbidden' }, { status: 403 })))
    const error = await captureError(searchRepositories(state))
    expect(error.kind).toBe('unexpected-response')
  })

  it('surfaces the specific reason for a validation failure', async () => {
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json(
          {
            message: 'Validation Failed',
            errors: [{ message: 'The search is longer than 256 characters.', resource: 'Search', field: 'q' }],
          },
          { status: 422 },
        ),
      ),
    )
    const error = await captureError(searchRepositories(state))
    expect(error.kind).toBe('invalid-query')
    expect(error.message).toBe('The search is longer than 256 characters.')

    server.use(http.get(SEARCH_ENDPOINT, () => HttpResponse.json({ message: 'Validation Failed' }, { status: 422 })))
    expect((await captureError(searchRepositories(state))).message).toBe('Validation Failed')
  })

  it('classifies server and network failures', async () => {
    server.use(http.get(SEARCH_ENDPOINT, () => new HttpResponse(null, { status: 503 })))
    expect((await captureError(searchRepositories(state))).kind).toBe('unavailable')

    server.use(http.get(SEARCH_ENDPOINT, () => HttpResponse.error()))
    expect((await captureError(searchRepositories(state))).kind).toBe('network')
  })
})
