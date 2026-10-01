import { expect, test } from '@playwright/test'
import { makeSearchBody } from '../src/test/fixtures'
import { mockSearchApi } from './mockApi'

/*
 * Demo scenarios with mocked GitHub responses. Record them with
 * `E2E_RECORD=1 pnpm exec playwright test e2e/search-resilience.spec.ts e2e/search-cache.spec.ts
 * --project=desktop-chromium` (see docs/quality-report.md). Reload cache reuse is covered by
 * search-cache.spec.ts; a two-query race by search.spec.ts.
 */

const PREFIX: Record<string, number> = { first: 100, second: 200, third: 300 }

test('rapid query switching never shows another query’s results, even briefly', async ({ page }) => {
  // "first" answers quickly; then "second" (slow) and "third" are submitted back to back,
  // so the late "second" response arrives after "third" is already on screen.
  const delays: Record<string, number> = { first: 50, second: 1_500, third: 400 }
  const requests = await mockSearchApi(page, async (request, route) => {
    await new Promise((resolve) => setTimeout(resolve, delays[request.q] ?? 0))
    await route.fulfill({ json: makeSearchBody({ total: 3, prefix: PREFIX[request.q] }) }).catch(() => {
      // The app cancelled this request after the query changed.
    })
  })
  await page.goto('/')

  // Snapshot the heading and the first card at every DOM change, not just at the end.
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    new MutationObserver(() => {
      const heading = document.querySelector('.results__heading')?.textContent
      const card = document.querySelector('.repo-card__title a .repo-card__name')?.textContent
      const snapshot = `${heading} | ${card}`
      if (heading && card && seen.at(-1) !== snapshot) seen.push(snapshot)
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })

  const input = page.getByRole('combobox', { name: 'Search repositories' })
  await input.fill('first')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: /3 repositories for “first”/ })).toBeVisible()
  for (const q of ['second', 'third']) {
    await input.fill(q)
    await input.press('Enter')
  }

  await expect(page.getByRole('heading', { name: /3 repositories for “third”/ })).toBeVisible()
  await page.waitForTimeout(1_800) // the slow "second" response has now arrived or been cancelled
  await expect(page.getByRole('heading', { name: /3 repositories for “third”/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /project-301/ })).toBeVisible()
  await expect(page).toHaveURL(/\?q=third$/)

  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen)
  expect(seen.some((snapshot) => snapshot.includes('“third”'))).toBe(true)
  for (const snapshot of seen) {
    const query = /for “(\w+)”/.exec(snapshot)![1]
    expect(snapshot, 'cards belong to the query in the heading').toContain(`project-${PREFIX[query] + 1}`)
  }
  expect(seen.some((snapshot) => snapshot.includes('“second”'))).toBe(false)
  expect(requests.map((request) => request.q)).toEqual(['first', 'second', 'third'])
})

test('after a rate limit, searching resumes once the wait is over', async ({ page }) => {
  let limited = true
  const requests = await mockSearchApi(page, (_request, route) => {
    if (limited) {
      limited = false
      return route.fulfill({
        status: 429,
        json: { message: 'rate limit' },
        headers: { 'retry-after': '2', 'access-control-expose-headers': 'Retry-After' },
      })
    }
    return route.fulfill({ json: makeSearchBody({ total: 2 }) })
  })
  await page.goto('/?q=react')

  await expect(page.getByRole('heading', { name: 'Search limit reached' })).toBeVisible()
  const retry = page.getByRole('button', { name: /Try again/ })
  await expect(retry).toBeDisabled()
  await expect(retry).toHaveText(/Try again in [12]s/)

  // A new search during the wait is refused locally, without a request.
  const input = page.getByRole('combobox', { name: 'Search repositories' })
  await input.fill('vue')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: 'Search limit reached' })).toBeVisible()
  expect(requests).toHaveLength(1)

  // The countdown ends, the button re-enables and the search succeeds.
  await expect(retry).toHaveText('Try again', { timeout: 5_000 })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect(page.getByRole('heading', { name: /2 repositories for “vue”/ })).toBeVisible()
  expect(requests.map((request) => request.q)).toEqual(['react', 'vue'])
})
