import { expect, test } from '@playwright/test'

const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

const LIGHT_BG = 'rgb(250, 250, 250)'
const DARK_BG = 'rgb(11, 12, 14)'

test('light mode overrides a dark system theme and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const theme = page.getByRole('group', { name: 'Theme' })

  await expect(theme.getByRole('radio', { name: 'System' })).toBeChecked()
  expect(await background(page)).toBe(DARK_BG)

  await theme.getByTitle('Light theme').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background(page)).toBe(LIGHT_BG)

  await page.reload()
  // Applied before the app renders, so the first paint is already light.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(theme.getByRole('radio', { name: 'Light' })).toBeChecked()
  expect(await background(page)).toBe(LIGHT_BG)
})

test('the system option follows the operating system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  expect(await background(page)).toBe(LIGHT_BG)

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await background(page)).toBe(DARK_BG)
})
