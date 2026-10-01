import { expect, test, type Locator, type Page } from '@playwright/test'
import { mockSearchApi } from './mockApi'

/*
 * The complete core journey using only the keyboard: theme, "/" shortcut, qualifier
 * suggestions, submit, filter controls, sort, results with compare toggles, pagination
 * and recent searches. At each stop it
 * checks that focus is where it should be, visibly styled, and not hidden under the
 * sticky header. It cannot judge whether the indicator is noticeable enough to a
 * person, or how a screen reader announces each step; see docs/quality-report.md.
 */

/** Elements that draw the focus ring for a focused descendant. */
const RING_HOST = '.theme-switcher__option, .compare-toggle, .repo-card'
const focusAppearance: { stop: string; changedPixels: number; perimeter: number }[] = []

/**
 * Focus is visible when the rendered pixels change: the ring host (the element, its
 * theme label, its compare toggle or its repository card) is captured with a 5px margin while focused and
 * unfocused, and pixels whose colour changes by at least 3:1 contrast are counted. At
 * least half of a 1px perimeter must change (this spec's threshold for "visible",
 * WCAG 2.4.7). The ratio to a 2px perimeter (the WCAG 2.4.13 AAA size) is recorded
 * for the report but not enforced. Pixels, not computed styles, are compared because
 * forced-colors mode repaints box-shadows and borders without changing computed values.
 */
async function expectVisibleFocus(page: Page, name: string) {
  // The visible part of the ring host; tabbing may scroll only the link of a card into view.
  const box = await page.evaluate((selector) => {
    const element = document.activeElement as HTMLElement
    const rect = (element.closest(selector) ?? element).getBoundingClientRect()
    const top = Math.max(rect.top, 0)
    const bottom = Math.min(rect.bottom, window.innerHeight)
    const edges = (rect.top >= 0 ? 1 : 0) + (rect.bottom <= window.innerHeight ? 1 : 0)
    return { x: rect.x, y: top, width: rect.width, height: bottom - top, perimeter: 2 * (bottom - top) + edges * rect.width }
  }, RING_HOST)
  const margin = 5 // outline width + offset, short of the suggestion list 6px below the field
  const clip = { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin }
  const capture = async () =>
    `data:image/png;base64,${(await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })).toString('base64')}`

  const focused = await capture()
  await page.evaluate(() => {
    const element = document.activeElement as HTMLElement
    ;(window as unknown as { refocus: () => void }).refocus = () => element.focus({ preventScroll: true })
    element.blur()
  })
  const unfocused = await capture()
  // After keyboard input, a scripted focus() still matches :focus-visible.
  await page.evaluate(() => (window as unknown as { refocus: () => void }).refocus())

  const changedPixels = await page.evaluate(async ([a, b]) => {
    const pixels = async (src: string) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      return context.getImageData(0, 0, image.width, image.height).data
    }
    const [first, second] = await Promise.all([pixels(a), pixels(b)])
    const channel = (value: number) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4)
    const luminance = (data: Uint8ClampedArray, i: number) =>
      0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2])
    let count = 0
    for (let i = 0; i < first.length; i += 4) {
      const [light, dark] = [luminance(first, i), luminance(second, i)].sort((x, y) => y - x)
      if ((light + 0.05) / (dark + 0.05) >= 3) count++
    }
    return count
  }, [focused, unfocused])

  const perimeter = Math.round(box.perimeter)
  focusAppearance.push({ stop: name, changedPixels, perimeter })
  expect.soft(changedPixels, `visible focus indicator on ${name} (pixels changed at >= 3:1)`).toBeGreaterThanOrEqual(perimeter / 2)
}

