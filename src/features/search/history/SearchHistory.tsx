import { useLayoutEffect, useRef } from 'react'
import { isPlainClick } from '../../../shared/lib/links'
import { SORT_OPTIONS, toQueryString, type SearchState } from '../searchState'
import type { SearchHistoryEntry } from './historyStore'

type Props = {
  entries: SearchHistoryEntry[]
  onSelect: (state: SearchState) => void
  onRemove: (entry: SearchHistoryEntry) => void
  onClear: () => void
}

/** Removing the focused control would otherwise drop keyboard focus to the page start. */
function focusSearchField() {
  // The field rendered by SearchForm, directly above the history.
  document.getElementById('search-input')?.focus()
}

export function SearchHistory({ entries, onSelect, onRemove, onClear }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  // Position of a removed entry; its successor's Remove button receives focus.
  const removedIndex = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (removedIndex.current === null) return
    const buttons = listRef.current?.querySelectorAll('button')
    buttons?.[Math.min(removedIndex.current, buttons.length - 1)]?.focus()
    removedIndex.current = null
  })

  if (entries.length === 0) return null

  return (
    <details className="search-history">
      <summary className="search-history__summary">
        Recent searches <span className="search-history__count">({entries.length})</span>
      </summary>
      <div className="search-history__toolbar">
        <p>Saved in this browser.</p>
        <button
          className="search-history__action"
          type="button"
          onClick={() => {
            focusSearchField()
            onClear()
          }}
        >
          Clear all
        </button>
      </div>
      <ul className="search-history__list" aria-label="Recent searches" ref={listRef}>
        {entries.map((entry, index) => {
          const state: SearchState = { q: entry.q, sort: entry.sort, page: 1 }
          const sortLabel = SORT_OPTIONS.find((option) => option.value === entry.sort)!.label
          return (
            <li className="search-history__item" key={JSON.stringify([entry.q, entry.sort])}>
              <a
                className="search-history__link"
                href={toQueryString(state)}
                onClick={(event) => {
                  if (!isPlainClick(event)) return
                  event.preventDefault()
                  onSelect(state)
                }}
              >
                <span className="search-history__query">{entry.q}</span>{' '}
                <span className="search-history__sort">{sortLabel}</span>
              </a>
              <button
                className="search-history__action"
                type="button"
                aria-label={`Remove ${entry.q}, ${sortLabel} from history`}
                onClick={() => {
                  if (entries.length === 1) focusSearchField()
                  else removedIndex.current = index
                  onRemove(entry)
                }}
              >
                Remove
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
