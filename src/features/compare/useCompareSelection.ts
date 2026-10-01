import { useCallback, useId, useRef, useState } from 'react'
import type { Repository } from '../../domain/repository'
import {
  describeSelectionChange,
  refreshSelection,
  removeFromSelection,
  selectedCountText,
  toggleSelection,
  type CompareSelection,
} from './selection'
import { readCompareSelection, writeCompareSelection } from './selectionStore'

export type Announcement = { id: number; text: string }
export type CompareState = ReturnType<typeof useCompareSelection>

/** The comparison selection for this browser tab, persisted in session storage. */
export function useCompareSelection() {
  const [selection, setSelection] = useState<CompareSelection>(readCompareSelection)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const current = useRef(selection)
  // Card toggles at the limit are described by the tray's visible explanation.
  const limitHintId = useId()

  const commit = useCallback((next: CompareSelection) => {
    if (next === current.current) return
    current.current = next
    setSelection(next)
    writeCompareSelection(next)
  }, [])

  // A new id re-renders the live region even when the same message repeats.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }))
  }, [])

  const toggle = useCallback((repo: Repository, fetchedAt: Date) => {
    const { selection: next, change } = toggleSelection(current.current, repo, fetchedAt)
    commit(next)
    announce(describeSelectionChange(change, repo.fullName, next.length))
  }, [commit, announce])

  const remove = useCallback((id: number) => {
    const entry = current.current.find((candidate) => candidate.repo.id === id)
    if (!entry) return
    const next = removeFromSelection(current.current, id)
    commit(next)
    announce(describeSelectionChange('removed', entry.repo.fullName, next.length))
  }, [commit, announce])

  const clear = useCallback(() => {
    commit([])
    announce(`Comparison cleared. ${selectedCountText(0)}.`)
  }, [commit, announce])

  const refresh = useCallback((repos: readonly Repository[], fetchedAt: Date) => {
    commit(refreshSelection(current.current, repos, fetchedAt))
  }, [commit])

  return { selection, announcement, limitHintId, toggle, remove, clear, refresh }
}
