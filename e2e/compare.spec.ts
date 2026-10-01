import { expect, test, type Page } from '@playwright/test'
import { makeRepo, makeSearchBody } from '../src/test/fixtures'
import { mockSearchApi } from './mockApi'

const UPDATED_PROJECT_1 = makeRepo(1, { stargazers_count: 77_777 })

/**
 * Page 1 includes a repository with unknown fields. Page 2 repeats project-1, as GitHub
 * can when rankings shift between requests; every later response reports more stars for it.
 */
function mockCompareApi(page: Page) {
  return mockSearchApi(page, async (request, route) => {
    const body = makeSearchBody({ page: request.page, total: 95 })
    if (request.page === 1) body.items[2] = makeRepo(3, { stargazers_count: null, license: null, language: null })
    if (request.page === 2) body.items[0] = UPDATED_PROJECT_1
    if (request.sort !== null) body.items = body.items.map((item) => (item.id === 1 ? UPDATED_PROJECT_1 : item))
    await route.fulfill({ json: body })
  })
}

const toggle = (page: Page, name: string) => page.getByRole('checkbox', { name: `Compare octo-org/${name}`, exact: true })
const tray = (page: Page) => page.getByRole('region', { name: /^Compare \d of 3 selected$/ })

test('select across pages, deduplicate, respect the limit, compare, and remove', async ({ page, isMobile }) => {
  const requests = await mockCompareApi(page)
  await page.goto('/?q=react')
  await expect(page.getByRole('heading', { name: /showing 1–20/ })).toBeVisible()

  await toggle(page, 'project-1').check()
  await toggle(page, 'project-3').check()
  await expect(tray(page)).toContainText('2 of 3 selected')

  await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: /Next/ }).click()
  await expect(page.getByRole('heading', { name: /showing 21–40/ })).toBeVisible()
  // project-1 is repeated on page 2; it is the same selection, not a new one.
  await expect(toggle(page, 'project-1')).toBeChecked()
  await expect(tray(page).getByRole('listitem')).toHaveCount(2)

  await toggle(page, 'project-22').check()
  await expect(tray(page)).toContainText('3 of 3 selected')
  const blocked = toggle(page, 'project-23')
  await expect(blocked).toHaveAttribute('aria-disabled', 'true')
  await expect(blocked).toHaveAccessibleDescription(/You can compare up to 3 repositories/)
  // Playwright waits on aria-disabled controls; a keyboard user can still activate one and gets the
  // explanation. A forced pointer click would land on whatever covers it, such as the sticky tray.
  await blocked.focus()
  await page.keyboard.press('Space')
  await expect(blocked).not.toBeChecked()
  await expect(tray(page).getByText('You can compare up to 3 repositories. Remove one to add another.')).toBeVisible()

  // A different sort (and page) keeps the selection.
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('stars')
  await expect(page).toHaveURL(/sort=stars/)
  await expect(tray(page)).toContainText('3 of 3 selected')

  const requestsBeforeCompare = requests.length
  const open = page.getByRole('button', { name: 'Compare selected repositories' })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Compare repositories' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Compare repositories' })).toBeFocused()
  await expect(dialog.getByRole('columnheader')).toHaveText([/project-1 /, /project-3 /, /project-22 /])
  // The snapshot of project-1 was refreshed from a newer response than the one it was selected from.
  await expect(dialog.getByRole('row', { name: /^Stars/ })).toContainText('77,777')
  await expect(dialog.getByRole('row', { name: /^Stars/ })).toContainText('Unknown')
  await expect(dialog.getByRole('row', { name: /^License/ })).toContainText('Unknown')

  if (isMobile) {
    const layout = await page.evaluate(() => {
      const dialogBox = document.querySelector('dialog[open]')!.getBoundingClientRect()
      const scroller = document.querySelector('.compare-dialog__scroll')!
      const fieldName = document.querySelector('.compare-table tbody th')!
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        dialogFits: dialogBox.left >= 0 && dialogBox.right <= window.innerWidth,
        tableScrolls: scroller.scrollWidth > scroller.clientWidth,
        stickyFieldNames: getComputedStyle(fieldName).position,
      }
    })
    expect(layout).toEqual({ pageOverflow: 0, dialogFits: true, tableScrolls: true, stickyFieldNames: 'sticky' })
    // Field names stay visible while the repository columns scroll sideways.
    await dialog.getByRole('region', { name: 'Comparison table' }).evaluate((element) => element.scrollBy(400, 0))
    await expect(dialog.getByRole('rowheader', { name: 'Stars' })).toBeInViewport()
  }

  await dialog.getByRole('button', { name: 'Remove octo-org/project-3 from comparison' }).click()
  await expect(dialog.getByRole('columnheader')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: 'Remove octo-org/project-22 from comparison' })).toBeFocused()

  if (isMobile) await dialog.getByRole('button', { name: 'Close' }).click()
  else await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()

  // Closing resets the dialog, so the same button opens it again.
  await open.click()
  await expect(dialog.getByRole('columnheader')).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  expect(requests.length).toBe(requestsBeforeCompare)

  // Selection survives a reload in the same tab.
  await page.reload()
  await expect(tray(page)).toContainText('2 of 3 selected')
  await tray(page).getByRole('button', { name: 'Remove octo-org/project-1 from comparison' }).click()
  await expect(tray(page)).toContainText('1 of 3 selected')
  await tray(page).getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByRole('region', { name: /selected$/ })).toHaveCount(0)
})

test('the compare toggle works from the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard journey is a desktop concern')
  await mockCompareApi(page)
  await page.goto('/?q=react')

  const link = page.getByRole('link', { name: 'octo-org/project-1 (opens in a new tab)', exact: true })
  await link.focus()
  await page.keyboard.press('Tab')
  const first = toggle(page, 'project-1')
  await expect(first).toBeFocused()
  // Focus must be visible on the drawn control, not only present on the hidden input.
  expect(await first.evaluate((input) => getComputedStyle(input.parentElement!).outlineStyle)).not.toBe('none')
  await page.keyboard.press('Space')
  await expect(first).toBeChecked()
  await expect(tray(page)).toContainText('1 of 3 selected')
  await expect(page.getByRole('button', { name: 'Compare selected repositories' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})
