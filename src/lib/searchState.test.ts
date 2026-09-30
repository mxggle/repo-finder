import { describe, expect, it } from 'vitest'
import { MAX_PAGE, lastPageFor, parseSearchState, toQueryString } from './searchState'

describe('parseSearchState', () => {
  it('reads query, sort and page', () => {
    expect(parseSearchState('?q=react&sort=stars&page=3')).toEqual({ q: 'react', sort: 'stars', page: 3 })
  })

  it('falls back to defaults for unknown or malformed values', () => {
    expect(parseSearchState('?q=react&sort=bogus&page=abc')).toEqual({ q: 'react', sort: 'best-match', page: 1 })
    expect(parseSearchState('?q=react&page=-2')).toEqual({ q: 'react', sort: 'best-match', page: 1 })
    expect(parseSearchState('?q=react&page=2.5')).toEqual({ q: 'react', sort: 'best-match', page: 1 })
  })

  it('clamps the page to the last page GitHub can serve', () => {
    expect(parseSearchState('?q=react&page=9999').page).toBe(MAX_PAGE)
    expect(parseSearchState('?q=react&page=0').page).toBe(1)
  })

  it('ignores sort and page without a query', () => {
    expect(parseSearchState('?q=%20%20&sort=stars&page=4')).toEqual({ q: '', sort: 'best-match', page: 1 })
  })
})

describe('toQueryString', () => {
  it('omits default values', () => {
    expect(toQueryString({ q: 'react', sort: 'best-match', page: 1 })).toBe('?q=react')
    expect(toQueryString({ q: '', sort: 'stars', page: 3 })).toBe('')
  })

  it('round-trips through parseSearchState', () => {
    const state = { q: 'language:rust stars:>100 日本語', sort: 'updated', page: 7 } as const
    expect(parseSearchState(toQueryString(state))).toEqual(state)
  })
})

describe('lastPageFor', () => {
  it('counts partial pages', () => {
    expect(lastPageFor(0)).toBe(1)
    expect(lastPageFor(20)).toBe(1)
    expect(lastPageFor(21)).toBe(2)
  })

  it('stops at the 1,000 results the API exposes', () => {
    expect(lastPageFor(7_000_000)).toBe(MAX_PAGE)
    expect(lastPageFor(1000)).toBe(MAX_PAGE)
  })
})