test.afterEach(async () => {
  if (focusAppearance.length === 0) return
  const rows = focusAppearance.map((row) => ({ ...row, ratioTo2pxPerimeter: +(row.changedPixels / (2 * row.perimeter)).toFixed(2) }))
  await test.info().attach('focus appearance', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' })
  if (process.env.FOCUS_SUMMARY) for (const row of rows) console.log(`FOCUS ${test.info().title} | ${JSON.stringify(row)}`)
  focusAppearance.length = 0
})

/**
 * WCAG 2.4.11: the focused element is not hidden under the sticky header. Stricter
 * than the criterion, its focus outline must also fit inside the viewport.
 */
async function expectNotObscured(page: Page, name: string) {
  const box = await page.evaluate(() => {
    const element = document.activeElement!
    const target = element.closest('.theme-switcher__option') ?? element
    const rect = target.getBoundingClientRect()
    const style = getComputedStyle(target)
    const ring = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
    const header = document.querySelector('.site-header')!.getBoundingClientRect()
    const insideHeader = element.closest('.site-header') !== null
    return {
      top: rect.top - ring,
      bottom: rect.bottom + ring,
      headerBottom: insideHeader ? 0 : header.bottom,
      viewport: window.innerHeight,
    }
  })
  expect(box.top, `${name} is below the sticky header`).toBeGreaterThanOrEqual(box.headerBottom - 1)
  expect(box.bottom, `${name} and its outline are inside the viewport`).toBeLessThanOrEqual(box.viewport)
}

async function tab(page: Page, name: string, { shift = false } = {}) {
  await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab')
  await expectNotObscured(page, name)
}

async function expectFocus(locator: Locator, page: Page, name: string) {
  await expect(locator, `${name} has focus`).toBeFocused()
  await expectVisibleFocus(page, name)
  await expectNotObscured(page, name)
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard journey is a desktop concern; mobile WebKit has no Tab navigation')
  // Focus rings fade in over 120–200 ms. Reduced motion makes them instant, so the
  // pixel comparison sees the settled indicator rather than a transition frame.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

for (const theme of ['dark', 'light'] as const) {
  test(`complete journey by keyboard only (${theme} theme)`, async ({ page }) => {
    const requests = await mockSearchApi(page)
    await page.goto('/')

    // Header: brand link, then the theme radio group (one tab stop, arrows select).
    await tab(page, 'brand link')
    await expectFocus(page.getByRole('link', { name: 'Repo Finder', exact: true }), page, 'brand link')
    await tab(page, 'theme switcher')
    const themes = page.getByRole('group', { name: 'Theme' })
    await expectFocus(themes.getByRole('radio', { name: 'System' }), page, 'System theme radio')
    // Arrow keys move through Light, Dark, System; the choice applies immediately.
    const label = theme === 'dark' ? 'Dark' : 'Light'
    await page.keyboard.press('ArrowLeft')
    if (theme === 'light') await page.keyboard.press('ArrowLeft')
    await expect(themes.getByRole('radio', { name: label })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expectFocus(themes.getByRole('radio', { name: label }), page, `${label} theme radio`)

    // Search field with qualifier suggestions.
    await tab(page, 'search field')
    const input = page.getByRole('combobox', { name: 'Search repositories' })
    await expectFocus(input, page, 'search field')
    await page.keyboard.type('lang')
    const listbox = page.getByRole('listbox', { name: 'Suggestions' })
    await expect(listbox.getByRole('option', { name: /language:/ })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(input).toHaveAttribute('aria-activedescendant', 'search-suggestion-0')
    await expect(listbox.getByRole('option', { selected: true })).toContainText('language:')
    await page.keyboard.press('Enter')
    await expect(input).toHaveValue('language:')
    await page.keyboard.type('ru')
    await expect(listbox.getByRole('option', { name: /^Rust/ })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(input).toHaveValue('language:rust ')
    // Escape closes the list without clearing the field.
    await page.keyboard.type('to')
    await expect(listbox.getByRole('option', { name: /topic:/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(listbox).toHaveCount(0)
    await expect(input).toHaveValue('language:rust to')
    await page.keyboard.type('pic:cli')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /95 repositories for “language:rust topic:cli”/ })).toBeVisible()
    await expect(page).toHaveURL(/\?q=language%3Arust\+topic%3Acli$/)
    await expect(input, 'focus stays in the field after submitting').toBeFocused()

    // Forward through the toolbar to the sort control and change it by keyboard.
    await tab(page, 'Search button')
    await expectFocus(page.getByRole('button', { name: 'Search', exact: true }), page, 'Search button')
    // Filter controls mirror the submitted qualifiers; each is one tab stop.
    await tab(page, 'Language filter')
    await expectFocus(page.getByRole('combobox', { name: 'Language' }), page, 'Language filter')
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('Rust')
    await tab(page, 'Remove language filter')
    await expectFocus(page.getByRole('button', { name: 'Remove language filter Rust' }), page, 'Remove language filter')
    await tab(page, 'Minimum stars filter')
    await expectFocus(page.locator('#search-filter-stars'), page, 'Minimum stars filter')
    await tab(page, 'Exclude archived filter')
    await expectFocus(page.locator('#search-filter-archived'), page, 'Exclude archived filter')
    await tab(page, 'Recent searches summary')
    await expectFocus(page.locator('summary', { hasText: 'Recent searches' }), page, 'Recent searches summary')
    await tab(page, 'Refresh results')
    await expectFocus(page.getByRole('button', { name: 'Refresh results' }), page, 'Refresh results')
    await tab(page, 'Sort')
    const sort = page.getByRole('combobox', { name: 'Sort' })
    await expectFocus(sort, page, 'Sort select')
    // Type-ahead on a closed native select changes the value without opening it.
    await page.keyboard.type('Most s')
    await expect(page).toHaveURL(/\?q=language%3Arust\+topic%3Acli&sort=stars$/)
    await expect(page.getByRole('heading', { name: /showing 1–20/ })).toBeVisible()
    await expect(sort, 'focus stays on Sort after the results update').toBeFocused()

    // Each repository card has two tab stops, its link and its compare toggle, each with a focus ring.
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(20)
    for (let index = 0; index < 20; index++) {
      await tab(page, `repository ${index + 1}`)
      await expectFocus(cards.nth(index).getByRole('link'), page, `repository ${index + 1}`)
      await tab(page, `compare toggle ${index + 1}`)
      await expectFocus(cards.nth(index).getByRole('checkbox', { name: /^Compare / }), page, `compare toggle ${index + 1}`)
    }

    // Pagination: "Previous" is not a stop on page 1; the next stop is page 1 (current).
    const nav = page.getByRole('navigation', { name: 'Pagination' })
    await tab(page, 'current page link')
    await expectFocus(nav.getByRole('link', { name: 'Page 1' }), page, 'current page link')
    const pageLinks = await nav.getByRole('link', { name: /^Page \d+$/ }).all()
    expect(pageLinks.length, 'numbered page links').toBeGreaterThan(2)
    for (const link of pageLinks.slice(1)) {
      const label = (await link.getAttribute('aria-label'))!
      await tab(page, label)
      await expectFocus(link, page, label)
    }
    await tab(page, 'Next')
    await expectFocus(nav.getByRole('link', { name: /Next/ }), page, 'Next')
    await page.keyboard.press('Enter')

    const heading = page.getByRole('heading', { name: /showing 21–40/ })
    await expectFocus(heading, page, 'results heading after page change')
    await expect(page).toHaveURL(/&page=2$/)

    // Backwards: Shift+Tab from the heading reaches the controls above it without
    // them sliding under the sticky header.
    await tab(page, 'Refresh results (backwards)', { shift: true })
    await expectFocus(page.getByRole('button', { name: 'Refresh results' }), page, 'Refresh results (backwards)')
    await tab(page, 'Recent searches summary (backwards)', { shift: true })
    const summary = page.locator('summary', { hasText: 'Recent searches' })
    await expectFocus(summary, page, 'Recent searches summary (backwards)')

    // Recent searches: open, reuse an entry, then remove and clear entries.
    await page.keyboard.press('Enter')
    const history = page.getByRole('list', { name: 'Recent searches' })
    await expect(history).toBeVisible()
    await tab(page, 'Clear all')
    await expectFocus(page.getByRole('button', { name: 'Clear all' }), page, 'Clear all')
    await tab(page, 'first history entry')
    // Newest first: the stars search, then the best-match search.
    const bestMatch = history.getByRole('link', { name: 'language:rust topic:cli Best match' })
    await expectFocus(history.getByRole('link', { name: 'language:rust topic:cli Most stars' }), page, 'first history entry')
    await tab(page, 'first Remove button')
    await tab(page, 'second history entry')
    await expectFocus(bestMatch, page, 'second history entry')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\?q=language%3Arust\+topic%3Acli$/)
    await expect(sort).toHaveValue('best-match')
    // The reused entry moves to the top of the list and keeps focus.
    await expect(history.getByRole('link').first()).toHaveAccessibleName('language:rust topic:cli Best match')
    await expectFocus(bestMatch, page, 'reused history entry')

    await tab(page, 'Remove reused entry')
    await expectFocus(history.getByRole('button', { name: /^Remove .*Best match/ }), page, 'Remove reused entry')
    await page.keyboard.press('Enter')
    await expect(history.getByRole('link')).toHaveCount(1)
    // Focus moves to the Remove button of the entry that took the removed one's place.
    await expectFocus(history.getByRole('button', { name: /^Remove .*Most stars/ }), page, 'Remove button after removal')

    await tab(page, 'remaining history entry (backwards)', { shift: true })
    await tab(page, 'Clear all (backwards)', { shift: true })
    await expectFocus(page.getByRole('button', { name: 'Clear all' }), page, 'Clear all (backwards)')
    await page.keyboard.press('Enter')
    await expect(page.locator('summary', { hasText: 'Recent searches' })).toHaveCount(0)
    await expect(input, 'focus moves to the search field when the history disappears').toBeFocused()

    // "/" jumps back to the search from anywhere outside a field and selects its text.
    await tab(page, 'theme switcher (backwards)', { shift: true })
    await tab(page, 'brand link (backwards)', { shift: true })
    await expect(page.getByRole('link', { name: 'Repo Finder', exact: true })).toBeFocused()
    await page.keyboard.press('/')
    await expect(input).toBeFocused()
    expect(await input.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBe(
      'language:rust topic:cli'.length,
    )

    expect(requests).toEqual([
      { q: 'language:rust topic:cli', page: 1, sort: null },
      { q: 'language:rust topic:cli', page: 1, sort: 'stars' },
      { q: 'language:rust topic:cli', page: 2, sort: 'stars' },
    ])
  })
}

test('focus stays visible in forced-colors (high contrast) mode', async ({ page }) => {
  // Forced colors drop box-shadows and override border colours, so an indicator
  // drawn only with them disappears; outlines are repainted in a system colour.
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await mockSearchApi(page)
  await page.goto('/?q=react')
  await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()

  const stops: [string, Locator][] = [
    ['search field', page.getByRole('combobox', { name: 'Search repositories' })],
    ['Sort select', page.getByRole('combobox', { name: 'Sort' })],
    ['first repository', page.getByRole('article').first().getByRole('link')],
    ['Page 2 link', page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Page 2' })],
  ]
  for (const [name, locator] of stops) {
    // Reach each stop from the previous element by keyboard so :focus-visible applies.
    await locator.evaluate((element) => {
      const all = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, summary')]
      all[all.indexOf(element as HTMLElement) - 1]?.focus()
    })
    await page.keyboard.press('Tab')
    await expectFocus(locator, page, `${name} (forced colors)`)
  }
})
