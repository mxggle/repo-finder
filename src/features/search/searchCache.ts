import { z } from 'zod'
import { parseSearchResponse, type SearchResult } from '../../domain/repository'
import { MAX_PAGE, PER_PAGE, type SearchState } from './searchState'

export const SEARCH_CACHE_KEY = 'repo-finder:search-cache:v1'
export const SEARCH_CACHE_RETENTION_MS = 15 * 60_000
export const SEARCH_CACHE_MAX_ENTRIES = 20
// Count UTF-16 code units conservatively as two bytes each, including the envelope.
export const SEARCH_CACHE_MAX_BYTES = 1024 * 1024

const safeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const isoDate = z.string().refine((value) => {
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
})
const httpsUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})

const requestSchema = z.strictObject({
  q: z.string().min(1).refine((value) => value === value.trim()),
  sort: z.enum(['best-match', 'stars', 'forks', 'updated']),
  page: z.number().int().min(1).max(MAX_PAGE),
  perPage: z.literal(PER_PAGE),
})
const repositorySchema = z.strictObject({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  fullName: z.string().min(1),
  owner: z.strictObject({ login: z.string(), avatarUrl: httpsUrl.nullable() }),
  url: z.string(), // The domain parser checks the GitHub host, credentials, and scheme.
  description: z.string().nullable(),
  language: z.string().nullable(),
  stars: safeCount.nullable(),
  forks: safeCount.nullable(),
  topics: z.array(z.string()),
  license: z.string().nullable(),
  updatedAt: isoDate.nullable(),
  pushedAt: isoDate.nullable(),
  archived: z.boolean().nullable(),
  fork: z.boolean().nullable(),
})
const entrySchema = z.strictObject({
  request: requestSchema,
  data: z.strictObject({
    page: z.number().int().min(1).max(MAX_PAGE),
    totalCount: safeCount,
    incompleteResults: z.boolean(),
    items: z.array(repositorySchema).max(PER_PAGE),
    fetchedAt: isoDate,
    skippedCount: safeCount,
  }),
})
const cacheSchema = z.strictObject({
  version: z.literal(1),
  entries: z.array(z.unknown()).max(SEARCH_CACHE_MAX_ENTRIES),
})
type CacheEntry = z.infer<typeof entrySchema>

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

function requestKey(request: CacheEntry['request']): string {
  return JSON.stringify([request.q, request.sort, request.page, request.perPage])
}

function restore(entry: CacheEntry): SearchResult | undefined {
  const data = entry.data
  if (data.page !== entry.request.page) return undefined
  // Reuse the same domain parser as network responses so stored links cannot bypass validation.
  const parsed = parseSearchResponse({
    total_count: data.totalCount,
    incomplete_results: data.incompleteResults,
    items: data.items.map((item) => ({
      id: item.id,
      full_name: item.fullName,
      owner: { login: item.owner.login, avatar_url: item.owner.avatarUrl },
      html_url: item.url,
      description: item.description,
      language: item.language,
      stargazers_count: item.stars,
      forks_count: item.forks,
      topics: item.topics,
      license: item.license === null ? null : { name: item.license },
      updated_at: item.updatedAt,
      pushed_at: item.pushedAt,
      archived: item.archived,
      fork: item.fork,
    })),
  }, data.page, new Date(data.fetchedAt))
  if (parsed.skippedCount !== 0) return undefined
  return { ...parsed, skippedCount: data.skippedCount }
}

function writeEntries(storage: Storage, entries: CacheEntry[]) {
  try {
    const bounded = entries.slice(-SEARCH_CACHE_MAX_ENTRIES)
    let encoded = JSON.stringify({ version: 1, entries: bounded })
    while (bounded.length > 0 && encoded.length * 2 > SEARCH_CACHE_MAX_BYTES) {
      bounded.shift()
      encoded = JSON.stringify({ version: 1, entries: bounded })
    }
    if (bounded.length === 0) storage.removeItem(SEARCH_CACHE_KEY)
    else storage.setItem(SEARCH_CACHE_KEY, encoded)
  } catch {
    // Disabled storage and quota errors must never affect the in-memory query cache.
  }
}

function readEntries(storage: Storage, now: number): CacheEntry[] {
  try {
    const encoded = storage.getItem(SEARCH_CACHE_KEY)
    if (!encoded) return []
    if (encoded.length * 2 > SEARCH_CACHE_MAX_BYTES) {
      storage.removeItem(SEARCH_CACHE_KEY)
      return []
    }
    const cache = cacheSchema.safeParse(JSON.parse(encoded))
    if (!cache.success) {
      storage.removeItem(SEARCH_CACHE_KEY)
      return []
    }
    const entries: CacheEntry[] = []
    const seen = new Set<string>()
    for (const candidate of [...cache.data.entries].reverse()) {
      const parsed = entrySchema.safeParse(candidate)
      if (!parsed.success) continue
      const entry = parsed.data
      const age = now - Date.parse(entry.data.fetchedAt)
      const key = requestKey(entry.request)
      if (age < 0 || age >= SEARCH_CACHE_RETENTION_MS || seen.has(key) || !restore(entry)) continue
      seen.add(key)
      entries.unshift(entry)
    }
    if (entries.length !== cache.data.entries.length) writeEntries(storage, entries)
    return entries
  } catch {
    try {
      storage.removeItem(SEARCH_CACHE_KEY)
    } catch {
      // Storage may also prohibit removing corrupted entries.
    }
    return []
  }
}

/** Restore only successful, validated responses, retaining their original observation time. */
export function readSearchCache(state: SearchState): SearchResult | undefined {
  const storage = getStorage()
  if (!storage || !state.q.trim()) return undefined
  const key = requestKey({ ...state, q: state.q.trim(), perPage: PER_PAGE })
  const entry = readEntries(storage, Date.now()).find((candidate) => requestKey(candidate.request) === key)
  return entry ? restore(entry) : undefined
}

/** Called only after a successful request; failed and placeholder results are never persisted. */
export function writeSearchCache(state: SearchState, data: SearchResult): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const parsed = entrySchema.safeParse(JSON.parse(JSON.stringify({
      request: { ...state, q: state.q.trim(), perPage: PER_PAGE },
      data,
    })))
    if (!parsed.success || !restore(parsed.data)) return
    const now = Date.now()
    const age = now - Date.parse(parsed.data.data.fetchedAt)
    if (age < 0 || age >= SEARCH_CACHE_RETENTION_MS) return
    const entries = readEntries(storage, now)
      .filter((entry) => requestKey(entry.request) !== requestKey(parsed.data.request))
    writeEntries(storage, [...entries, parsed.data])
  } catch {
    // Invalid input or unavailable storage is a cache miss, never a search failure.
  }
}
