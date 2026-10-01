import { useEffect, useRef, type MouseEvent } from 'react'
import {
  Results,
  SearchForm,
  SearchHistory,
  useSearchHistory,
  useSearchState,
  EMPTY_SEARCH,
  toQueryString,
  type SearchState,
} from '../features/search'
import { CompareToggle, CompareTray, useCompareSelection } from '../features/compare'
import { isPlainClick } from '../shared/lib/links'
import { withViewTransition } from '../shared/lib/viewTransition'
import { ThemeSwitcher } from './ThemeSwitcher'

const EXAMPLES = ['react', 'language:rust stars:>5000', 'topic:cli language:go', 'vite plugin']

export function SearchPage() {
  const [state, navigate] = useSearchState()
  const { entries, record, remove, clear } = useSearchHistory()
  // The selection outlives result pages and queries, so the page owns it rather than Results.
  const compare = useCompareSelection()
  // The tray returns focus here when it disappears under the keyboard.
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    record({ q: state.q, sort: state.sort, page: 1 })
  }, [state.q, state.sort, record])

  useEffect(() => {
    document.title = state.q ? `${state.q} · Repo Finder` : 'Repo Finder'
  }, [state.q])

  // Form and history actions apply immediately. A deferred animation update could
  // otherwise replace text the user has already typed for their next search.
  function go(next: SearchState, animate = true) {
    // An explicit repeat search has no URL change to trigger the history effect.
    if (next.q === state.q && next.sort === state.sort) record(next)
    if (!animate || Boolean(next.q) === Boolean(state.q)) navigate(next)
    else withViewTransition(() => navigate(next))
  }

  function searchFor(q: string) {
    // A new query always starts from the first page with the current sort.
    go({ ...state, q, page: 1 }, false)
  }

  function exampleLink(q: string) {
    return {
      href: toQueryString({ ...EMPTY_SEARCH, q }),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        go({ ...EMPTY_SEARCH, q })
      },
    }
  }

  return (
    <div className={state.q ? 'app' : 'app app--landing'}>
      <header className="site-header">
        <a
          className="site-header__brand"
          href="./"
          onClick={(event) => {
            if (!isPlainClick(event)) return
            event.preventDefault()
            go(EMPTY_SEARCH)
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28">
            <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
            <path
              d="m7.5 9 3 3-3 3"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path className="site-header__cursor" d="M13 15h3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Repo Finder
        </a>
        <ThemeSwitcher />
      </header>

      <main className="main">
        {!state.q && (
          <div className="intro">
            <p className="intro__eyebrow" aria-hidden="true">
              <span>$</span>gh search repos
            </p>
            <h1 className="intro__title">
              Find your next dependency.
              <span className="intro__cursor" aria-hidden="true" />
            </h1>
            <p className="intro__lead">
              Search public GitHub repositories by keyword, language, stars, and topics.
            </p>
          </div>
        )}
        {state.q && <h1 className="visually-hidden">Search results for {state.q}</h1>}

        <SearchForm query={state.q} onSearch={searchFor} />
        <SearchHistory entries={entries} onSelect={(next) => go(next, false)} onRemove={remove} onClear={clear} />

        {state.q ? (
          <Results
            state={state}
            onNavigate={navigate}
            renderCardActions={(repo, fetchedAt) => <CompareToggle compare={compare} repo={repo} fetchedAt={fetchedAt} />}
            headingRef={resultsHeadingRef}
            footer={<CompareTray compare={compare} fallbackFocusRef={resultsHeadingRef} />}
            // Selected snapshots take newer data when a selected repository reappears in a response.
            onResults={compare.refresh}
          />
        ) : (
          <div className="examples">
            <h2 className="examples__title">Try an example</h2>
            <ul className="examples__list">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <a className="chip" {...exampleLink(q)}>
                    {q}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <p>
          Data from the{' '}
          <a href="https://docs.github.com/en/rest/search/search" target="_blank" rel="noopener noreferrer">
            GitHub Search API
          </a>
          . Anonymous use is limited to a few searches per minute.
        </p>
      </footer>
    </div>
  )
}
