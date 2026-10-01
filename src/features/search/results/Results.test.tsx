import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../domain/repository'
import { FETCHED_AT, makeRepository } from '../../../test/fixtures'
import { Results } from './Results'
import type { SearchState } from '../searchState'

const fetchedAt = new Date(FETCHED_AT)
const state: SearchState = { q: 'react', sort: 'best-match', page: 1 }

function renderResults(
  props: Partial<React.ComponentProps<typeof Results>> = {},
  overrides: Partial<SearchResult> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  const data: SearchResult = {
    items: [makeRepository(1)],
    totalCount: 1,
    incompleteResults: false,
    skippedCount: 0,
    page: 1,
    fetchedAt,
    ...overrides,
  }
  client.setQueryData(['repositories', props.state ?? state], data)
  return render(
    <QueryClientProvider client={client}>
      <Results state={state} onNavigate={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

it('renders repository links and metadata', () => {
  renderResults()
  expect(screen.getByRole('heading', { name: /1 repository for “react”/ })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /octo-org\/project-1/ })).toBeInTheDocument()
  expect(screen.getByRole('article')).toHaveTextContent('MIT')
})

it('warns about a timed-out search when every match is browsable', () => {
  renderResults({}, { totalCount: 40, incompleteResults: true })
  expect(screen.getByRole('heading', { name: /About 40 repositories/ })).toBeInTheDocument()
  expect(screen.getByText(/some matching repositories may be missing/)).toBeInTheDocument()
})

it('only marks the count as approximate when a timed-out search exceeds the result cap', () => {
  renderResults({}, { totalCount: 139_510_911, incompleteResults: true })
  expect(screen.getByRole('heading', { name: /About 139.5M repositories/ })).toBeInTheDocument()
  expect(screen.getByTitle('139,510,911')).toBeInTheDocument()
  expect(screen.queryByText(/some matching repositories may be missing/)).not.toBeInTheDocument()
})

it('offers links that narrow a search beyond the result cap', () => {
  const onNavigate = vi.fn()
  renderResults(
    { onNavigate, state: { ...state, q: 'stars:<200' } },
    { totalCount: 5000, items: [makeRepository(1, { language: 'Rust' })] },
  )
  const hint = screen.getByRole('list', { name: /only returns the first 1,000 matches/ })
  const link = within(hint).getByRole('link', { name: 'Search with language:rust' })
  expect(link).toHaveAttribute('href', '?q=stars%3A%3C200+language%3Arust')
  expect(within(hint).getAllByRole('link').map((item) => item.textContent)).toEqual(['+language:rust', '+archived:false'])
  fireEvent.click(link)
  expect(onNavigate).toHaveBeenCalledWith({ ...state, q: 'stars:<200 language:rust', page: 1 })
})

it('does not offer narrowing links when every match is reachable', () => {
  renderResults({}, { totalCount: 1000 })
  expect(screen.queryByText(/only returns the first/)).not.toBeInTheDocument()
})
