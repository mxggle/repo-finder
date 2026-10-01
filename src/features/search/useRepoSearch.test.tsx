import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GitHubApiError, parseSearchResponse, type SearchResult } from '../../domain/repository'
import { makeSearchBody } from '../../test/fixtures'
import * as github from './github'
import { readSearchCache, SEARCH_CACHE_KEY, writeSearchCache } from './searchCache'
import { PER_PAGE, type SearchState } from './searchState'
import { useRepoSearch } from './useRepoSearch'

const now = new Date('2026-09-30T12:00:00.000Z')
const state: SearchState = { q: 'react', sort: 'best-match', page: 1 }
const clients: QueryClient[] = []

function data(page = 1, fetchedAt = now) {
  return parseSearchResponse(makeSearchBody({ page }), page, fetchedAt)
}
function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 15 * 60_000, retry: false } },
  })
  clients.push(client)
  return client
}
function mount(initialState = state, client = createClient()) {
  const hook = renderHook(({ searchState }) => useRepoSearch(searchState), {
    initialProps: { searchState: initialState },
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  return { ...hook, client }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  window.sessionStorage.clear()
})
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('persists a successful response and restores it in a fresh query client without network', async () => {
  const fetchedAt = new Date(now.getTime() - 2 * 60_000)
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValue(data(1, fetchedAt))
  const first = mount()
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
  expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).not.toBeNull()
  first.unmount()
  first.client.clear()
  const restored = mount()
  expect(restored.result.current.data?.fetchedAt).toEqual(fetchedAt)
  expect(restored.result.current.data?.items[0].updatedAt).toBeInstanceOf(Date)
  expect(restored.result.current.dataUpdatedAt).toBe(fetchedAt.getTime())
  expect(restored.result.current.isFetching).toBe(false)
  expect(search).toHaveBeenCalledTimes(1)
  restored.unmount()
})

it('revalidates stale restored data using the original fetchedAt and dataUpdatedAt', async () => {
  const fetchedAt = new Date(now.getTime() - 6 * 60_000)
  writeSearchCache(state, data(1, fetchedAt))
  let resolve!: (result: SearchResult) => void
  const search = vi.spyOn(github, 'searchRepositories')
    .mockImplementation(() => new Promise((done) => { resolve = done }))
  const restored = mount()
  expect(restored.result.current.data?.fetchedAt).toEqual(fetchedAt)
  expect(restored.result.current.dataUpdatedAt).toBe(fetchedAt.getTime())
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  expect(restored.result.current.isFetching).toBe(true)
  resolve(data())
  await waitFor(() => expect(restored.result.current.data?.fetchedAt).toEqual(now))
  expect(readSearchCache(state)?.fetchedAt).toEqual(now)
  restored.unmount()
})

it('revalidates at the five-minute freshness boundary', async () => {
  writeSearchCache(state, data(1, new Date(now.getTime() - 5 * 60_000)))
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValue(data())
  const hook = mount()
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  hook.unmount()
})

it('restores pages and sorts independently and fetches a distinct query', async () => {
  writeSearchCache(state, data())
  writeSearchCache({ ...state, page: 2 }, data(2))
  writeSearchCache({ ...state, sort: 'stars' }, { ...data(), totalCount: 8 })
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValue(data())
  for (const [searchState, expected] of [
    [state, 45],
    [{ ...state, page: 2 }, 45],
    [{ ...state, sort: 'stars' as const }, 8],
  ] as const) {
    const hook = mount(searchState)
    expect(hook.result.current.data?.totalCount).toBe(expected)
    expect(hook.result.current.data?.page).toBe(searchState.page)
    hook.unmount()
  }
  expect(search).not.toHaveBeenCalled()
  const distinct = mount({ ...state, q: 'React' })
  await waitFor(() => expect(distinct.result.current.isSuccess).toBe(true))
  expect(search).toHaveBeenCalledTimes(1)
  distinct.unmount()
})

it('never persists initial errors and keeps stale successful data after a refresh error', async () => {
  vi.spyOn(github, 'searchRepositories').mockRejectedValue(new GitHubApiError('invalid-query', 'Invalid query'))
  const failed = mount()
  await waitFor(() => expect(failed.result.current.isError).toBe(true))
  expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).toBeNull()
  failed.unmount()
  const stale = data(1, new Date(now.getTime() - 6 * 60_000))
  writeSearchCache(state, stale)
  const refreshed = mount()
  await waitFor(() => expect(refreshed.result.current.isRefetchError).toBe(true))
  expect(refreshed.result.current.data).toEqual(stale)
  expect(readSearchCache(state)).toEqual(stale)
  refreshed.unmount()
})

it('continues using the in-memory cache when persistence fails', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValue(data())
  const client = createClient()
  const first = mount(state, client)
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
  first.unmount()
  const second = mount(state, client)
  expect(second.result.current.isSuccess).toBe(true)
  expect(search).toHaveBeenCalledTimes(1)
  expect(readSearchCache(state)).toBeUndefined()
  second.unmount()
})

it('skips storage deserialization when a response is already cached in memory', async () => {
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValue(data())
  const client = createClient()
  const first = mount(state, client)
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
  first.unmount()
  const get = vi.spyOn(Storage.prototype, 'getItem')
  const second = mount(state, client)
  expect(second.result.current.isSuccess).toBe(true)
  expect(get).not.toHaveBeenCalled()
  expect(search).toHaveBeenCalledTimes(1)
  second.unmount()
})

it('deduplicates same-key requests and passes cancellation and fixed page size to the transport', async () => {
  let signal: AbortSignal | undefined
  const search = vi.spyOn(github, 'searchRepositories').mockImplementation((_state, incomingSignal) => {
    signal = incomingSignal
    return new Promise((_resolve, reject) => {
      incomingSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
  })
  const client = createClient()
  const first = mount({ ...state, q: ' react ' }, client)
  const second = mount(state, client)
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
  expect(search).toHaveBeenCalledWith({ ...state, perPage: PER_PAGE }, expect.any(AbortSignal))
  first.unmount()
  expect(signal?.aborted).toBe(false)
  second.unmount()
  expect(signal?.aborted).toBe(true)
  expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).toBeNull()
})

it('keeps same-query placeholders but never shows a previous query under a new query', async () => {
  const search = vi.spyOn(github, 'searchRepositories').mockResolvedValueOnce(data())
    .mockImplementation(() => new Promise(() => {}))
  const hook = mount()
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  hook.rerender({ searchState: { ...state, page: 2 } })
  expect(hook.result.current.isPlaceholderData).toBe(true)
  expect(hook.result.current.data?.page).toBe(1)
  expect(readSearchCache({ ...state, page: 2 })).toBeUndefined()
  hook.rerender({ searchState: { ...state, q: 'vue' } })
  expect(hook.result.current.data).toBeUndefined()
  expect(hook.result.current.isPlaceholderData).toBe(false)
  expect(search).toHaveBeenCalledTimes(3)
  hook.unmount()
})

it('does not parse session storage again on a same-state rerender or request an empty query', () => {
  const search = vi.spyOn(github, 'searchRepositories')
  const get = vi.spyOn(Storage.prototype, 'getItem')
  const hook = mount({ ...state, q: ' ' })
  expect(search).not.toHaveBeenCalled()
  hook.rerender({ searchState: { ...state, q: ' ' } })
  expect(get).not.toHaveBeenCalled()
  hook.unmount()
  writeSearchCache(state, data())
  get.mockClear()
  const cached = mount()
  cached.rerender({ searchState: { ...state } })
  expect(get).toHaveBeenCalledTimes(1)
  cached.unmount()
})
