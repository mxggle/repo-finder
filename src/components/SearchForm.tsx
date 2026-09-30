import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from 'react'
import { applySuggestion, suggest, type Suggestion } from '../lib/qualifiers'
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
  const pendingCaretRef = useRef<number | null>(null)
  // Caret position while the input has focus; null otherwise.
  const [caret, setCaret] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  // Escape hides the list until the text or caret changes.
  const [dismissed, setDismissed] = useState(false)
  // Nothing is highlighted until the arrow keys pick something, so Enter keeps searching.
  const [activeIndex, setActiveIndex] = useState(-1)

  // Follow the URL when it changes underneath us (back/forward, example links).
  if (query !== syncedQuery) {
    setSyncedQuery(query)
    setDraft(query)
  }

  const { term, suggestions } = caret === null || composing ? { term: null, suggestions: [] } : suggest(draft, caret)
  const open = suggestions.length > 0 && !dismissed
  const active = open && activeIndex < suggestions.length ? activeIndex : -1

  function moveCaret(next: number | null) {
    if (next === caret) return
    setCaret(next)
    setDismissed(false)
    setActiveIndex(-1)
  }

  function trackCaret(event: SyntheticEvent<HTMLInputElement>) {
    moveCaret(event.currentTarget.selectionStart)
  }

  function accept(suggestion: Suggestion) {
    if (!term) return
    const next = applySuggestion(draft, term, suggestion.insert)
    inputRef.current?.focus()
    pendingCaretRef.current = next.caret
    setDraft(next.value)
    moveCaret(next.caret)
    setShowHint(false)
  }

  // The caret can only be placed once the new text has been rendered.
  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return
    inputRef.current?.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current)
    pendingCaretRef.current = null
  })

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const count = suggestions.length
        setActiveIndex(event.key === 'ArrowDown' ? (active + 1) % count : active <= 0 ? count - 1 : active - 1)
        return
      }
      if (event.key === 'Escape') {
        // Close the list without the native search-field clear.
        event.preventDefault()
        setDismissed(true)
        return
      }
      if (event.key === 'Enter' && active >= 0) {
        event.preventDefault()
        accept(suggestions[active])
        return
      }
    }
    if (event.key !== 'Enter') return
    // Enter that confirms an IME conversion (e.g. Japanese input) must not
    // submit. Safari reports it after compositionend with keyCode 229.
    const confirmsIme = event.nativeEvent.isComposing || event.keyCode === 229
    enterConfirmsImeRef.current = confirmsIme
    if (confirmsIme) setTimeout(() => (enterConfirmsImeRef.current = false), 0)
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
    setDismissed(true)
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
          role="combobox"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            moveCaret(event.target.selectionStart)
            setDismissed(false)
            if (showHint && event.target.value.trim()) setShowHint(false)
          }}
          onKeyDown={handleKeyDown}
          onSelect={trackCaret}
          onFocus={trackCaret}
          onBlur={() => moveCaret(null)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          placeholder="e.g. react, language:rust stars:>1000"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? 'search-suggestions' : undefined}
          aria-activedescendant={active >= 0 ? `search-suggestion-${active}` : undefined}
          aria-invalid={showHint || undefined}
          aria-describedby={showHint ? 'search-hint' : undefined}
        />
        {open && (
          <div className="suggestions">
            <ul id="search-suggestions" className="suggestions__list" role="listbox" aria-label="Suggestions">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.insert}
                  id={`search-suggestion-${index}`}
                  className="suggestion"
                  role="option"
                  aria-selected={index === active}
                  // Keep focus in the input; the click then replaces the term at its caret.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => accept(suggestion)}
                >
                  {suggestion.color && (
                    <span className="suggestion__dot" aria-hidden="true" style={{ backgroundColor: suggestion.color }} />
                  )}
                  <span className="suggestion__label">{suggestion.label}</span>
                  {suggestion.description && <span className="suggestion__description">{suggestion.description}</span>}
                </li>
              ))}
            </ul>
            <p className="suggestions__keys" aria-hidden="true">
              <kbd>↑</kbd>
              <kbd>↓</kbd> to choose · <kbd>Enter</kbd> to insert · <kbd>Esc</kbd> to close
            </p>
          </div>
        )}
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
