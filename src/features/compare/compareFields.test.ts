import { describe, expect, it } from 'vitest'
import { makeRepository } from '../../test/fixtures'
import { buildCompareRows, highestValues, type CompareRow } from './compareFields'

const fetchedAt = new Date('2026-09-20T10:00:00.000Z')
const now = Date.parse('2026-09-30T10:00:00.000Z')

const row = (rows: CompareRow[], key: CompareRow['key']) => rows.find((candidate) => candidate.key === key)!

describe('highestValues', () => {
  it('marks the largest known value, including ties', () => {
    expect(highestValues([10, 30, null])).toEqual([false, true, false])
    expect(highestValues([30, 30, 5])).toEqual([true, true, false])
  })

  it('marks nothing when values are equal or fewer than two are known', () => {
    expect(highestValues([7, 7])).toEqual([false, false])
    expect(highestValues([7, null])).toEqual([false, false])
    expect(highestValues([null, null])).toEqual([false, false])
  })
})

describe('buildCompareRows', () => {
  it('lists the compared fields in a fixed order, one cell per repository', () => {
    const rows = buildCompareRows([{ repo: makeRepository(1), fetchedAt }, { repo: makeRepository(2), fetchedAt }], now)
    expect(rows.map((candidate) => candidate.label)).toEqual([
      'Stars',
      'Forks',
      'Language',
      'License',
      'Last push',
      'Archived',
      'Description',
      'Topics',
      'Data fetched',
    ])
    expect(rows.every((candidate) => candidate.cells.length === 2)).toBe(true)
  })

  it('formats known values and uses the push time rather than the update time', () => {
    const repo = makeRepository(1, {
      stargazers_count: 12_345,
      archived: true,
      updated_at: '2026-09-29T10:00:00Z',
      pushed_at: '2026-09-23T10:00:00Z',
    })
    const rows = buildCompareRows([{ repo, fetchedAt }, { repo: makeRepository(2), fetchedAt }], now)
    expect(row(rows, 'stars').cells[0]).toEqual({ kind: 'text', text: '12,345', highest: true })
    expect(row(rows, 'stars').cells[1]).toEqual({ kind: 'text', text: '1,002', highest: false })
    expect(row(rows, 'license').cells[0]).toEqual({ kind: 'text', text: 'MIT' })
    expect(row(rows, 'language').cells[0]).toEqual({ kind: 'language', language: 'TypeScript' })
    expect(row(rows, 'archived').cells).toEqual([
      { kind: 'text', text: 'Yes' },
      { kind: 'text', text: 'No' },
    ])
    expect(row(rows, 'pushed').cells[0]).toEqual({
      kind: 'time',
      text: '7 days ago',
      detail: 'Sep 23, 2026',
      iso: '2026-09-23T10:00:00.000Z',
    })
    expect(row(rows, 'fetched').cells[0]).toMatchObject({ kind: 'time', text: '10 days ago' })
  })

  it('shows missing values as unknown instead of zero, false, or empty', () => {
    const repo = makeRepository(1, {
      stargazers_count: undefined,
      forks_count: 'many',
      language: null,
      license: null,
      pushed_at: null,
      archived: undefined,
      description: '   ',
      topics: [],
    })
    const rows = buildCompareRows([{ repo, fetchedAt }], now)
    for (const key of ['stars', 'forks', 'language', 'license', 'pushed', 'archived', 'description'] as const) {
      expect(row(rows, key).cells[0], key).toEqual({ kind: 'unknown' })
    }
    expect(row(rows, 'topics').cells[0]).toEqual({ kind: 'topics', topics: [] })
  })
})
