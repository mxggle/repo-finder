import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeRepository } from '../../test/fixtures'
import type { CompareSelection } from './selection'
import {
  COMPARE_SELECTION_KEY,
  parseCompareSelection,
  readCompareSelection,
  serializeCompareSelection,
  writeCompareSelection,
} from './selectionStore'

const fetchedAt = new Date('2026-09-20T10:00:00.000Z')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('compare selection storage', () => {
  it('round-trips repositories and their fetch times, including unknown values', () => {
    const selection: CompareSelection = [
      { repo: makeRepository(1), fetchedAt },
      {
        repo: makeRepository(2, { stargazers_count: null, license: null, pushed_at: null, archived: null, topics: [] }),
        fetchedAt: new Date('2026-09-20T10:03:00.000Z'),
      },
    ]
    writeCompareSelection(selection)
    expect(readCompareSelection()).toEqual(selection)
  })

  it('removes the key when the selection is empty', () => {
    writeCompareSelection([{ repo: makeRepository(1), fetchedAt }])
    writeCompareSelection([])
    expect(window.sessionStorage.getItem(COMPARE_SELECTION_KEY)).toBeNull()
  })

  it('rejects corrupt, oversized, wrong-version, and over-limit snapshots', () => {
    expect(parseCompareSelection('{')).toEqual([])
    expect(parseCompareSelection('x'.repeat(70_000))).toEqual([])
    expect(parseCompareSelection(JSON.stringify({ version: 2, items: [] }))).toEqual([])
    const four = [1, 2, 3, 4].map((id) => ({ repo: makeRepository(id), fetchedAt }))
    expect(parseCompareSelection(serializeCompareSelection(four))).toEqual([])
  })

  it('drops invalid entries and deduplicates by id, keeping the freshest snapshot', () => {
    const stored = JSON.parse(serializeCompareSelection([
      { repo: makeRepository(1, { stargazers_count: 1 }), fetchedAt },
      { repo: makeRepository(1, { stargazers_count: 2 }), fetchedAt: new Date('2026-09-20T11:00:00.000Z') },
    ]))
    stored.items.push({ fetchedAt: fetchedAt.toISOString(), repo: { ...stored.items[0].repo, id: 3, html_url: 'javascript:alert(1)' } })
    const restored = parseCompareSelection(JSON.stringify(stored))
    expect(restored).toHaveLength(1)
    expect(restored[0].repo.stars).toBe(2)

    stored.items = [{ fetchedAt: 'yesterday', repo: stored.items[0].repo }]
    expect(parseCompareSelection(JSON.stringify(stored))).toEqual([])
  })

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(readCompareSelection()).toEqual([])
    expect(() => writeCompareSelection([{ repo: makeRepository(1), fetchedAt }])).not.toThrow()
  })
})
