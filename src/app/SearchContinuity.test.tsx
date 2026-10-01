import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import App from './App'
import { createQueryClient } from './queryClient'
import { makeSearchBody } from '../test/fixtures'
import { SEARCH_ENDPOINT, server } from '../test/server'

function renderSearch(url = '/?q=react') {
  window.history.replaceState(null, '', url)
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>,
    ),
  }
}

it('persists executed searches, restores their sort at page one, and supports clearing and repeating', async () => {
  let requests = 0
  server.use(http.get(SEARCH_ENDPOINT, ({ request }) => {
    requests += 1
    return HttpResponse.json(makeSearchBody({ page: Number(new URL(request.url).searchParams.get('page')) }))
  }))
  const first = renderSearch('/?q=react&page=2')
  await screen.findByRole('heading', { name: /showing 21–40/ })
  await first.user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'stars')
  await screen.findByRole('heading', { name: /showing 1–20/ })
  const input = screen.getByRole('combobox', { name: 'Search repositories' })
  await first.user.clear(input)
  await first.user.type(input, 'vue{Enter}')
  await screen.findByRole('heading', { name: /repositories for “vue”/ })
  expect(requests).toBe(3)
  first.unmount()

  const restored = renderSearch('/')
  await restored.user.click(screen.getByText(/Recent searches/))
  const history = screen.getByRole('list', { name: 'Recent searches' })
  expect(within(history).getAllByRole('link')).toHaveLength(3)
  await restored.user.click(within(history).getByRole('link', { name: 'react Most stars' }))
  expect(window.location.search).toBe('?q=react&sort=stars')
  expect(screen.getByRole('heading', { name: /showing 1–20/ })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('stars')
  expect(requests).toBe(3)

  await restored.user.click(screen.getByRole('button', { name: 'Remove vue, Most stars from history' }))
  expect(within(history).getAllByRole('link')).toHaveLength(2)
  await restored.user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(screen.queryByText(/Recent searches/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /repositories for “react”/ })).toBeInTheDocument()

  // Repeating the active query has no URL change, but is still a new history action.
  await restored.user.click(screen.getByRole('button', { name: 'Search' }))
  await restored.user.click(screen.getByText(/Recent searches/))
  expect(screen.getByRole('list', { name: 'Recent searches' }).querySelectorAll('a')).toHaveLength(1)
  expect(requests).toBe(3)
})

it('restores saved results into a new client and explicitly refreshes them on demand', async () => {
  let requests = 0
  server.use(http.get(SEARCH_ENDPOINT, () => {
    requests += 1
    return HttpResponse.json(makeSearchBody({ total: requests === 1 ? 2 : 3 }))
  }))
  const first = renderSearch()
  await screen.findByRole('heading', { name: /2 repositories for “react”/ })
  const fetchedAt = first.container.querySelector('.search-freshness time')!.getAttribute('datetime')
  first.unmount()

  const restored = renderSearch()
  expect(screen.getByRole('heading', { name: /2 repositories for “react”/ })).toBeInTheDocument()
  expect(restored.container.querySelector('.search-freshness time')).toHaveAttribute('datetime', fetchedAt)
  expect(requests).toBe(1)

  await restored.user.click(screen.getByRole('button', { name: 'Refresh results' }))
  await screen.findByRole('heading', { name: /3 repositories for “react”/ })
  expect(requests).toBe(2)
})

it('keeps saved results visible when a refresh is rate limited and blocks retry until reset', async () => {
  let requests = 0
  server.use(http.get(SEARCH_ENDPOINT, () => {
    requests += 1
    return requests === 1
      ? HttpResponse.json(makeSearchBody({ total: 2 }))
      : HttpResponse.json({ message: 'rate limit' }, { status: 429, headers: { 'retry-after': '30' } })
  }))
  const { user } = renderSearch()
  await screen.findByRole('heading', { name: /2 repositories for “react”/ })
  await user.click(screen.getByRole('button', { name: 'Refresh results' }))

  await screen.findByText('Search limit reached. Showing saved results.')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByRole('button', { name: /Refresh in \d+s/ })).toBeDisabled()
  expect(requests).toBe(2)

  const input = screen.getByRole('combobox', { name: 'Search repositories' })
  await user.clear(input)
  await user.type(input, 'vue{Enter}')
  await screen.findByRole('heading', { name: 'Search limit reached' })
  await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
  expect(requests).toBe(2)
})
