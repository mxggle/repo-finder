import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSearchResponse } from '../../domain/repository'
import { makeSearchBody } from '../../test/fixtures'
import {
  readSearchCache,
  SEARCH_CACHE_KEY,
  SEARCH_CACHE_MAX_BYTES,
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_RETENTION_MS,
  writeSearchCache,
} from './searchCache'
import { PER_PAGE, type SearchState } from './searchState'

const now = new Date('2026-09-30T12:00:00.000Z')
const state: SearchState = { q: 'react', sort: 'best-match', page: 1 }

function data(page = 1, fetchedAt = now) {
  return parseSearchResponse(makeSearchBody({ page }), page, fetchedAt)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  window.sessionStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('round-trips Dates, unknown fields, counts, flags and the original observation time', () => {
  const result = data()
  result.skippedCount = 2
  Object.assign(result.items[0], {
    stars: null, forks: null, archived: null, fork: null, license: null,
    updatedAt: null, pushedAt: null, owner: { login: 'octo-org', avatarUrl: null },
  })
  writeSearchCache(state, result)
  expect(readSearchCache(state)).toEqual(result)
  expect(readSearchCache(state)?.items[1].pushedAt).toBeInstanceOf(Date)
  expect(readSearchCache(state)?.fetchedAt).toBeInstanceOf(Date)
})

it('trims only outer query whitespace and separates pages, sorts and distinct query spelling', () => {
  writeSearchCache({ ...state, q: ' react ' }, data())
  writeSearchCache({ ...state, page: 2 }, data(2))
  writeSearchCache({ ...state, sort: 'stars' }, { ...data(), totalCount: 9 })
  expect(readSearchCache(state)?.page).toBe(1)
  expect(readSearchCache({ ...state, page: 2 })?.page).toBe(2)
  expect(readSearchCache({ ...state, sort: 'stars' })?.totalCount).toBe(9)
  expect(readSearchCache({ ...state, q: 'React' })).toBeUndefined()
  expect(readSearchCache({ ...state, q: 'react  hooks' })).toBeUndefined()
  const stored = JSON.parse(window.sessionStorage.getItem(SEARCH_CACHE_KEY)!)
  expect(stored.entries[0].request.perPage).toBe(PER_PAGE)
})

it('retains stale data until the fifteen-minute boundary without changing fetchedAt', () => {
  const fetchedAt = new Date(now.getTime() - 6 * 60_000)
  writeSearchCache(state, data(1, fetchedAt))
  expect(readSearchCache(state)?.fetchedAt).toEqual(fetchedAt)
  vi.setSystemTime(new Date(fetchedAt.getTime() + SEARCH_CACHE_RETENTION_MS))
  expect(readSearchCache(state)).toBeUndefined()
  expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).toBeNull()
})

describe('untrusted storage', () => {
  it.each([
    ['invalid JSON', '{'],
    ['unknown version', JSON.stringify({ version: 2, entries: [] })],
    ['malformed envelope', JSON.stringify({ version: 1, entries: 'wrong' })],
    ['oversized envelope', 'x'.repeat(SEARCH_CACHE_MAX_BYTES / 2 + 1)],
  ])('discards %s', (_label, stored) => {
    window.sessionStorage.setItem(SEARCH_CACHE_KEY, stored)
    expect(readSearchCache(state)).toBeUndefined()
    expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).toBeNull()
  })

  it.each([
    ['unsafe repository URL', (entry: ReturnType<typeof storedEntry>) => { entry.data.items[0].url = 'javascript:alert(1)' }],
    ['wrong repository host', (entry: ReturnType<typeof storedEntry>) => { entry.data.items[0].url = 'https://evil.example/repo' }],
    ['unsafe avatar URL', (entry: ReturnType<typeof storedEntry>) => { entry.data.items[0].owner.avatarUrl = 'javascript:alert(1)' }],
    ['malformed date', (entry: ReturnType<typeof storedEntry>) => { entry.data.items[0].updatedAt = 'bad date' }],
    ['future observation', (entry: ReturnType<typeof storedEntry>) => { entry.data.fetchedAt = new Date(now.getTime() + 1).toISOString() }],
    ['expired observation', (entry: ReturnType<typeof storedEntry>) => { entry.data.fetchedAt = new Date(now.getTime() - SEARCH_CACHE_RETENTION_MS).toISOString() }],
    ['wrong page size', (entry: ReturnType<typeof storedEntry>) => { entry.request.perPage = PER_PAGE + 1 }],
    ['mismatched page', (entry: ReturnType<typeof storedEntry>) => { entry.data.page = 2 }],
    ['unsafe ID', (entry: ReturnType<typeof storedEntry>) => { entry.data.items[0].id = Number.MAX_SAFE_INTEGER + 1 }],
  ])('discards %s entries', (_label, mutate) => {
    const entry = storedEntry()
    mutate(entry)
    window.sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify({ version: 1, entries: [entry] }))
    expect(readSearchCache(state)).toBeUndefined()
    expect(window.sessionStorage.getItem(SEARCH_CACHE_KEY)).toBeNull()
  })
})

