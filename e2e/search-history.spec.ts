import { expect, test } from '@playwright/test'
import { mockSearchApi } from './mockApi'

test('recent searches survive reload, restore filters, and can be removed or cleared', async ({ page }) => {
  const requests = await mockSearchApi(page)
  await page.goto('/?q=react&sort=stars&page=2')
  await expect(page.getByRole('heading', { name: /showing 21–40/ })).toBeVisible()

  const input = page.getByRole('combobox', { name: 'Search repositories' })
  await input.fill('vue')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: /repositories for “vue”/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /repositories for “vue”/ })).toBeVisible()

  await page.getByText('Recent searches', { exact: false }).click()
  const history = page.getByRole('list', { name: 'Recent searches' })
  await expect(history.getByRole('link')).toHaveCount(2)
  await history.getByRole('link', { name: 'react Most stars' }).click()
  await expect(page).toHaveURL(/\?q=react&sort=stars$/)
  await expect(page.getByRole('heading', { name: /showing 1–20/ })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('stars')
  expect(requests).toEqual([
    { q: 'react', sort: 'stars', page: 2 },
    { q: 'vue', sort: 'stars', page: 1 },
    { q: 'react', sort: 'stars', page: 1 },
  ])

  await history.getByRole('button', { name: 'Remove vue, Most stars from history' }).click()
  await expect(history.getByRole('link')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByText('Recent searches', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /repositories for “react”/ })).toBeVisible()

  await page.getByRole('link', { name: 'Repo Finder', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Find your next dependency.' })).toBeVisible()
  await expect(page).not.toHaveURL(/\?q=/)
  await page.reload()
  await expect(page.getByText('Recent searches', { exact: false })).toHaveCount(0)
})
