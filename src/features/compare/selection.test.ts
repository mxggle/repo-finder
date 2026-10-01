import { describe, expect, it } from 'vitest'
import { makeRepository } from '../../test/fixtures'
import {
  COMPARE_LIMIT,
  describeSelectionChange,
  isBlocked,
  normalizeSelection,
  refreshSelection,
  removeFromSelection,
  toggleSelection,
  type CompareSelection,
} from './selection'

const earlier = new Date('2026-09-20T10:00:00.000Z')
const later = new Date('2026-09-20T10:05:00.000Z')

function select(ids: number[], fetchedAt = earlier): CompareSelection {
  return ids.map((id) => ({ repo: makeRepository(id), fetchedAt }))
}

const ids = (selection: CompareSelection) => selection.map((entry) => entry.repo.id)

describe('toggleSelection', () => {
  it('adds in selection order and removes a selected repository', () => {
    const one = toggleSelection([], makeRepository(1), earlier)
    expect(one.change).toBe('added')
    const two = toggleSelection(one.selection, makeRepository(2), earlier)
    expect(ids(two.selection)).toEqual([1, 2])
    const removed = toggleSelection(two.selection, makeRepository(1), later)
    expect(removed.change).toBe('removed')
    expect(ids(removed.selection)).toEqual([2])
  })

  it('treats the same id as the same repository, even from a different page object', () => {
    const selection = select([1])
    const again = toggleSelection(selection, makeRepository(1, { stargazers_count: 5 }), later)
    expect(again.change).toBe('removed')
    expect(again.selection).toEqual([])
  })

  it(`refuses a ${COMPARE_LIMIT + 1}th repository without changing the selection`, () => {
    const full = select([1, 2, 3])
    const result = toggleSelection(full, makeRepository(4), later)
    expect(result.change).toBe('blocked')
    expect(result.selection).toBe(full)
    expect(isBlocked(full, 4)).toBe(true)
    // Selected repositories can still be removed at the limit.
    expect(isBlocked(full, 2)).toBe(false)
  })
})

describe('removeFromSelection', () => {
  it('returns the same selection when the id is not selected', () => {
    const selection = select([1, 2])
    expect(removeFromSelection(selection, 9)).toBe(selection)
    expect(ids(removeFromSelection(selection, 1))).toEqual([2])
  })
})

describe('refreshSelection', () => {
  it('replaces a snapshot with data from a newer response, keeping order', () => {
    const selection = select([1, 2])
    const fresher = makeRepository(2, { stargazers_count: 99_999 })
    const next = refreshSelection(selection, [makeRepository(7), fresher], later)
    expect(ids(next)).toEqual([1, 2])
    expect(next[1]).toEqual({ repo: fresher, fetchedAt: later })
    expect(next[0]).toBe(selection[0])
  })

  it('ignores older or same-age data and returns the same selection', () => {
    const selection = select([1], later)
    expect(refreshSelection(selection, [makeRepository(1, { stargazers_count: 1 })], earlier)).toBe(selection)
    expect(refreshSelection(selection, [makeRepository(1, { stargazers_count: 1 })], later)).toBe(selection)
    expect(refreshSelection(selection, [makeRepository(5)], new Date('2026-09-21T00:00:00Z'))).toBe(selection)
  })
})

describe('normalizeSelection', () => {
  it('keeps one entry per id, the freshest snapshot, in first-selected position, capped at the limit', () => {
    const stale = { repo: makeRepository(1, { stargazers_count: 1 }), fetchedAt: earlier }
    const fresh = { repo: makeRepository(1, { stargazers_count: 2 }), fetchedAt: later }
    const result = normalizeSelection([stale, ...select([2]), fresh, ...select([3, 4, 5])])
    expect(ids(result)).toEqual([1, 2, 3])
    expect(result[0]).toBe(fresh)
  })
})

describe('describeSelectionChange', () => {
  it('describes each change with the running count', () => {
    expect(describeSelectionChange('added', 'a/b', 2)).toBe('Added a/b to comparison. 2 of 3 selected.')
    expect(describeSelectionChange('removed', 'a/b', 0)).toBe('Removed a/b from comparison. 0 of 3 selected.')
    expect(describeSelectionChange('blocked', 'a/b', 3)).toMatch(/not added\. You can compare up to 3 repositories/)
  })
})
