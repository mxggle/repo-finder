import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeRepo, makeSearchBody } from '../test/fixtures'
import { SEARCH_ENDPOINT, server } from '../test/server'
import { COMPARE_SELECTION_KEY } from '../features/compare/selectionStore'
import App from './App'
import { createQueryClient } from './queryClient'

// jsdom has no modal dialog support; model the parts the component relies on.
const original = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close }
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})
afterAll(() => {
  HTMLDialogElement.prototype.showModal = original.showModal
  HTMLDialogElement.prototype.close = original.close
})

// Comparison is composed into search results by the application, so these tests render the app.
function renderResults(url = '/?q=react') {
  window.history.replaceState(null, '', url)
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  )
}

const toggle = (name: string) => screen.getByRole('checkbox', { name: `Compare octo-org/${name}` })
const tray = () => screen.getByRole('region', { name: /^Compare \d of 3 selected$/ })

async function waitForPage(range: string) {
  await screen.findByRole('heading', { name: new RegExp(`showing ${range}`) })
}

describe('compare selection', () => {
  it('keeps selections across pages and treats a repeated repository as one selection', async () => {
    server.use(
      http.get(SEARCH_ENDPOINT, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        const body = makeSearchBody({ page })
        // GitHub can return a repository on two pages when rankings shift between requests.
        if (page === 2) body.items[0] = makeRepo(1, { stargazers_count: 77_777 })
        return HttpResponse.json(body)
      }),
    )
    const user = userEvent.setup()
    renderResults()
    await waitForPage('1–20')

    await user.click(toggle('project-1'))
    await user.click(toggle('project-2'))
    expect(toggle('project-1')).toBeChecked()
    expect(tray()).toHaveTextContent('2 of 3 selected')
    expect(screen.getByText('Added octo-org/project-2 to comparison. 2 of 3 selected.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Page 2' }))
    await waitForPage('21–40')
    // project-1 reappears on page 2 and is already selected: no duplicate entry.
    expect(toggle('project-1')).toBeChecked()
    expect(within(tray()).getAllByRole('listitem')).toHaveLength(2)

    await user.click(toggle('project-22'))
    expect(tray()).toHaveTextContent('3 of 3 selected')

    // The newer page 2 response refreshed the stored snapshot.
    await user.click(screen.getByRole('button', { name: 'Compare selected repositories' }))
    const dialog = screen.getByRole('dialog', { name: 'Compare repositories' })
    const stars = within(dialog).getByRole('row', { name: /^Stars/ })
    expect(stars).toHaveTextContent('77,777')
  })

  it('enforces the limit with an accessible explanation', async () => {
    const user = userEvent.setup()
    renderResults()
    await waitForPage('1–20')
    for (const name of ['project-1', 'project-2', 'project-3']) await user.click(toggle(name))

    const fourth = toggle('project-4')
    expect(fourth).toHaveAttribute('aria-disabled', 'true')
    expect(fourth).toHaveAccessibleDescription('You can compare up to 3 repositories. Remove one to add another.')
    await user.click(fourth)
    expect(fourth).not.toBeChecked()
    expect(tray()).toHaveTextContent('3 of 3 selected')
    expect(screen.getByText(/project-4 was not added/)).toBeInTheDocument()

    // Selected repositories stay removable at the limit.
    expect(toggle('project-2')).not.toHaveAttribute('aria-disabled')
    await user.click(toggle('project-2'))
    expect(toggle('project-4')).not.toHaveAttribute('aria-disabled')
  })

  it('requires two selections before comparing, then compares fields with unknown values explicit', async () => {
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({
          total_count: 2,
          incomplete_results: false,
          items: [
            makeRepo(1, { stargazers_count: 5000, archived: true }),
            makeRepo(2, { stargazers_count: null, license: null, language: null, pushed_at: null, archived: null, topics: [] }),
          ],
        }),
      ),
    )
    const user = userEvent.setup()
    renderResults()
    await waitForPage('1–2')

    await user.click(toggle('project-1'))
    const open = screen.getByRole('button', { name: 'Compare selected repositories' })
    expect(open).toHaveAttribute('aria-disabled', 'true')
    expect(open).toHaveAccessibleDescription('Select 1 more to compare.')
    await user.click(open)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(toggle('project-2'))
    await user.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Compare repositories' })
    expect(within(dialog).getByRole('heading', { name: 'Compare repositories' })).toHaveFocus()

    const table = within(dialog).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'octo-org/project-1 (opens in a new tab)',
      'octo-org/project-2 (opens in a new tab)',
    ])
    const rowText = (name: string) => within(table).getByRole('row', { name: new RegExp(`^${name}`) }).textContent
    expect(rowText('Stars')).toBe('Stars5,000Unknown')
    expect(rowText('License')).toBe('LicenseMITUnknown')
    expect(rowText('Language')).toBe('LanguageTypeScriptUnknown')
    expect(rowText('Archived')).toBe('ArchivedYesUnknown')
    expect(rowText('Topics')).toBe('TopicssearchreactNone listed')
    expect(within(table).getByRole('row', { name: /^Last push/ })).toHaveTextContent(/Sep 15, 2026.*Unknown/)

    // jsdom has no Escape-to-cancel for dialogs; the browser journey covers Escape.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })

  it('removes items from the comparison with focus kept in place', async () => {
    const user = userEvent.setup()
    renderResults()
    await waitForPage('1–20')
    for (const name of ['project-1', 'project-2', 'project-3']) await user.click(toggle(name))
    await user.click(screen.getByRole('button', { name: 'Compare selected repositories' }))
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Remove octo-org/project-1 from comparison' }))
    expect(within(dialog).getAllByRole('columnheader')).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Remove octo-org/project-2 from comparison' })).toHaveFocus()
    expect(toggle('project-1')).not.toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'Remove octo-org/project-2 from comparison' }))
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Select at least 2 repositories to compare/)).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Compare repositories' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: 'Remove octo-org/project-3 from comparison' }))
    expect(screen.queryByRole('region', { name: /selected$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /showing 1–20/ })).toHaveFocus()
    expect(screen.getByText('Removed octo-org/project-3 from comparison. 0 of 3 selected.')).toBeInTheDocument()
  })

  it('clears all selections and survives a remount in the same tab', async () => {
    const user = userEvent.setup()
    const first = renderResults()
    await waitForPage('1–20')
    await user.click(toggle('project-1'))
    await user.click(toggle('project-5'))
    first.unmount()

    renderResults('/?q=vue&sort=stars')
    await waitForPage('1–20')
    expect(within(tray()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'octo-org/project-1',
      'octo-org/project-5',
    ])

    await user.click(within(tray()).getByRole('button', { name: 'Clear all' }))
    expect(screen.queryByRole('region', { name: /selected$/ })).not.toBeInTheDocument()
    expect(toggle('project-1')).not.toBeChecked()
    await waitFor(() => expect(window.sessionStorage.getItem(COMPARE_SELECTION_KEY)).toBeNull())
  })
})
