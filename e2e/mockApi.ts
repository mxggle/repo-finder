import type { Page, Route } from '@playwright/test'
import { makeSearchBody } from '../src/test/fixtures'

export type SearchRequest = { q: string; page: number; sort: string | null }
type Responder = (request: SearchRequest, route: Route) => Promise<void> | void

/**
 * Serves GitHub search from fixtures and records every request that reaches
 * the "network". Any other call to api.github.com fails the test loudly.
 */
export async function mockSearchApi(page: Page, respond?: Responder) {
  const requests: SearchRequest[] = []
  await page.route('https://avatars.githubusercontent.com/**', (route) => route.abort())
  await page.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/search/repositories') {
      throw new Error(`Unexpected GitHub API call: ${url}`)
    }
    const request: SearchRequest = {
      q: url.searchParams.get('q') ?? '',
      page: Number(url.searchParams.get('page') ?? '1'),
      sort: url.searchParams.get('sort'),
    }
    requests.push(request)
    if (respond) await respond(request, route)
    else await route.fulfill({ json: makeSearchBody({ page: request.page, total: 95 }) })
  })

  return requests
}
