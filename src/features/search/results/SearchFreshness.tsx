import { GitHubApiError } from '../../../domain/repository'
import { useSecondsUntil } from './useSecondsUntil'

const timestamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

type Props = {
  fetchedAt: Date
  fetchStatus: 'fetching' | 'paused' | 'idle'
  error: unknown
  onRefresh: () => void
}

export function SearchFreshness({ fetchedAt, fetchStatus, error, onRefresh }: Props) {
  const retryAt = error instanceof GitHubApiError ? error.retryAt : null
  const seconds = useSecondsUntil(retryAt)
  const fetching = fetchStatus === 'fetching'
  const paused = fetchStatus === 'paused'
  const rateLimited = error instanceof GitHubApiError && error.kind === 'rate-limited'
  const message = paused
    ? 'You’re offline. Showing saved results; they will refresh when you reconnect.'
    : fetching
      ? 'Refreshing results…'
      : error
        ? rateLimited
          ? 'Search limit reached. Showing saved results.'
          : 'Couldn’t refresh. Showing saved results.'
        : null

  return (
    <div className="search-freshness">
      <div className="search-freshness__details">
        <p>
          Results fetched{' '}
          <time dateTime={fetchedAt.toISOString()} title={fetchedAt.toLocaleString('en')}>
            {timestamp.format(fetchedAt)}
          </time>
        </p>
        {message && <p className="search-freshness__message" role="status">{message}</p>}
      </div>
      <button
        className="button search-freshness__refresh"
        type="button"
        onClick={onRefresh}
        disabled={fetching || paused || seconds > 0}
      >
        {fetching ? 'Refreshing…' : seconds > 0 ? `Refresh in ${seconds}s` : 'Refresh results'}
      </button>
    </div>
  )
}
