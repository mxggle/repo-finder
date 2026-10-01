import type { Repository } from '../../../domain/repository'
import { parseFilters, setExcludeArchived, setLanguage, setMinStars } from '../form/queryFilters'

/** A one-click refinement for a search with more matches than GitHub will return. */
export type Narrowing = {
  /** The qualifier added to the query, e.g. `language:python`. */
  token: string
  /** The full query to search instead. */
  query: string
}

const MAX_LANGUAGES = 3
const MIN_STARS = 100

/** The most common languages on screen, in order of frequency, then first appearance. */
function topLanguages(items: readonly Repository[]): string[] {
  const counts = new Map<string, number>()
  for (const { language } of items) if (language) counts.set(language, (counts.get(language) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_LANGUAGES).map(([language]) => language)
}

function narrowing(query: string, next: string): Narrowing | null {
  // Suggestions only ever append a qualifier, so the new text is the query's tail.
  return next === query ? null : { token: next.slice(query.length).trim(), query: next }
}

/**
 * Suggests qualifiers to add, using only the supported filters the query does not already set
 * and the languages of the results already returned. Locked or present filters are left alone.
 */
export function narrowingSuggestions(query: string, items: readonly Repository[]): Narrowing[] {
  const filters = parseFilters(query)
  const suggestions: (Narrowing | null)[] = []
  if (filters.language.status === 'absent') {
    for (const language of topLanguages(items)) suggestions.push(narrowing(query, setLanguage(query, language)))
  }
  if (filters.stars.status === 'absent') suggestions.push(narrowing(query, setMinStars(query, MIN_STARS)))
  if (filters.archived.status === 'absent') suggestions.push(narrowing(query, setExcludeArchived(query, true)))
  return suggestions.filter((suggestion) => suggestion !== null)
}
