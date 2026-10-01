import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { LANGUAGES } from './qualifiers'
import { languageColor } from '../../../shared/lib/languageColors'
import {
  describeStars,
  formatStars,
  isMinStars,
  parseFilters,
  removeToken,
  setExcludeArchived,
  setLanguage,
  setMinStars,
  type FilterKind,
  type LockReason,
  type QueryToken,
} from './queryFilters'

type Props = {
  /** The search text being edited (the form's draft, not the executed search). */
  query: string
  /** True when the draft is the search currently shown, so there is nothing left to apply. */
  applied: boolean
  /** Replaces the draft. Filter edits never search by themselves. */
  onChange: (next: string) => void
  /** Searches for `next` right away (Enter in the stars field). */
  onSubmit: (next: string) => void
}

const LOCK_NOTES: Record<LockReason, string> = {
  duplicate: 'appears more than once',
  complex: 'combined with AND, OR or brackets',
}

const KIND_LABELS: Record<FilterKind, string> = { language: 'Language', stars: 'Stars', archived: 'Archived' }

/**
 * Editable controls for `language:`, `stars:` and `archived:` in the search text. They read the
 * draft on every render and write back by editing only their own token (see queryFilters.ts).
 */
export function SearchFilters({ query, applied, onChange, onSubmit }: Props) {
  const filters = parseFilters(query, LANGUAGES)
  const { language, stars, archived } = filters

  const committedMin = stars.status === 'set' && isMinStars(stars.value) ? String(stars.value.value) : ''
  // Typing a number only edits this field; the text follows on blur or Enter.
  const [starsText, setStarsText] = useState(committedMin)
  const [syncedMin, setSyncedMin] = useState(committedMin)
  const [starsError, setStarsError] = useState(false)
  if (committedMin !== syncedMin) {
    setSyncedMin(committedMin)
    setStarsText(committedMin)
    setStarsError(false)
  }

  // An edit's announcement stays only while the draft is still the text that edit produced.
  const [status, setStatus] = useState<{ message: string; query: string } | null>(null)
  const pendingFocus = useRef<FilterKind | null>(null)
  const languageRef = useRef<HTMLSelectElement>(null)
  const starsRef = useRef<HTMLInputElement>(null)
  const archivedRef = useRef<HTMLInputElement>(null)

  // A removed chip takes its button with it; move focus to the control that replaces it.
  useEffect(() => {
    const kind = pendingFocus.current
    if (!kind) return
    pendingFocus.current = null
    const control = { language: languageRef, stars: starsRef, archived: archivedRef }[kind].current
    control?.focus()
  })

  function edit(next: string, message: string) {
    if (next === query) return
    onChange(next)
    setStatus({ message, query: next })
  }

  function remove(kind: FilterKind, token: QueryToken, message: string) {
    pendingFocus.current = kind
    edit(removeToken(query, token), message)
  }

  /** Applies the stars field to the text; null when its value is not a whole number. */
  function commitStars(): string | null {
    // An untouched field has nothing to apply; it must not clear an unfinished `stars:>` in the text.
    if (starsText === committedMin) return query
    // NFKC turns full-width digits from a Japanese IME into ASCII.
    const text = starsText.normalize('NFKC').replace(/[\s,_]/g, '')
    const min = text === '' ? null : /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : undefined
    if (min === undefined) {
      setStarsError(true)
      return null
    }
    setStarsError(false)
    setStarsText(min === null ? '' : String(min))
    const next = setMinStars(query, min)
    const op = stars.status === 'set' && stars.value.op === '>' ? '>' : '>='
    edit(next, min === null ? 'Stars filter removed.' : `Stars filter set to ${describeStars({ op, value: min })}.`)
    return next
  }

  function handleStarsKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    // Never submit from the Enter that confirms an IME conversion (Safari reports keyCode 229).
    event.preventDefault()
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const next = commitStars()
    if (next !== null) onSubmit(next)
  }

  function locked(kind: FilterKind, reason: LockReason) {
    return (
      <li className="search-filter search-filter--locked">
        <span className="search-filter__label">{KIND_LABELS[kind]}</span>
        <span className="search-filter__note">{LOCK_NOTES[reason]}. Edit it in the search box.</span>
      </li>
    )
  }

  function invalid(kind: FilterKind, token: QueryToken) {
    const name = kind === 'archived' ? 'archived' : kind
    return (
      <li className="search-filter search-filter--invalid">
        <span className="search-filter__value">{token.text}</span>
        <span className="search-filter__note">not understood</span>
        <RemoveButton
          label={`Remove invalid ${name} filter ${token.text}`}
          onClick={() => remove(kind, token, `Invalid ${name} filter removed.`)}
        />
      </li>
    )
  }

  function readOnly(kind: FilterKind, value: string, words: string, token: QueryToken) {
    const name = KIND_LABELS[kind].toLowerCase()
    return (
      <li className="search-filter search-filter--active">
        <span className="search-filter__label">{KIND_LABELS[kind]}</span>
        <span className="search-filter__value">{value}</span>
        <RemoveButton
          label={`Remove ${name} filter ${words}`}
          onClick={() => remove(kind, token, `${KIND_LABELS[kind]} filter removed.`)}
        />
      </li>
    )
  }

  let languageControl: ReactNode
  if (language.status === 'locked') languageControl = locked('language', language.reason)
  else if (language.status === 'invalid') languageControl = invalid('language', language.token)
  else {
    const current = language.status === 'set' ? language.value.label : ''
    const color = current ? languageColor(current) : undefined
    languageControl = (
      <li className={`search-filter${current ? ' search-filter--active' : ''}`}>
        {color && <span className="search-filter__dot" aria-hidden="true" style={{ backgroundColor: color }} />}
        <label className="search-filter__label" htmlFor="search-filter-language">
          Language
        </label>
        <span className="search-filter__picker">
          <select
            ref={languageRef}
            id="search-filter-language"
            className="search-filter__select"
            value={current}
            onChange={(event) => {
              const value = event.target.value
              edit(
                setLanguage(query, value || null),
                value ? `Language filter set to ${value}.` : 'Language filter removed.',
              )
            }}
          >
            <option value="">Any</option>
            {current && !LANGUAGES.includes(current) && <option value={current}>{current}</option>}
            {LANGUAGES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </span>
        {language.status === 'set' && (
          <RemoveButton
            label={`Remove language filter ${current}`}
            onClick={() => remove('language', language.token, 'Language filter removed.')}
          />
        )}
      </li>
    )
  }

  let starsControl: ReactNode
  if (stars.status === 'locked') starsControl = locked('stars', stars.reason)
  else if (stars.status === 'invalid') starsControl = invalid('stars', stars.token)
  else if (stars.status === 'set' && !isMinStars(stars.value))
    starsControl = readOnly('stars', formatStars(stars.value), describeStars(stars.value), stars.token)
  else {
    const exclusive = stars.status === 'set' && stars.value.op === '>'
    starsControl = (
      <li className={`search-filter${stars.status === 'set' ? ' search-filter--active' : ''}`}>
        <label className="search-filter__label" htmlFor="search-filter-stars">
          <span aria-hidden="true">Stars {exclusive ? '>' : '≥'}</span>
          <span className="visually-hidden">{exclusive ? 'Stars more than' : 'Minimum stars'}</span>
        </label>
        <input
          ref={starsRef}
          id="search-filter-stars"
          className="search-filter__number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="any"
          size={6}
          value={starsText}
          onChange={(event) => {
            setStarsText(event.target.value)
            setStarsError(false)
          }}
          onBlur={commitStars}
          onKeyDown={handleStarsKeyDown}
          aria-invalid={starsError || undefined}
          aria-describedby={starsError ? 'search-filter-stars-error' : undefined}
        />
        {stars.status === 'set' && (
          <RemoveButton
            label={`Remove stars filter ${describeStars(stars.value)}`}
            onClick={() => remove('stars', stars.token, 'Stars filter removed.')}
          />
        )}
      </li>
    )
  }

  let archivedControl: ReactNode
  if (archived.status === 'locked') archivedControl = locked('archived', archived.reason)
  else if (archived.status === 'invalid') archivedControl = invalid('archived', archived.token)
  else if (archived.status === 'set' && archived.value)
    archivedControl = readOnly('archived', 'only', 'archived only', archived.token)
  else {
    const excluded = archived.status === 'set'
    archivedControl = (
      <li className={`search-filter search-filter--toggle${excluded ? ' search-filter--active' : ''}`}>
        <input
          ref={archivedRef}
          id="search-filter-archived"
          className="search-filter__checkbox"
          type="checkbox"
          checked={excluded}
          onChange={(event) => {
            const exclude = event.target.checked
            edit(
              setExcludeArchived(query, exclude),
              exclude ? 'Archived repositories excluded.' : 'Archived repositories included.',
            )
          }}
        />
        <label className="search-filter__label" htmlFor="search-filter-archived">
          Exclude archived
        </label>
      </li>
    )
  }

  const message = status && status.query === query && !applied ? `${status.message} Press Search to apply.` : ''

  return (
    <fieldset className="search-filters">
      <legend className="visually-hidden">Filters</legend>
      <ul className="search-filters__list">
        {languageControl}
        {starsControl}
        {archivedControl}
      </ul>
      {starsError && (
        <p id="search-filter-stars-error" className="search-filters__error" role="alert">
          Enter the minimum stars as a whole number.
        </p>
      )}
      {/* A plain live region: role="status" is left to the results, which announce loading. */}
      <p className="search-filters__status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
    </fieldset>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="search-filter__remove" aria-label={label} onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <path d="m4 4 8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}
