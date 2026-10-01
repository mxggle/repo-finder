import type { Repository } from '../../domain/repository'

/** The most repositories a comparison can hold. */
export const COMPARE_LIMIT = 3
/** A comparison needs at least this many repositories. */
export const COMPARE_MINIMUM = 2

/**
 * A repository snapshot taken from a search result, with that result's fetch time.
 * Snapshots are kept because a selected repository may not be on the current page.
 */
export type CompareEntry = {
  repo: Repository
  fetchedAt: Date
}

/** Selected repositories in the order they were selected; ids are unique. */
export type CompareSelection = readonly CompareEntry[]

export type SelectionChange = 'added' | 'removed' | 'blocked'

export const EMPTY_SELECTION: CompareSelection = []

export function isSelected(selection: CompareSelection, id: number): boolean {
  return selection.some((entry) => entry.repo.id === id)
}

export function isAtLimit(selection: CompareSelection): boolean {
  return selection.length >= COMPARE_LIMIT
}

/** Whether toggling this repository would be refused by the limit. */
export function isBlocked(selection: CompareSelection, id: number): boolean {
  return isAtLimit(selection) && !isSelected(selection, id)
}

/** Adds an unselected repository, removes a selected one, or refuses when the limit is reached. */
export function toggleSelection(
  selection: CompareSelection,
  repo: Repository,
  fetchedAt: Date,
): { selection: CompareSelection; change: SelectionChange } {
  if (isSelected(selection, repo.id)) {
    return { selection: removeFromSelection(selection, repo.id), change: 'removed' }
  }
  if (isAtLimit(selection)) return { selection, change: 'blocked' }
  return { selection: [...selection, { repo, fetchedAt }], change: 'added' }
}

export function removeFromSelection(selection: CompareSelection, id: number): CompareSelection {
  return isSelected(selection, id) ? selection.filter((entry) => entry.repo.id !== id) : selection
}

/**
 * Replaces snapshots with data from a strictly newer response, keeping selection order.
 * Older or same-age data (for example a stale cached page) never overwrites a snapshot.
 * Returns the same selection when nothing changes, so callers can skip a state update.
 */
export function refreshSelection(
  selection: CompareSelection,
  repos: readonly Repository[],
  fetchedAt: Date,
): CompareSelection {
  let changed = false
  const next = selection.map((entry) => {
    if (fetchedAt.getTime() <= entry.fetchedAt.getTime()) return entry
    const repo = repos.find((candidate) => candidate.id === entry.repo.id)
    if (!repo) return entry
    changed = true
    return { repo, fetchedAt }
  })
  return changed ? next : selection
}

/**
 * Makes untrusted entries a valid selection: one entry per repository id (the freshest
 * snapshot, at the position it was first selected) and no more than the limit.
 */
export function normalizeSelection(entries: readonly CompareEntry[]): CompareSelection {
  const result: CompareEntry[] = []
  for (const entry of entries) {
    const index = result.findIndex((candidate) => candidate.repo.id === entry.repo.id)
    if (index === -1) result.push(entry)
    else if (entry.fetchedAt.getTime() > result[index].fetchedAt.getTime()) result[index] = entry
  }
  return result.slice(0, COMPARE_LIMIT)
}

export function selectedCountText(count: number): string {
  return `${count} of ${COMPARE_LIMIT} selected`
}

export const LIMIT_MESSAGE = `You can compare up to ${COMPARE_LIMIT} repositories. Remove one to add another.`

/** Screen reader announcement for a selection change. */
export function describeSelectionChange(change: SelectionChange, fullName: string, count: number): string {
  switch (change) {
    case 'added':
      return `Added ${fullName} to comparison. ${selectedCountText(count)}.`
    case 'removed':
      return `Removed ${fullName} from comparison. ${selectedCountText(count)}.`
    case 'blocked':
      return `${fullName} was not added. ${LIMIT_MESSAGE}`
  }
}
