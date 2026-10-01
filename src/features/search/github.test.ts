import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { makeSearchBody } from '../../test/fixtures'
import { SEARCH_ENDPOINT, server } from '../../test/server'
import { GitHubApiError } from '../../domain/repository'
import { searchRepositories } from './github'

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

describe('searchRepositories', () => {
  it('returns parsed results', async () => {
    const result = await searchRepositories(state)
    expect(result.totalCount).toBe(45)
    expect(result.items).toHaveLength(20)
  })

  it('stamps each successful response with the time it was fetched', async () => {
    const before = Date.now()
    const result = await searchRepositories(state)
    expect(result.fetchedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.fetchedAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(result.items[0].pushedAt).toEqual(new Date('2026-09-15T08:30:00Z'))
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
