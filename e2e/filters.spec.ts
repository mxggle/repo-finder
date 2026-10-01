import { expect, test } from '@playwright/test'
import { mockSearchApi } from './mockApi'

test('qualifiers become filters that edit the query in place', async ({ page }) => {
  const requests = await mockSearchApi(page)
  await page.goto('/')

  const input = page.getByRole('combobox', { name: 'Search repositories' })
  const filters = page.getByRole('group', { name: 'Filters' })
  await input.fill('react language:typescript stars:>100 user:octo -language:go')

  // Text → filters, before any search is sent.
  await expect(filters.getByRole('combobox', { name: 'Language' })).toHaveValue('TypeScript')
  const stars = filters.getByRole('textbox', { name: 'Stars more than' })
  await expect(stars).toHaveValue('100')
  expect(requests).toEqual([])

  await input.press('Enter')
  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()

  // Filters → text: Enter in the stars field applies it and searches once.
  await stars.fill('250')
  await stars.press('Enter')
  await expect(input).toHaveValue('react language:typescript stars:>250 user:octo -language:go')
  await expect(page).toHaveURL(/stars%3A%3E250/)
  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()

  // Removing a chip edits the draft only; unknown and negated qualifiers stay put.
  await filters.getByRole('button', { name: 'Remove language filter TypeScript' }).click()
  await expect(input).toHaveValue('react stars:>250 user:octo -language:go')
  await expect(filters.getByText('Language filter removed. Press Search to apply.')).toBeVisible()
  await expect(filters.getByRole('combobox', { name: 'Language' })).toBeFocused()

  await filters.getByRole('checkbox', { name: 'Exclude archived' }).check()
  await expect(input).toHaveValue('react stars:>250 user:octo -language:go archived:false')

  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/archived%3Afalse/)
  await expect(filters.getByText(/Press Search to apply/)).toHaveCount(0)

  expect(requests.map(({ q }) => q)).toEqual([
    'react language:typescript stars:>100 user:octo -language:go',
    'react language:typescript stars:>250 user:octo -language:go',
    'react stars:>250 user:octo -language:go archived:false',
  ])

  // One history entry per executed search, not per filter edit.
  await page.getByText('Recent searches', { exact: false }).click()
  await expect(page.getByRole('list', { name: 'Recent searches' }).getByRole('link')).toHaveCount(3)

  // Back restores the previous query and its filters.
  await page.goBack()
  await expect(input).toHaveValue('react language:typescript stars:>250 user:octo -language:go')
  await expect(filters.getByRole('combobox', { name: 'Language' })).toHaveValue('TypeScript')
})

test('ambiguous or malformed qualifiers are left to the text', async ({ page }) => {
  const requests = await mockSearchApi(page)
  await page.goto('/?q=' + encodeURIComponent('language:go language:rust stars:>abc'))
  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()

  const filters = page.getByRole('group', { name: 'Filters' })
  await expect(filters.getByText(/appears more than once/)).toBeVisible()
  await expect(filters.getByRole('combobox', { name: 'Language' })).toHaveCount(0)

  await filters.getByRole('button', { name: 'Remove invalid stars filter stars:>abc' }).click()
  await expect(page.getByRole('combobox', { name: 'Search repositories' })).toHaveValue('language:go language:rust')
  await expect(filters.getByRole('textbox', { name: 'Minimum stars' })).toBeFocused()
  expect(requests).toHaveLength(1)
})

test('filters wrap without horizontal scrolling on a narrow screen', async ({ page }) => {
  await mockSearchApi(page)
  await page.setViewportSize({ width: 320, height: 720 })
  const long = 'language:"a-language-name-that-is-far-too-long-to-fit" stars:10..1000000 archived:maybe-not-really'
  await page.goto('/?q=' + encodeURIComponent(long))
  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()

  const filters = page.getByRole('group', { name: 'Filters' })
  await expect(filters.getByRole('button', { name: 'Remove stars filter 10 to 1,000,000' })).toBeVisible()
  await expect(filters.getByRole('button', { name: /Remove invalid archived filter/ })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  for (const item of await filters.getByRole('listitem').all()) {
    const box = (await item.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
})
