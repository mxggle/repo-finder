import { describe, expect, it } from 'vitest'
import {
  SEARCH_HISTORY_LIMIT,
  SEARCH_HISTORY_QUERY_LIMIT,
  parseSearchHistory,
  recordSearchHistory,
  removeSearchHistory,
  type SearchHistoryEntry,
} from './historyStore'

const entry = (q: string, lastSearchedAt = 100, sort: SearchHistoryEntry['sort'] = 'best-match'): SearchHistoryEntry => ({
  q, sort, lastSearchedAt,
})
const stored = (entries: unknown, version = 1) => JSON.stringify({ version, entries })

describe('search history snapshots', () => {
  it('normalizes edges and recency without changing query semantics', () => {
    expect(parseSearchHistory(stored([
      entry('older', 10),
      entry('  topic:cli  "日本語 tools"  ', 30, 'stars'),
      entry('topic:cli  "日本語 tools"', 20, 'stars'),
      entry('topic:cli  "日本語 tools"', 25, 'forks'),
    ]))).toEqual([
      entry('topic:cli  "日本語 tools"', 30, 'stars'),
      entry('topic:cli  "日本語 tools"', 25, 'forks'),
      entry('older', 10),
    ])
  })

  it.each([
    null,
    'broken json',
    'null',
    '{}',
    stored([], 2),
    stored('not an array'),
    stored([null]),
    stored([{ q: 'react', sort: 'unknown', lastSearchedAt: 1 }]),
    stored([{ q: 5, sort: 'stars', lastSearchedAt: 1 }]),
    stored([entry('   ')]),
    stored([entry('react', -1)]),
    stored([entry('react', 1.5)]),
    stored([entry('react', Number.MAX_SAFE_INTEGER + 1)]),
    stored([{ q: 'react', sort: 'stars' }]),
    stored([entry('x'.repeat(SEARCH_HISTORY_QUERY_LIMIT + 1))]),
    stored(Array.from({ length: SEARCH_HISTORY_LIMIT + 1 }, (_, index) => entry(String(index)))),
    ' '.repeat(65_537),
  ])('fails safely for invalid or oversized snapshot %j', (raw) => {
    expect(parseSearchHistory(raw)).toEqual([])
  })

  it('accepts the complete bounded snapshot', () => {
    const entries = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, index) => entry('x'.repeat(4095) + index, index))
    expect(parseSearchHistory(stored(entries))).toEqual(entries.toReversed())
  })
})

describe('recording and removing searches', () => {
  it('deduplicates q+sort, ignores page, and moves repeated searches to the front', () => {
    const previous = [entry('vue', 20), entry('React', 10, 'stars'), entry('React', 5)]
    expect(recordSearchHistory(previous, { q: '  React ', sort: 'stars', page: 7 }, 30)).toEqual([
      entry('React', 30, 'stars'), entry('vue', 20), entry('React', 5),
    ])
    expect(recordSearchHistory(previous, { q: 'react', sort: 'stars', page: 1 }, 30)).toHaveLength(4)
  })

  it('keeps only the ten most recently executed distinct searches', () => {
    let entries: SearchHistoryEntry[] = []
    for (let index = 0; index < 12; index++) {
      entries = recordSearchHistory(entries, { q: `query ${index}`, sort: 'best-match', page: 1 }, index)
    }
    expect(entries.map(({ q }) => q)).toEqual(Array.from({ length: 10 }, (_, index) => `query ${11 - index}`))
  })

  it('skips blank and overlong queries instead of truncating them', () => {
    const entries = [entry('react')]
    expect(recordSearchHistory(entries, { q: ' \n ', sort: 'stars', page: 1 }, 200)).toBe(entries)
    expect(recordSearchHistory(entries, { q: 'x'.repeat(SEARCH_HISTORY_QUERY_LIMIT + 1), sort: 'stars', page: 1 }, 200)).toBe(entries)
  })

  it('evicts oldest whole queries when escaped text reaches the serialized size bound', () => {
    let entries: SearchHistoryEntry[] = []
    for (let index = 0; index < 10; index++) {
      entries = recordSearchHistory(entries, { q: '\u0000'.repeat(4095) + index, sort: 'stars', page: 1 }, index)
    }
    expect(entries.length).toBeLessThan(10)
    expect(entries[0].q).toBe('\u0000'.repeat(4095) + '9')
    expect(parseSearchHistory(stored(entries))).toEqual(entries)
  })

  it('removes only the requested q+sort, regardless of its old timestamp', () => {
    expect(removeSearchHistory([entry('react', 30, 'stars'), entry('react', 20)], entry('react', 10, 'stars'))).toEqual([
      entry('react', 20),
    ])
  })
})
