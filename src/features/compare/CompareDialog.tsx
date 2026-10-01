import { useEffect, useId, useRef, type MouseEvent } from 'react'
import { languageColor } from '../../shared/lib/languageColors'
import { buildCompareRows, NO_TOPICS_TEXT, UNKNOWN_TEXT, type CompareCell } from './compareFields'
import { COMPARE_MINIMUM, type CompareSelection } from './selection'

type Props = {
  open: boolean
  entries: CompareSelection
  onRemove: (id: number) => void
  /** Called after the dialog closes by any route: button, Escape, or backdrop. */
  onClose: () => void
}

function Cell({ cell }: { cell: CompareCell }) {
  switch (cell.kind) {
    case 'unknown':
      return <span className="compare-table__unknown">{UNKNOWN_TEXT}</span>
    case 'text':
      return cell.highest ? (
        <>
          <strong>{cell.text}</strong> <span className="compare-table__highest">Highest</span>
        </>
      ) : (
        <>{cell.text}</>
      )
    case 'language':
      return (
        <span className="compare-table__language">
          <span
            className="compare-table__language-dot"
            aria-hidden="true"
            style={{ backgroundColor: languageColor(cell.language) }}
          />
          {cell.language}
        </span>
      )
    case 'time':
      return (
        <time dateTime={cell.iso}>
          {cell.text}
          <span className="compare-table__detail">{cell.detail}</span>
        </time>
      )
    case 'topics':
      return cell.topics.length === 0 ? (
        <span className="compare-table__unknown">{NO_TOPICS_TEXT}</span>
      ) : (
        <ul className="compare-table__topics">
          {cell.topics.map((topic) => (
            <li key={topic} className="topic">
              {topic}
            </li>
          ))}
        </ul>
      )
  }
}

/**
 * A modal dialog: comparing is a short, focused task that needs more width than the
 * results column. The native element supplies focus containment, Escape, and an inert page.
 */
export function CompareDialog({ open, entries, onRemove, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const removeRefs = useRef(new Map<number, HTMLButtonElement>())
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      headingRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function remove(id: number) {
    // Move focus to a neighbouring remove button before this one disappears.
    const ids = entries.map((entry) => entry.repo.id)
    const index = ids.indexOf(id)
    const nextId = ids[index + 1] ?? ids[index - 1]
    onRemove(id)
    const next = nextId === undefined ? undefined : removeRefs.current.get(nextId)
    if (next && entries.length - 1 >= COMPARE_MINIMUM) next.focus()
    else headingRef.current?.focus()
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    // Clicks on the ::backdrop target the dialog element itself; the panel fills the dialog.
    if (event.target === event.currentTarget) dialogRef.current?.close()
  }

  const rows = open ? buildCompareRows(entries) : []

  return (
    // The click handler is a pointer convenience; Escape and the Close button cover keyboards.
    <dialog ref={dialogRef} className="compare-dialog" aria-labelledby={titleId} onClose={onClose} onClick={closeOnBackdrop}>
      {open && (
        <div className="compare-dialog__panel">
          <header className="compare-dialog__header">
            <div className="compare-dialog__heading">
              <h2 id={titleId} className="compare-dialog__title" ref={headingRef} tabIndex={-1}>
                Compare repositories
              </h2>
              <p className="compare-dialog__note">
                Values are from search results, as of each repository’s fetch time. Unknown means GitHub did not
                provide the value.
              </p>
            </div>
            <button className="button compare-dialog__close" type="button" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </header>

          {entries.length < COMPARE_MINIMUM ? (
            <p className="compare-dialog__empty">
              Select at least {COMPARE_MINIMUM} repositories to compare.{' '}
              {entries.length === 1 ? 'One is selected.' : 'None are selected.'}
            </p>
          ) : (
            // Only this region scrolls sideways on narrow screens; field names stay pinned.
            <div className="compare-dialog__scroll" role="region" aria-label="Comparison table" tabIndex={0}>
              <table className="compare-table" data-columns={entries.length}>
                <caption className="visually-hidden">
                  Comparison of {entries.length} repositories. Each column is a repository; each row is a field.
                </caption>
                <thead>
                  <tr>
                    <td className="compare-table__corner" />
                    {entries.map(({ repo }) => {
                      const [owner, ...rest] = repo.fullName.split('/')
                      return (
                        <th key={repo.id} scope="col" className="compare-table__repo">
                          <a href={repo.url} target="_blank" rel="noopener noreferrer">
                            <span className="compare-table__owner">{owner}/</span>
                            <span className="compare-table__name">{rest.join('/')}</span>
                            <span className="visually-hidden"> (opens in a new tab)</span>
                          </a>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} data-field={row.key}>
                      <th scope="row">{row.label}</th>
                      {row.cells.map((cell, index) => (
                        <td key={entries[index].repo.id}>
                          <Cell cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr data-field="remove">
                    <th scope="row">
                      <span className="visually-hidden">Selection</span>
                    </th>
                    {entries.map(({ repo }) => (
                      <td key={repo.id}>
                        <button
                          ref={(element) => {
                            if (element) removeRefs.current.set(repo.id, element)
                            else removeRefs.current.delete(repo.id)
                          }}
                          className="button compare-table__remove"
                          type="button"
                          aria-label={`Remove ${repo.fullName} from comparison`}
                          onClick={() => remove(repo.id)}
                        >
                          Remove
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
