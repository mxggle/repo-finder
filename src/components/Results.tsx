import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useRepoSearch } from '../hooks/useRepoSearch'
import { formatNumber } from '../lib/format'
import { isPlainClick } from '../lib/links'
import {
  MAX_ACCESSIBLE_RESULTS,
  PER_PAGE,
  SORT_OPTIONS,
  lastPageFor,
  toQueryString,
  type SearchState,
  type SortKey,
} from '../lib/searchState'
import { Pagination } from './Pagination'
import { RepoCard } from './RepoCard'
import { ErrorPanel, StatusPanel } from './StatusPanel'

type Props = {
  state: SearchState
  onNavigate: (next: SearchState) => void
}

function Skeleton() {
  return (
    <ul className="repo-list" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="repo-card repo-card--skeleton">
          <span className="repo-card__header">
            <span className="skeleton skeleton--avatar" />
            <span className="skeleton skeleton--title" />
          </span>
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line skeleton--short" />
          <span className="skeleton skeleton--meta" />
        </li>
      ))}
    </ul>
  )
}

export function Results({ state, onNavigate }: Props) {
  const { data, error, errorUpdatedAt, isPending, isError, isPlaceholderData, fetchStatus, refetch } =
    useRepoSearch(state)
  const headingRef = useRef<HTMLHeadingElement>(null)

  function goToPage(page: number) {
    onNavigate({ ...state, page })
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView({ block: 'start' })
  }

  const hrefFor = (page: number) => toQueryString({ ...state, page }) || '?'

  let status: string
  let body: ReactNode

  if (isError) {
    status = 'Search failed.'
    body = <ErrorPanel key={errorUpdatedAt} error={error} onRetry={() => void refetch()} />
  } else if (isPending && fetchStatus === 'paused') {
    status = 'You are offline.'
    body = (
      <StatusPanel title="You’re offline">
        <p>The search will run automatically when your connection is back.</p>
      </StatusPanel>
    )
  } else if (isPending) {
    status = 'Loading results…'
    body = <Skeleton />
  } else if (data.totalCount === 0) {
    status = 'No repositories found.'
    body = (
      <StatusPanel title={`No repositories match “${state.q}”`}>
        <p>Try fewer or different keywords, or remove some qualifiers.</p>
      </StatusPanel>
    )
  } else {
    const last = lastPageFor(data.totalCount)
    // While another page loads, describe the items actually on screen.
    const first = (data.page - 1) * PER_PAGE + 1
    const beyondEnd = state.page > last
    // GitHub's total_count is an estimate and can promise more pages than it serves.
    const emptyPage = !isPlaceholderData && data.items.length === 0 && data.skippedCount === 0

    if (beyondEnd || emptyPage) {
      const target = Math.max(1, Math.min(last, state.page - 1))
      status = 'No results on this page.'
      body = (
        <StatusPanel title={beyondEnd ? `Page ${state.page} doesn’t exist` : `No results on page ${state.page}`}>
          <p>
            {beyondEnd
              ? `This search has ${last === 1 ? 'only one page' : `${last} pages`} of results.`
              : 'GitHub reported more matches than it returned for this search.'}
          </p>
          <a
            className="button"
            href={hrefFor(target)}
            onClick={(event) => {
              if (!isPlainClick(event)) return
              event.preventDefault()
              goToPage(target)
            }}
          >
            Go to page {target}
          </a>
        </StatusPanel>
      )
    } else {
      const range = `${formatNumber(first)}–${formatNumber(first + data.items.length - 1)}`
      status = isPlaceholderData
        ? 'Loading results…'
        : `${formatNumber(data.totalCount)} repositories found. Showing ${range}, page ${state.page} of ${last}.`

      body = (
        <>
          <div className="results__toolbar">
            <h2 className="results__heading" ref={headingRef} tabIndex={-1}>
              {formatNumber(data.totalCount)} {data.totalCount === 1 ? 'repository' : 'repositories'} for “{state.q}”
              <span className="results__range">
                <span className="results__separator"> · </span>showing {range}
              </span>
            </h2>
            <label className="sort-control">
              <span>Sort</span>
              <select
                value={state.sort}
                onChange={(event) => onNavigate({ ...state, sort: event.target.value as SortKey, page: 1 })}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {data.incompleteResults && (
            <p className="notice">GitHub stopped this search early, so some matching repositories may be missing.</p>
          )}
          {data.skippedCount > 0 && (
            <p className="notice">
              {data.skippedCount === 1 ? '1 result' : `${data.skippedCount} results`} could not be shown because
              GitHub returned incomplete data.
            </p>
          )}

          <ul className="repo-list" aria-busy={isPlaceholderData}>
            {data.items.map((repo, index) => (
              <li key={repo.id} style={{ '--i': index } as CSSProperties}>
                <RepoCard repo={repo} />
              </li>
            ))}
          </ul>

          <Pagination current={state.page} last={last} hrefFor={hrefFor} onChange={goToPage} />

          {data.totalCount > MAX_ACCESSIBLE_RESULTS && (
            <p className="results__footnote">
              GitHub’s search API only returns the first {formatNumber(MAX_ACCESSIBLE_RESULTS)} matches. Add keywords
              or qualifiers to narrow the search.
            </p>
          )}
        </>
      )
    }
  }

  return (
    <section className="results" aria-label={`Results for ${state.q}`} data-loading={isPlaceholderData || undefined}>
      <p className="visually-hidden" role="status">
        {status}
      </p>
      {body}
    </section>
  )
}
