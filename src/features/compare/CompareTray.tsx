import { useId, useRef, useState, type RefObject } from 'react'
import { CompareDialog } from './CompareDialog'
import {
  COMPARE_MINIMUM,
  LIMIT_MESSAGE,
  isAtLimit,
  selectedCountText,
} from './selection'
import type { CompareState } from './useCompareSelection'

type Props = {
  compare: CompareState
  /** Receives focus when the tray disappears under the keyboard (last item removed or cleared). */
  fallbackFocusRef: RefObject<HTMLElement | null>
}

/**
 * Returns siblings rather than a wrapper: the tray is `position: sticky` against the results
 * section, which a wrapper as tall as the tray would prevent.
 */
export function CompareTray({ compare, fallbackFocusRef }: Props) {
  const { selection, announcement, limitHintId, remove: onRemove, clear: onClear } = compare
  const [open, setOpen] = useState(false)
  const compareRef = useRef<HTMLButtonElement>(null)
  const removeRefs = useRef(new Map<number, HTMLButtonElement>())
  const titleId = useId()
  const minimumHintId = useId()
  const count = selection.length
  const canCompare = count >= COMPARE_MINIMUM

  function focusAfterTrayChange(nextId: number | undefined) {
    const next = nextId === undefined ? undefined : removeRefs.current.get(nextId)
    if (next) next.focus()
    else fallbackFocusRef.current?.focus({ preventScroll: true })
  }

  function remove(id: number) {
    const ids = selection.map((entry) => entry.repo.id)
    const index = ids.indexOf(id)
    onRemove(id)
    focusAfterTrayChange(ids[index + 1] ?? ids[index - 1])
  }

  function clear() {
    onClear()
    focusAfterTrayChange(undefined)
  }

  function restoreFocus() {
    setOpen(false)
    // The Compare button stays while anything is selected; otherwise fall back to the results.
    if (compareRef.current) compareRef.current.focus()
    else fallbackFocusRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      {/* A plain live region, so the results status stays the page's single role="status". */}
      <p className="visually-hidden" aria-live="polite">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </p>

      {count > 0 && (
        <section className="compare-tray" aria-labelledby={titleId}>
          <h2 className="compare-tray__title" id={titleId}>
            Compare <span className="compare-tray__count">{selectedCountText(count)}</span>
          </h2>
          <ul className="compare-tray__list">
            {selection.map(({ repo }) => {
              const [owner, ...rest] = repo.fullName.split('/')
              return (
                <li key={repo.id} className="compare-tray__item">
                  <span className="compare-tray__name" title={repo.fullName}>
                    <span className="compare-tray__owner">{owner}/</span>
                    {rest.join('/')}
                  </span>
                  <button
                    ref={(element) => {
                      if (element) removeRefs.current.set(repo.id, element)
                      else removeRefs.current.delete(repo.id)
                    }}
                    className="compare-tray__remove"
                    type="button"
                    aria-label={`Remove ${repo.fullName} from comparison`}
                    onClick={() => remove(repo.id)}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                    >
                      <path d="m4.5 4.5 7 7m0-7-7 7" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
          {isAtLimit(selection) && (
            <p className="compare-tray__hint" id={limitHintId}>
              {LIMIT_MESSAGE}
            </p>
          )}
          {!canCompare && (
            <p className="compare-tray__hint" id={minimumHintId}>
              Select {COMPARE_MINIMUM - count} more to compare.
            </p>
          )}
          <div className="compare-tray__actions">
            <button className="button compare-tray__clear" type="button" onClick={clear}>
              Clear all
            </button>
            <button
              ref={compareRef}
              className="button button--primary compare-tray__open"
              type="button"
              aria-disabled={!canCompare || undefined}
              aria-describedby={canCompare ? undefined : minimumHintId}
              aria-haspopup="dialog"
              onClick={() => canCompare && setOpen(true)}
            >
              Compare{' '}<span className="visually-hidden">selected repositories</span>
            </button>
          </div>
        </section>
      )}

      <CompareDialog open={open} entries={selection} onRemove={onRemove} onClose={restoreFocus} />
    </>
  )
}
