import { useEffect, useState, type ReactNode } from 'react'
import { GitHubApiError } from '../api/github'
import { AlertIcon, SearchIcon } from './icons'

type PanelProps = {
  tone?: 'neutral' | 'error'
  title: string
  children?: ReactNode
  action?: ReactNode
}

export function StatusPanel({ tone = 'neutral', title, children, action }: PanelProps) {
  return (
    <div className={`status-panel status-panel--${tone}`}>
      <span className="status-panel__icon">
        {tone === 'error' ? <AlertIcon size={22} /> : <SearchIcon size={22} />}
      </span>
      <h2 className="status-panel__title">{title}</h2>
      {children}
      {action && <div className="status-panel__action">{action}</div>}
    </div>
  )
}

function useSecondsUntil(target: Date | null): number {
  const [now, setNow] = useState(() => Date.now())
  const remaining = target ? Math.max(0, Math.ceil((target.getTime() - now) / 1000)) : 0

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [remaining])

  return remaining
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const kind = error instanceof GitHubApiError ? error.kind : 'unexpected-response'
  const retryAt = error instanceof GitHubApiError ? error.retryAt : null
  const seconds = useSecondsUntil(retryAt)

  const retry = (
    <button className="button" type="button" onClick={onRetry} disabled={seconds > 0}>
      {seconds > 0 ? `Try again in ${seconds}s` : 'Try again'}
    </button>
  )

  switch (kind) {
    case 'rate-limited':
      return (
        <StatusPanel tone="error" title="Search limit reached" action={retry}>
          <p>
            GitHub allows a limited number of searches per minute without signing in.{' '}
            {seconds > 0 ? 'You can search again shortly.' : 'You can search again now.'}
          </p>
        </StatusPanel>
      )
    case 'invalid-query':
      return (
        <StatusPanel tone="error" title="GitHub couldn’t run this search">
          {error instanceof Error && error.message && <p className="status-panel__detail">{error.message}</p>}
          <p>
            Check the query syntax (for example <code>stars:&gt;100</code>) and keep it under 256 characters
            with at most five AND, OR or NOT operators.
          </p>
        </StatusPanel>
      )
    case 'network':
      return (
        <StatusPanel tone="error" title="Can’t reach GitHub" action={retry}>
          <p>Check your internet connection and try again.</p>
        </StatusPanel>
      )
    case 'unavailable':
      return (
        <StatusPanel tone="error" title="GitHub search is unavailable" action={retry}>
          <p>GitHub is having trouble answering right now. Please try again in a moment.</p>
        </StatusPanel>
      )
    default:
      return (
        <StatusPanel tone="error" title="Something went wrong" action={retry}>
          <p>GitHub returned a response this app could not read.</p>
        </StatusPanel>
      )
  }
}