function storedEntry() {
  writeSearchCache(state, data())
  // JSON serialization is the actual persistence boundary under test.
  return JSON.parse(window.sessionStorage.getItem(SEARCH_CACHE_KEY)!).entries[0] as {
    request: SearchState & { perPage: number }
    data: Omit<ReturnType<typeof data>, 'fetchedAt' | 'items'> & {
      fetchedAt: string
      items: { id: number; url: string; owner: { avatarUrl: string }; updatedAt: string }[]
    }
  }
}

it('evicts oldest stored pages and replaces a repeated key within the entry limit', () => {
  for (let page = 1; page <= SEARCH_CACHE_MAX_ENTRIES + 1; page++) {
    writeSearchCache({ ...state, page }, data(page))
  }
  expect(readSearchCache(state)).toBeUndefined()
  expect(readSearchCache({ ...state, page: 2 })).toBeDefined()
  expect(readSearchCache({ ...state, page: SEARCH_CACHE_MAX_ENTRIES + 1 })).toBeDefined()
  writeSearchCache({ ...state, page: 2 }, { ...data(2), totalCount: 99 })
  const stored = JSON.parse(window.sessionStorage.getItem(SEARCH_CACHE_KEY)!)
  expect(stored.entries).toHaveLength(SEARCH_CACHE_MAX_ENTRIES)
  expect(readSearchCache({ ...state, page: 2 })?.totalCount).toBe(99)
})

it('enforces the total byte limit and does not retain a single oversized response', () => {
  const large = data()
  large.items[0].description = 'x'.repeat(150_000)
  for (let page = 1; page <= 5; page++) {
    writeSearchCache({ ...state, page }, { ...large, page })
  }
  const encoded = window.sessionStorage.getItem(SEARCH_CACHE_KEY)!
  expect(encoded.length * 2).toBeLessThanOrEqual(SEARCH_CACHE_MAX_BYTES)
  expect(readSearchCache(state)).toBeUndefined()
  expect(readSearchCache({ ...state, page: 5 })).toBeDefined()
  large.items[0].description = 'x'.repeat(SEARCH_CACHE_MAX_BYTES)
  writeSearchCache(state, large)
  expect(readSearchCache(state)).toBeUndefined()
  expect((window.sessionStorage.getItem(SEARCH_CACHE_KEY)?.length ?? 0) * 2)
    .toBeLessThanOrEqual(SEARCH_CACHE_MAX_BYTES)
})

it('degrades safely when storage reads, writes or access fail', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  expect(readSearchCache(state)).toBeUndefined()
  get.mockRestore()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => writeSearchCache(state, data())).not.toThrow()
  expect(readSearchCache(state)).toBeUndefined()
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('disabled') })
  expect(() => writeSearchCache(state, data())).not.toThrow()
  expect(readSearchCache(state)).toBeUndefined()
})
