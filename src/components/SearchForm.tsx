import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SearchIcon } from './icons'

type Props = {
  query: string
  onSearch: (query: string) => void
}

export function SearchForm({ query, onSearch }: Props) {
  const [draft, setDraft] = useState(query)
  const [syncedQuery, setSyncedQuery] = useState(query)
  const [showHint, setShowHint] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const enterConfirmsImeRef = useRef(false)

  // Follow the URL when it changes underneath us (back/forward, example links).
  if (query !== syncedQuery) {
    setSyncedQuery(query)
    setDraft(query)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Enter that confirms an IME conversion (e.g. Japanese input) must not
    // submit. Safari reports it after compositionend with keyCode 229.
    const composing = event.nativeEvent.isComposing || event.keyCode === 229
    enterConfirmsImeRef.current = composing
    if (composing) setTimeout(() => (enterConfirmsImeRef.current = false), 0)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enterConfirmsImeRef.current) {
      enterConfirmsImeRef.current = false
      return
    }
    const trimmed = draft.trim()
    if (!trimmed) {
      setShowHint(true)
      inputRef.current?.focus()
      return
    }
    setShowHint(false)
    onSearch(trimmed)
  }

  return (
    <form className="search-form" role="search" onSubmit={handleSubmit} noValidate>
      <label htmlFor="search-input" className="visually-hidden">
        Search repositories
      </label>
      <div className="search-form__field">
        <span className="search-form__icon">
          <SearchIcon size={18} />
        </span>
        <input
          ref={inputRef}
          id="search-input"
          className="search-form__input"
          type="search"
          name="q"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (showHint && event.target.value.trim()) setShowHint(false)
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. react, language:rust stars:>1000"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-invalid={showHint || undefined}
          aria-describedby={showHint ? 'search-hint' : undefined}
        />
      </div>
      <button className="button button--primary" type="submit">
        Search
      </button>
      {showHint && (
        <p id="search-hint" className="search-form__hint" role="alert">
          Enter a keyword to search.
        </p>
      )}
    </form>
  )
}
