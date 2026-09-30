import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { makeSearchBody } from './fixtures'

export const SEARCH_ENDPOINT = 'https://api.github.com/search/repositories'

export const server = setupServer(
  http.get(SEARCH_ENDPOINT, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
    return HttpResponse.json(makeSearchBody({ page }))
  }),
)
