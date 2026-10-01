import { useEffect, useId, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { Repository } from '../../../domain/repository'
import { useRepoSearch } from '../useRepoSearch'
import { formatCompact, formatNumber } from '../../../shared/lib/format'
import { isPlainClick } from '../../../shared/lib/links'
import {
  MAX_ACCESSIBLE_RESULTS,
  PER_PAGE,
  SORT_OPTIONS,
  lastPageFor,
  toQueryString,
  type SearchState,
  type SortKey,
} from '../searchState'
import { Pagination } from './Pagination'
import { RepoCard } from './RepoCard'
import { ErrorPanel, StatusPanel } from './StatusPanel'
import { SearchFreshness } from './SearchFreshness'
import { narrowingSuggestions } from './narrowing'

type Props = {
  state: SearchState
  onNavigate: (next: SearchState) => void
  /** Extra controls placed in each repository card, such as a compare toggle. */
  renderCardActions?: (repo: Repository, fetchedAt: Date) => ReactNode
  /** Rendered at the end of the results section, for example a sticky selection tray. */
  footer?: ReactNode
  /** Attached to the results heading, so composed controls can return focus to it. */
  headingRef?: RefObject<HTMLHeadingElement | null>
  /** Called with each settled response, never with placeholder data from another page or sort. */
  onResults?: (items: readonly Repository[], fetchedAt: Date) => void
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

export function Results({ state, onNavigate, renderCardActions, footer, headingRef: externalHeadingRef, onResults }: Props) {
  const { data, error, errorUpdatedAt, isPending, isError, isPlaceholderData, fetchStatus, refetch } =
    useRepoSearch(state)
  const ownHeadingRef = useRef<HTMLHeadingElement>(null)
  const headingRef = externalHeadingRef ?? ownHeadingRef
  const narrowHintId = useId()
  // Set when a narrowing link starts a new search; the heading takes focus once it is back.
  const focusHeadingOnLoad = useRef(false)

  useEffect(() => {
    if (data && !isPlaceholderData) onResults?.(data.items, data.fetchedAt)
  }, [data, isPlaceholderData, onResults])

  useEffect(() => {
    if (!focusHeadingOnLoad.current || (!data && !isError)) return
    focusHeadingOnLoad.current = false
    headingRef.current?.focus({ preventScroll: true })
  }, [data, isError, headingRef])

  function goToPage(page: number) {
    onNavigate({ ...state, page })
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView({ block: 'start' })
  }

  const hrefFor = (page: number) => toQueryString({ ...state, page }) || '?'

  function narrowTo(q: string) {
    focusHeadingOnLoad.current = true
    onNavigate({ ...state, q, page: 1 })
  }

  let status: string
  let body: ReactNode

  if (isError && !data) {
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
  } else if (!data) {
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
    // A timed-out search only loses matches the user could reach when every match is browsable;
    // beyond the cap the count is merely approximate and the footnote already suggests narrowing.
    const browsable = data.totalCount <= MAX_ACCESSIBLE_RESULTS
    const countPrefix = data.incompleteResults ? 'About ' : ''
    // Beyond the cap the count is GitHub's estimate; the exact figure stays in the tooltip.
    const count = browsable ? formatNumber(data.totalCount) : formatCompact(data.totalCount)

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
      const suggestions = browsable ? [] : narrowingSuggestions(state.q, data.items)
      const range = `${formatNumber(first)}–${formatNumber(first + data.items.length - 1)}`
      status = isPlaceholderData
        ? 'Loading results…'
        : `${countPrefix}${formatNumber(data.totalCount)} repositories found. Showing ${range}, page ${state.page} of ${last}.`

      body = (
        <>
          <div className="results__toolbar">
            <h2 className="results__heading" ref={headingRef} tabIndex={-1}>
              {countPrefix}
              <span className="results__count" title={browsable ? undefined : formatNumber(data.totalCount)}>
                {count}
              </span>{' '}
              {data.totalCount === 1 ? 'repository' : 'repositories'} for “{state.q}”
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

          {!browsable && (
            <div className="results__narrow">
              <p id={narrowHintId}>
                GitHub only returns the first {formatNumber(MAX_ACCESSIBLE_RESULTS)} matches.{' '}
                {suggestions.length ? 'Narrow the search:' : 'Add keywords or qualifiers to narrow the search.'}
              </p>
              {suggestions.length > 0 && (
                <ul className="results__narrow-list" aria-labelledby={narrowHintId}>
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.token}>
                      <a
                        className="chip"
                        href={toQueryString({ ...state, q: suggestion.query, page: 1 })}
                        aria-label={`Search with ${suggestion.token}`}
                        onClick={(event) => {
                          if (!isPlainClick(event)) return
                          event.preventDefault()
                          narrowTo(suggestion.query)
                        }}
                      >
                        <span aria-hidden="true">+</span>
                        {suggestion.token}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {data.incompleteResults && browsable && (
            <p className="notice">
              GitHub timed out before finishing this search, so some matching repositories may be missing. Refresh
              to try again.
            </p>
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
                <RepoCard repo={repo} actions={renderCardActions?.(repo, data.fetchedAt)} />
              </li>
            ))}
          </ul>

          <Pagination current={state.page} last={last} hrefFor={hrefFor} onChange={goToPage} />
        </>
      )
    }
  }

  return (
    <section className="results" aria-label={`Results for ${state.q}`} data-loading={isPlaceholderData || undefined}>
      <p className="visually-hidden" role="status">
        {status}
      </p>
      {data && !isPlaceholderData && (
        <SearchFreshness
          key={errorUpdatedAt}
          fetchedAt={data.fetchedAt}
          fetchStatus={fetchStatus}
          error={isError ? error : null}
          onRefresh={() => void refetch({ cancelRefetch: false })}
        />
      )}
      {body}
      {footer}
    </section>
  )
}
