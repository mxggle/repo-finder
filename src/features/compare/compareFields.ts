import { formatDate, formatNumber, formatRelative } from '../../shared/lib/format'
import type { CompareEntry } from './selection'

/** Shown for any value GitHub did not provide, so a gap is never mistaken for zero or "no". */
export const UNKNOWN_TEXT = 'Unknown'
export const NO_TOPICS_TEXT = 'None listed'

export type CompareCell =
  | { kind: 'unknown' }
  | { kind: 'text'; text: string; title?: string; highest?: boolean }
  | { kind: 'language'; language: string }
  | { kind: 'time'; text: string; detail: string; iso: string }
  | { kind: 'topics'; topics: readonly string[] }

export type CompareFieldKey =
  | 'stars'
  | 'forks'
  | 'language'
  | 'license'
  | 'pushed'
  | 'archived'
  | 'description'
  | 'topics'
  | 'fetched'

export type CompareRow = {
  key: CompareFieldKey
  label: string
  cells: CompareCell[]
}

const UNKNOWN: CompareCell = { kind: 'unknown' }

/**
 * Marks the largest known value when at least two values are known and they differ.
 * Ties for the largest value are all marked; unknown values are never marked.
 */
export function highestValues(values: readonly (number | null)[]): boolean[] {
  const known = values.filter((value): value is number => value !== null)
  if (known.length < 2) return values.map(() => false)
  const max = Math.max(...known)
  if (known.every((value) => value === max)) return values.map(() => false)
  return values.map((value) => value === max)
}

function countCells(values: readonly (number | null)[]): CompareCell[] {
  const highest = highestValues(values)
  return values.map((value, index) =>
    value === null ? UNKNOWN : { kind: 'text', text: formatNumber(value), highest: highest[index] },
  )
}

function timeCell(date: Date | null, now: number): CompareCell {
  if (!date) return UNKNOWN
  return { kind: 'time', text: formatRelative(date, now), detail: formatDate(date), iso: date.toISOString() }
}

function textCell(value: string | null): CompareCell {
  return value === null ? UNKNOWN : { kind: 'text', text: value }
}

/** Builds one row per compared field, with one cell per entry in selection order. */
export function buildCompareRows(entries: readonly CompareEntry[], now = Date.now()): CompareRow[] {
  const repos = entries.map((entry) => entry.repo)
  return [
    { key: 'stars', label: 'Stars', cells: countCells(repos.map((repo) => repo.stars)) },
    { key: 'forks', label: 'Forks', cells: countCells(repos.map((repo) => repo.forks)) },
    {
      key: 'language',
      label: 'Language',
      cells: repos.map((repo) => (repo.language === null ? UNKNOWN : { kind: 'language', language: repo.language })),
    },
    { key: 'license', label: 'License', cells: repos.map((repo) => textCell(repo.license)) },
    { key: 'pushed', label: 'Last push', cells: repos.map((repo) => timeCell(repo.pushedAt, now)) },
    {
      key: 'archived',
      label: 'Archived',
      cells: repos.map((repo) => (repo.archived === null ? UNKNOWN : { kind: 'text', text: repo.archived ? 'Yes' : 'No' })),
    },
    { key: 'description', label: 'Description', cells: repos.map((repo) => textCell(repo.description)) },
    { key: 'topics', label: 'Topics', cells: repos.map((repo) => ({ kind: 'topics', topics: repo.topics })) },
    { key: 'fetched', label: 'Data fetched', cells: entries.map((entry) => timeCell(entry.fetchedAt, now)) },
  ]
}
