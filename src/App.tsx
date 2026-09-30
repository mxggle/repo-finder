import { useEffect, type MouseEvent } from 'react'
import { Results } from './components/Results'
import { SearchForm } from './components/SearchForm'
import { useSearchState } from './hooks/useSearchState'
import { isPlainClick } from './lib/links'
import { EMPTY_SEARCH, toQueryString } from './lib/searchState'

const EXAMPLES = ['react', 'language:rust stars:>5000', 'topic:cli language:go', 'vite plugin']

export default function App() {
  const [state, navigate] = useSearchState()

  useEffect(() => {
    document.title = state.q ? `${state.q} · Repo Finder` : 'Repo Finder'
  }, [state.q])

  function searchFor(q: string) {
    // A new query always starts from the first page with the current sort.
    navigate({ ...state, q, page: 1 })
  }

  function exampleLink(q: string) {
    return {
      href: toQueryString({ ...EMPTY_SEARCH, q }),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        navigate({ ...EMPTY_SEARCH, q })
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
            navigate(EMPTY_SEARCH)
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28">
            <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
            <circle cx="11" cy="11" r="4.5" fill="none" stroke="var(--color-surface)" strokeWidth="2" />
            <path d="m14.5 14.5 3.5 3.5" stroke="var(--color-surface)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Repo Finder
        </a>
      </header>

      <main className="main">
        {!state.q && (
          <div className="intro">
            <h1 className="intro__title">Find GitHub repositories</h1>
            <p className="intro__lead">
              Search public repositories by keyword, and narrow them down with GitHub’s qualifiers. The search box
              suggests them as you type.
            </p>
          </div>
        )}
        {state.q && <h1 className="visually-hidden">Search results for {state.q}</h1>}

        <SearchForm query={state.q} onSearch={searchFor} />

        {state.q ? (
          <Results state={state} onNavigate={navigate} />
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
