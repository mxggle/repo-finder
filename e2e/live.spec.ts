import { expect, test } from '@playwright/test'

// Uses the real GitHub API (two anonymous search requests). Not part of CI,
// because it depends on the network and a shared rate limit.
test('live GitHub search and pagination @live', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Search repositories' }).fill('react')
  await page.getByRole('combobox', { name: 'Search repositories' }).press('Enter')

  await expect(page.getByRole('heading', { name: /repositories/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: /facebook\/react|react\/react/ }).first()).toBeVisible()

  await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Page 2' }).click()
  await expect(page.getByRole('heading', { name: /showing 21–40/ })).toBeVisible({ timeout: 15_000 })
})
