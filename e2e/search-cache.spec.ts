import { expect, test } from '@playwright/test'
import { makeSearchBody } from '../src/test/fixtures'
import { mockSearchApi } from './mockApi'

test('a reload reuses fresh results and refresh explicitly fetches a new response', async ({ page }) => {
  let calls = 0
  const requests = await mockSearchApi(page, (_request, route) => {
    calls += 1
    return route.fulfill({ json: makeSearchBody({ total: calls === 1 ? 2 : 3 }) })
  })
  await page.goto('/?q=react')
  await expect(page.getByRole('heading', { name: /2 repositories for “react”/ })).toBeVisible()
  const fetchedAt = await page.locator('.search-freshness time').getAttribute('datetime')

  await page.reload()
  await expect(page.getByRole('heading', { name: /2 repositories for “react”/ })).toBeVisible()
  await expect(page.locator('.search-freshness time')).toHaveAttribute('datetime', fetchedAt!)
  expect(requests).toHaveLength(1)

  await page.getByRole('button', { name: 'Refresh results' }).click()
  await expect(page.getByRole('heading', { name: /3 repositories for “react”/ })).toBeVisible()
  expect(requests).toHaveLength(2)
})

test('failed refreshing retains usable results and respects the search cooldown', async ({ page }) => {
  let calls = 0
  await mockSearchApi(page, (_request, route) => {
    calls += 1
    return calls === 1
      ? route.fulfill({ json: makeSearchBody({ total: 2 }) })
      : route.fulfill({
        status: 429,
        json: { message: 'rate limit' },
        headers: { 'retry-after': '30', 'access-control-expose-headers': 'Retry-After' },
      })
  })
  await page.goto('/?q=react')
  await expect(page.getByRole('heading', { name: /2 repositories/ })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh results' }).click()

  await expect(page.getByText('Search limit reached. Showing saved results.')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Refresh in \d+s/ })).toBeDisabled()
  expect(calls).toBe(2)
})
