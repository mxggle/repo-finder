import { describe, expect, it } from 'vitest'
import { buildSearchUrl } from './search'

describe('buildSearchUrl', () => {
  it('accepts a page size without importing browser search state', () => {
    const url = new URL(buildSearchUrl({ q: 'topic:cli', sort: 'stars', page: 2, perPage: 40 }))
    expect(url.searchParams.get('per_page')).toBe('40')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('only sends sort and order for an explicit sort', () => {
    const bestMatch = new URL(buildSearchUrl({ q: 'a b', sort: 'best-match', page: 2 }))
    expect(Object.fromEntries(bestMatch.searchParams)).toEqual({ q: 'a b', per_page: '20', page: '2' })

    const stars = new URL(buildSearchUrl({ q: 'a', sort: 'stars', page: 1 }))
    expect(stars.searchParams.get('sort')).toBe('stars')
    expect(stars.searchParams.get('order')).toBe('desc')
  })
})
