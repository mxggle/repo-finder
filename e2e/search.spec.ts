import { expect, test } from '@playwright/test'
import { makeRepo, makeSearchBody } from '../src/test/fixtures'
import { mockSearchApi } from './mockApi'

test('keyboard-only search, pagination and browser history', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard journey is a desktop concern')
  const requests = await mockSearchApi(page)
  await page.goto('/')

  await page.keyboard.press('Tab') // brand link
  await page.keyboard.press('Tab') // theme switcher (one stop for the radio group)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Search repositories' })).toBeFocused()
  await page.keyboard.type('react')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()
  await expect(page).toHaveURL(/\?q=react$/)

  const nav = page.getByRole('navigation', { name: 'Pagination' })
  const pageTwo = nav.getByRole('link', { name: 'Page 2' })
  for (let presses = 0; presses < 100 && !(await pageTwo.evaluate((link) => link === document.activeElement)); presses++) {
    await page.keyboard.press('Tab')
  }
  await expect(pageTwo).toBeFocused()
  // Focus must be visible, not just present.
  expect(await pageTwo.evaluate((link) => getComputedStyle(link).outlineStyle)).not.toBe('none')
  await page.keyboard.press('Enter')

  const heading = page.getByRole('heading', { name: /showing 21–40/ })
  await expect(heading).toBeFocused()
  await expect(page).toHaveURL(/\?q=react&page=2$/)
  await expect(nav.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')

  await page.goBack()
  await expect(page.getByRole('heading', { name: /showing 1–20/ })).toBeVisible()
  // Page 1 was cached, so going back does not spend another API request.
  expect(requests.map((request) => request.page)).toEqual([1, 2])
})

test('a shared URL restores query, sort and page', async ({ page, isMobile }) => {
  const requests = await mockSearchApi(page)
  await page.goto('/?q=react&sort=stars&page=3')

  await expect(page.getByRole('heading', { name: /showing 41–60/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Search repositories' })).toHaveValue('react')
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('stars')

  if (!isMobile) {
    // Clicking the current page must not reload the document or refetch.
    await page.evaluate(() => ((window as unknown as { marker: boolean }).marker = true))
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Page 3' }).click()
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true)
  }
  expect(requests).toEqual([{ q: 'react', page: 3, sort: 'stars' }])
})

test('changing the sort order returns to the first page', async ({ page }) => {
  const requests = await mockSearchApi(page)
  await page.goto('/?q=react&page=2')
  await expect(page.getByRole('heading', { name: /showing 21–40/ })).toBeVisible()

  await page.getByRole('combobox', { name: 'Sort' }).selectOption('updated')

  await expect(page).toHaveURL(/\?q=react&sort=updated$/)
  await expect(page.getByRole('heading', { name: /showing 1–20/ })).toBeVisible()
  expect(requests.at(-1)).toEqual({ q: 'react', page: 1, sort: 'updated' })
})

test('a slow earlier search never replaces a newer one', async ({ page }) => {
  await mockSearchApi(page, async (request, route) => {
    if (request.q === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.fulfill({ json: makeSearchBody({ total: 3, prefix: 900 }) })
    } else {
      await route.fulfill({ json: makeSearchBody({ total: 2 }) })
    }
  })
  await page.goto('/')
  const input = page.getByRole('combobox', { name: 'Search repositories' })

  await input.fill('slow')
  await input.press('Enter')
  await input.fill('fast')
  await input.press('Enter')

  await expect(page.getByRole('heading', { name: /2 repositories/ })).toBeVisible()
  await page.waitForTimeout(2_000) // let the slow response arrive
  await expect(page.getByRole('heading', { name: /2 repositories/ })).toBeVisible()
  await expect(page.getByText('project-901')).toHaveCount(0)
  await expect(page).toHaveURL(/\?q=fast$/)
})

test('rate limiting shows a countdown and stops further requests', async ({ page }) => {
  const reset = Math.floor(Date.now() / 1000) + 40
  const requests = await mockSearchApi(page, (_request, route) =>
    route.fulfill({
      status: 403,
      json: { message: 'API rate limit exceeded' },
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(reset),
        'access-control-expose-headers': 'X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
      },
    }),
  )
  await page.goto('/?q=react')

  await expect(page.getByRole('heading', { name: 'Search limit reached' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Try again in \d+s/ })).toBeDisabled()

  const input = page.getByRole('combobox', { name: 'Search repositories' })
  await input.fill('vue')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: 'Search limit reached' })).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('long unbroken content does not overflow the page', async ({ page }) => {
  const longName = 'a'.repeat(120)
  await mockSearchApi(page, (_request, route) =>
    route.fulfill({
      json: {
        total_count: 1,
        incomplete_results: false,
        items: [
          makeRepo(1, {
            full_name: `${'o'.repeat(40)}/${longName}`,
            description: 'x'.repeat(600),
            topics: ['t'.repeat(80), 'b', 'c', 'd', 'e', 'f', 'g'],
            archived: true,
          }),
        ],
      },
    }),
  )
  await page.goto(`/?q=${'q'.repeat(200)}`)
  await expect(page.getByRole('heading', { name: /1 repository/ })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('mobile shows compact pagination', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only layout')
  await mockSearchApi(page)
  await page.goto('/?q=react')

  const nav = page.getByRole('navigation', { name: 'Pagination' })
  await expect(nav.getByText('Page 1 of 5')).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Page 2' })).toBeHidden()

  await nav.getByRole('link', { name: /Next/ }).click()
  await expect(nav.getByText('Page 2 of 5')).toBeVisible()
  await expect(page).toHaveURL(/page=2/)
})
