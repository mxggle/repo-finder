import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createQueryClient } from './queryClient'
import { makeRepo, makeSearchBody } from './test/fixtures'
import { SEARCH_ENDPOINT, server } from './test/server'

function renderApp(url = '/') {
  window.history.replaceState(null, '', url)
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } })
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    ),
  }
}

/** Records the search parameters of every request that reaches the API. */
function recordRequests(respond = (params: URLSearchParams) => HttpResponse.json(makeSearchBody({ page: Number(params.get('page')) }))) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get(SEARCH_ENDPOINT, ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      return respond(params)
    }),
  )
  return requests
}

const repoLinks = () => screen.getAllByRole('link', { name: /octo-org\// }).map((link) => link.textContent)

describe('App', () => {
  it('searches from the form and shows results', async () => {
    const requests = recordRequests()
    const { user } = renderApp()

    await user.type(screen.getByRole('searchbox', { name: 'Search repositories' }), '  react  {Enter}')

    expect(await screen.findByRole('heading', { name: /45 repositories for “react”/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?q=react')
    expect(requests[0].get('q')).toBe('react')
    expect(repoLinks()[0]).toContain('project-1')
  })

  it('does not search for blank input', async () => {
    const requests = recordRequests()
    const { user } = renderApp()

    await user.type(screen.getByRole('searchbox'), '   {Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a keyword')
    expect(requests).toHaveLength(0)
    expect(window.location.search).toBe('')
  })

  it('ignores the Enter key that confirms an IME conversion', async () => {
    recordRequests()
    renderApp()
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: '日本語' } })

    // Safari reports the confirming Enter with keyCode 229 after compositionend.
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    fireEvent.submit(input.closest('form')!)
    expect(window.location.search).toBe('')

    // Chrome and Firefox flag the confirming Enter with isComposing instead.
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true })
    fireEvent.submit(input.closest('form')!)
    expect(window.location.search).toBe('')

    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
    fireEvent.submit(input.closest('form')!)
    expect(new URLSearchParams(window.location.search).get('q')).toBe('日本語')
  })

  it('moves between pages and keeps the URL in sync', async () => {
    const requests = recordRequests()
    const { user } = renderApp('/?q=react')
    await screen.findByRole('heading', { name: /showing 1–20/ })

    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    await user.click(within(nav).getByRole('link', { name: 'Page 2' }))

    expect(await screen.findByRole('heading', { name: /showing 21–40/ })).toHaveFocus()
    expect(window.location.search).toBe('?q=react&page=2')
    expect(requests.at(-1)?.get('page')).toBe('2')
    expect(within(nav).getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(nav).getByRole('link', { name: /Next/ }))
    expect(await screen.findByRole('heading', { name: /showing 41–45/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Next/ })).not.toBeInTheDocument()
  })

  it('returns to page 1 when the sort order changes', async () => {
    const requests = recordRequests()
    const { user } = renderApp('/?q=react&page=2')
    await screen.findByRole('heading', { name: /showing 21–40/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'stars')

    await screen.findByRole('heading', { name: /showing 1–20/ })
    expect(window.location.search).toBe('?q=react&sort=stars')
    expect(requests.at(-1)?.get('sort')).toBe('stars')
    expect(requests.at(-1)?.get('page')).toBe('1')
  })

  it('returns to page 1 for a new query but keeps the sort order', async () => {
    recordRequests()
    const { user } = renderApp('/?q=react&sort=forks&page=3')
    await screen.findByRole('heading', { name: /showing 41–45/ })

    const input = screen.getByRole('searchbox')
    await user.clear(input)
    await user.type(input, 'vue{Enter}')

    await screen.findByRole('heading', { name: /showing 1–20/ })
    expect(window.location.search).toBe('?q=vue&sort=forks')
  })

  it('restores the previous search on browser back', async () => {
    recordRequests()
    const { user } = renderApp('/?q=react')
    await screen.findByRole('heading', { name: /showing 1–20/ })
    await user.click(screen.getByRole('link', { name: 'Page 2' }))
    await screen.findByRole('heading', { name: /showing 21–40/ })

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    })

    expect(await screen.findByRole('heading', { name: /showing 1–20/ })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('react')
  })

  it('normalises an invalid page in the URL', async () => {
    recordRequests()
    renderApp('/?q=react&page=abc&sort=nope')
    await screen.findByRole('heading', { name: /showing 1–20/ })
    expect(window.location.search).toBe('?q=react')
  })

  it('explains a page beyond the end of the results', async () => {
    recordRequests()
    const { user } = renderApp('/?q=react&page=5')

    expect(await screen.findByRole('heading', { name: 'Page 5 doesn’t exist' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Go to page 3' }))
    await screen.findByRole('heading', { name: /showing 41–45/ })
    expect(window.location.search).toBe('?q=react&page=3')
  })

  it('handles a page that GitHub returns empty despite its total count', async () => {
    recordRequests(() => HttpResponse.json({ total_count: 1003, incomplete_results: false, items: [] }))
    renderApp('/?q=react&page=50')

    expect(await screen.findByRole('heading', { name: 'No results on page 50' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to page 49' })).toHaveAttribute('href', '?q=react&page=49')
  })

  it('distinguishes no matches from errors', async () => {
    recordRequests(() => HttpResponse.json({ total_count: 0, incomplete_results: false, items: [] }))
    renderApp('/?q=zzzz')
    expect(await screen.findByRole('heading', { name: 'No repositories match “zzzz”' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('explains the 1,000 result cap and incomplete results', async () => {
    recordRequests((params) =>
      HttpResponse.json(makeSearchBody({ page: Number(params.get('page')), total: 7_000_000, incomplete: true })),
    )
    renderApp('/?q=react')

    await screen.findByRole('heading', { name: /7,000,000 repositories/ })
    expect(screen.getByText(/only returns the first 1,000 matches/)).toBeInTheDocument()
    expect(screen.getByText(/some matching repositories may be missing/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Page 50' })).toBeInTheDocument()
  })

  it('shows a rate-limit countdown and does not retry automatically', async () => {
    const requests = recordRequests(() =>
      HttpResponse.json(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 45) },
        },
      ),
    )
    const { user } = renderApp('/?q=react')

    expect(await screen.findByRole('heading', { name: 'Search limit reached' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again in \d+s/ })).toBeDisabled()

    // Searching again while blocked is answered locally.
    const input = screen.getByRole('searchbox')
    await user.clear(input)
    await user.type(input, 'vue{Enter}')
    expect(await screen.findByRole('heading', { name: 'Search limit reached' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('shows GitHub’s message for an invalid query', async () => {
    recordRequests(() => HttpResponse.json({ message: 'Validation Failed' }, { status: 422 }))
    renderApp('/?q=a%20AND%20b')

    expect(await screen.findByRole('heading', { name: 'GitHub couldn’t run this search' })).toBeInTheDocument()
    expect(screen.getByText('Validation Failed')).toBeInTheDocument()
  })

  it('retries a network failure only once, then lets the user retry', async () => {
    const requests = recordRequests(() => HttpResponse.error())
    const { user } = renderApp('/?q=react')

    expect(await screen.findByRole('heading', { name: 'Can’t reach GitHub' })).toBeInTheDocument()
    expect(requests).toHaveLength(2)

    recordRequests()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: /45 repositories/ })).toBeInTheDocument()
  })

  it('renders repository text as text, not HTML', async () => {
    recordRequests(() =>
      HttpResponse.json({
        total_count: 1,
        incomplete_results: false,
        items: [makeRepo(1, { description: '<img src=x onerror="alert(1)">' })],
      }),
    )
    const { container } = renderApp('/?q=xss')

    expect(await screen.findByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it('keeps the previous page visible while the next page loads, but not a previous query', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(SEARCH_ENDPOINT, async ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('q') === 'vue' || params.get('page') === '2') await gate
        return HttpResponse.json(makeSearchBody({ page: Number(params.get('page')) }))
      }),
    )
    const { user } = renderApp('/?q=react')
    await screen.findByRole('heading', { name: /showing 1–20/ })

    // Same query, next page: the current page stays on screen, marked busy.
    await user.click(screen.getByRole('link', { name: 'Page 2' }))
    expect(screen.getByRole('list', { busy: true })).toBeInTheDocument()
    expect(repoLinks()[0]).toContain('project-1')
    // The heading describes what is on screen, not the page still loading.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('showing 1–20')

    // Different query: the old results must disappear immediately.
    const input = screen.getByRole('searchbox')
    await user.clear(input)
    await user.type(input, 'vue{Enter}')
    expect(screen.queryAllByRole('link', { name: /octo-org\// })).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Loading results')

    release()
    expect(await screen.findByRole('heading', { name: /showing 1–20/ })).toBeInTheDocument()
  })

  it('never shows the previous query’s results under a new query', async () => {
    let resolveSlow!: () => void
    const slowGate = new Promise<void>((resolve) => (resolveSlow = resolve))
    server.use(
      http.get(SEARCH_ENDPOINT, async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        if (q === 'slow') {
          await slowGate
          return HttpResponse.json(makeSearchBody({ total: 3, prefix: 900 }))
        }
        return HttpResponse.json(makeSearchBody({ total: 2 }))
      }),
    )
    const { user } = renderApp()
    const input = screen.getByRole('searchbox')

    await user.type(input, 'slow{Enter}')
    await user.clear(input)
    await user.type(input, 'fast{Enter}')
    await screen.findByRole('heading', { name: /2 repositories/ })

    resolveSlow()
    await waitFor(() => expect(repoLinks()).toHaveLength(2))
    expect(repoLinks().join()).not.toContain('project-901')
    expect(window.location.search).toBe('?q=fast')
  })
})
