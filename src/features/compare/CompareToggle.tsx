import type { Repository } from '../../domain/repository'
import { isBlocked, isSelected, LIMIT_MESSAGE } from './selection'
import type { CompareState } from './useCompareSelection'

type Props = {
  compare: CompareState
  repo: Repository
  /** When the response showing this repository was fetched; stored with the selected snapshot. */
  fetchedAt: Date
}

/**
 * A native checkbox, so its checked state and Space-to-toggle come for free.
 * `aria-disabled` rather than `disabled` keeps it reachable so the limit can be explained.
 */
export function CompareToggle({ compare, repo, fetchedAt }: Props) {
  const selected = isSelected(compare.selection, repo.id)
  // At the limit and not selected: still focusable, but toggling only explains the limit.
  const blocked = isBlocked(compare.selection, repo.id)
  return (
    <label className="compare-toggle" data-blocked={blocked || undefined} title={blocked ? LIMIT_MESSAGE : undefined}>
      <input
        className="compare-toggle__input"
        type="checkbox"
        checked={selected}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? compare.limitHintId : undefined}
        onChange={() => compare.toggle(repo, fetchedAt)}
      />
      <span className="compare-toggle__box" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      Compare{' '}<span className="visually-hidden">{repo.fullName}</span>
    </label>
  )
}
