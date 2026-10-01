import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchHistory } from './SearchHistory'
import type { SearchHistoryEntry } from './historyStore'

const entries: SearchHistoryEntry[] = [
  { q: 'topic:cli 日本語', sort: 'stars', lastSearchedAt: 200 },
  { q: 'react', sort: 'best-match', lastSearchedAt: 100 },
]

function setup(history = entries) {
  const callbacks = { onSelect: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
  return { ...render(<SearchHistory entries={history} {...callbacks} />), ...callbacks, user: userEvent.setup() }
}

describe('SearchHistory', () => {
  it('renders nothing for empty history and starts populated history collapsed', () => {
    const empty = setup([])
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()
    const { container } = setup()
    expect(container.querySelector('details')).not.toHaveAttribute('open')
  })

  it('restores query and sort at page one through a shareable link', async () => {
    const { user, onSelect } = setup()
    await user.click(screen.getByText(/Recent searches/))
    const link = screen.getByRole('link', { name: 'topic:cli 日本語 Most stars' })
    expect(link).toHaveAttribute('href', '?q=topic%3Acli+%E6%97%A5%E6%9C%AC%E8%AA%9E&sort=stars')
    expect(screen.getByRole('link', { name: 'react Best match' })).toHaveAttribute('href', '?q=react')
    await user.click(link)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ q: entries[0].q, sort: 'stars', page: 1 })
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    'preserves native modified-link behavior for %j', async (modifier) => {
      const { user, onSelect } = setup()
      await user.click(screen.getByText(/Recent searches/))
      const link = screen.getByRole('link', { name: 'react Best match' })
      expect(fireEvent.click(link, modifier)).toBe(true)
      expect(onSelect).not.toHaveBeenCalled()
    },
  )

  it('provides separate remove and clear controls without selecting a search', async () => {
    const { user, onRemove, onClear, onSelect } = setup()
    await user.click(screen.getByText(/Recent searches/))
    await user.click(screen.getByRole('button', { name: 'Remove topic:cli 日本語, Most stars from history' }))
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(entries[0])
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('supports keyboard selection and removal with native links and buttons', async () => {
    const { user, onSelect, onRemove } = setup()
    await user.click(screen.getByText(/Recent searches/))
    const link = screen.getByRole('link', { name: 'react Best match' })
    link.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ q: 'react', sort: 'best-match', page: 1 })
    await user.tab()
    expect(screen.getByRole('button', { name: 'Remove react, Best match from history' })).toHaveFocus()
    await user.keyboard(' ')
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(entries[1])
  })

  describe('keeps keyboard focus when the focused control disappears', () => {
    function StatefulHistory({ initial }: { initial: SearchHistoryEntry[] }) {
      const [history, setHistory] = useState(initial)
      return (
        <>
          <input id="search-input" aria-label="Search repositories" />
          <SearchHistory
            entries={history}
            onSelect={() => {}}
            onRemove={(entry) => setHistory((current) => current.filter((item) => item !== entry))}
            onClear={() => setHistory([])}
          />
        </>
      )
    }

    const three: SearchHistoryEntry[] = [...entries, { q: 'vue', sort: 'updated', lastSearchedAt: 50 }]

    it('moves focus to the next entry, then the previous one, then the search field', async () => {
      const user = userEvent.setup()
      render(<StatefulHistory initial={three} />)
      await user.click(screen.getByText(/Recent searches/))

      screen.getByRole('button', { name: 'Remove react, Best match from history' }).focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('button', { name: 'Remove vue, Recently updated from history' })).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.getByRole('button', { name: 'Remove topic:cli 日本語, Most stars from history' })).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.queryByRole('list', { name: 'Recent searches' })).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Search repositories' })).toHaveFocus()
    })

    it('moves focus to the search field after clearing all entries', async () => {
      const user = userEvent.setup()
      render(<StatefulHistory initial={three} />)
      await user.click(screen.getByText(/Recent searches/))
      screen.getByRole('button', { name: 'Clear all' }).focus()
      await user.keyboard('{Enter}')
      expect(screen.getByRole('textbox', { name: 'Search repositories' })).toHaveFocus()
    })
  })
})
