import { parseSearchResponse, type Repository } from '../../domain/repository'
import { COMPARE_LIMIT, normalizeSelection, type CompareEntry, type CompareSelection } from './selection'

export const COMPARE_SELECTION_KEY = 'repo-finder:compare-selection:v1'
const STORED_SELECTION_LIMIT = 64 * 1024
const VERSION = 1

/** Stores repositories in the GitHub response shape so restoring reuses the domain parser. */
function toResponseItem(repo: Repository) {
  return {
    id: repo.id,
    full_name: repo.fullName,
    owner: { login: repo.owner.login, avatar_url: repo.owner.avatarUrl },
    html_url: repo.url,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stars,
    forks_count: repo.forks,
    topics: repo.topics,
    license: repo.license === null ? null : { name: repo.license },
    updated_at: repo.updatedAt?.toISOString() ?? null,
    pushed_at: repo.pushedAt?.toISOString() ?? null,
    archived: repo.archived,
    fork: repo.fork,
  }
}

function restoreEntry(value: unknown): CompareEntry | undefined {
  if (!value || typeof value !== 'object' || !('fetchedAt' in value) || !('repo' in value)) return undefined
  if (typeof value.fetchedAt !== 'string') return undefined
  const fetchedAt = new Date(value.fetchedAt)
  if (Number.isNaN(fetchedAt.getTime())) return undefined
  try {
    // The same validation as a network response: safe ids, GitHub-only links, typed fields.
    const parsed = parseSearchResponse({ total_count: 1, incomplete_results: false, items: [value.repo] }, 1, fetchedAt)
    return parsed.items.length === 1 ? { repo: parsed.items[0], fetchedAt } : undefined
  } catch {
    return undefined
  }
}

/** Untrusted storage is bounded, versioned, validated, deduplicated, and capped at the limit. */
export function parseCompareSelection(raw: string | null): CompareSelection {
  if (!raw || raw.length > STORED_SELECTION_LIMIT) return []
  try {
    const stored: unknown = JSON.parse(raw)
    if (!stored || typeof stored !== 'object' || !('version' in stored) || stored.version !== VERSION) return []
    if (!('items' in stored) || !Array.isArray(stored.items) || stored.items.length > COMPARE_LIMIT) return []
    const entries: CompareEntry[] = []
    for (const item of stored.items) {
      const entry = restoreEntry(item)
      if (entry) entries.push(entry)
    }
    return normalizeSelection(entries)
  } catch {
    return []
  }
}

export function serializeCompareSelection(selection: CompareSelection): string {
  return JSON.stringify({
    version: VERSION,
    items: selection.map((entry) => ({ fetchedAt: entry.fetchedAt.toISOString(), repo: toResponseItem(entry.repo) })),
  })
}

export function readCompareSelection(): CompareSelection {
  try {
    return parseCompareSelection(window.sessionStorage.getItem(COMPARE_SELECTION_KEY))
  } catch {
    return []
  }
}

/** Storage failures keep the in-memory selection; they never block comparing. */
export function writeCompareSelection(selection: CompareSelection): void {
  try {
    const encoded = serializeCompareSelection(selection)
    if (selection.length === 0 || encoded.length > STORED_SELECTION_LIMIT) {
      window.sessionStorage.removeItem(COMPARE_SELECTION_KEY)
    } else {
      window.sessionStorage.setItem(COMPARE_SELECTION_KEY, encoded)
    }
  } catch {
    // Blocked or full storage: the selection still works for this page view.
  }
}
