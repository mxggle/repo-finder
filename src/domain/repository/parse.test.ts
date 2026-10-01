import { describe, expect, it } from 'vitest'
import { makeRepo } from '../../test/fixtures'
import { GitHubApiError } from './errors'
import { parseSearchResponse } from './parse'

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

  describe('optional repository metadata', () => {
    const parseOne = (overrides: Record<string, unknown>) =>
      parseSearchResponse({ total_count: 1, incomplete_results: false, items: [makeRepo(1, overrides)] }).items[0]

    it('parses pushed_at into pushedAt, distinct from updatedAt', () => {
      const repo = parseOne({ updated_at: '2026-09-01T12:00:00Z', pushed_at: '2026-09-15T08:30:00Z' })

      expect(repo.pushedAt).toEqual(new Date('2026-09-15T08:30:00Z'))
      expect(repo.updatedAt).toEqual(new Date('2026-09-01T12:00:00Z'))
    })

    it.each([
      ['missing', undefined],
      ['null', null],
      ['not a date', 'last tuesday'],
      ['not a string', 12345],
    ])('treats a pushed_at that is %s as unknown', (_label, value) => {
      expect(parseOne({ pushed_at: value }).pushedAt).toBeNull()
    })

    it('keeps actual zero counts as zero', () => {
      expect(parseOne({ stargazers_count: 0, forks_count: 0 })).toMatchObject({ stars: 0, forks: 0 })
    })

    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', '12'],
      ['negative', -1],
      ['fractional', 1.5],
      ['NaN-like', 'NaN'],
      ['beyond the safe integer range', Number.MAX_SAFE_INTEGER + 2],
    ])('treats stargazers_count and forks_count that are %s as unknown, not zero', (_label, value) => {
      const repo = parseOne({ stargazers_count: value, forks_count: value })
      expect(repo.stars).toBeNull()
      expect(repo.forks).toBeNull()
    })

    it('treats each count independently', () => {
      expect(parseOne({ stargazers_count: 'lots', forks_count: 7 })).toMatchObject({ stars: null, forks: 7 })
    })

    it('keeps false archived and fork flags as false', () => {
      expect(parseOne({ archived: false, fork: false })).toMatchObject({ archived: false, fork: false })
      expect(parseOne({ archived: true, fork: true })).toMatchObject({ archived: true, fork: true })
    })

    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', 'false'],
      ['a number', 0],
    ])('treats archived and fork that are %s as unknown, not false', (_label, value) => {
      const repo = parseOne({ archived: value, fork: value })
      expect(repo.archived).toBeNull()
      expect(repo.fork).toBeNull()
    })

    it('keeps the item when only optional metadata is invalid', () => {
      const result = parseSearchResponse({
        total_count: 1,
        incomplete_results: false,
        items: [makeRepo(1, { stargazers_count: 'x', forks_count: null, archived: 'yes', pushed_at: 7 })],
      })
      expect(result.items).toHaveLength(1)
      expect(result.skippedCount).toBe(0)
    })
  })

  describe('fetchedAt', () => {
    const body = { total_count: 0, incomplete_results: false, items: [] }

    it('is set on the result', () => {
      const before = Date.now()
      const result = parseSearchResponse(body)
      expect(result.fetchedAt).toBeInstanceOf(Date)
      expect(result.fetchedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(result.fetchedAt.getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('uses the time it was given', () => {
      const at = new Date('2026-09-20T10:00:00Z')
      expect(parseSearchResponse(body, 1, at).fetchedAt).toBe(at)
    })
  })

  describe('unsafe repository ids', () => {
    it.each([
      ['zero', 0],
      ['negative', -4],
      ['fractional', 1.5],
      ['beyond the safe integer range', Number.MAX_SAFE_INTEGER + 2],
      ['a string', '7'],
      ['null', null],
    ])('skips an item whose id is %s and counts it', (_label, id) => {
      const result = parseSearchResponse({
        total_count: 2,
        incomplete_results: false,
        items: [makeRepo(1), makeRepo(2, { id })],
      })

      expect(result.items.map((item) => item.id)).toEqual([1])
      expect(result.skippedCount).toBe(1)
    })
  })

  it.each([
    ['another host', 'https://example.com/octo-org/project-1'],
    ['http', 'http://github.com/octo-org/project-1'],
    ['embedded credentials', 'https://user:pass@github.com/octo-org/project-1'],
  ])('skips an item whose html_url has %s', (_label, html_url) => {
    const result = parseSearchResponse({
      total_count: 1,
      incomplete_results: false,
      items: [makeRepo(1, { html_url })],
    })
    expect(result.items).toEqual([])
    expect(result.skippedCount).toBe(1)
  })
})

