import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeSearchBody } from '../src/test/fixtures'
import { mockSearchApi } from './mockApi'

/*
 * Automated accessibility checks with axe-core against the main UI states,
 * with GitHub responses mocked. axe finds a subset of WCAG failures (roughly
 * the machine-checkable ones); it does not prove a state is accessible.
 * See docs/quality-report.md for what is covered manually.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * axe cannot compute a background under three decorations, so it reports every text
 * node above them as "incomplete" and color-contrast is silently not evaluated:
 *
 * - `.app::before`, a 1px dot grid (about 1% coverage, 7–9% alpha);
 * - the `.app` radial glow, which paints only the top ~134px of the document at
 *   3.7% alpha or less (see app.css). The only text there is the header brand in
 *   --color-text, which stays above 14:1 either way;
 * - `.sort-control::after` and `.search-filter__picker::after`, the selects' chevrons,
 *   which do not overlap their text.
 *
 * For the check they are replaced by the plain page background. This changes only
 * what axe measures, not the product; docs/quality-report.md records the reasoning.
 */
async function flattenDecorativeBackgrounds(page: Page) {
  const applied = await page.evaluate(() => {
    const style = document.createElement('style')
    style.dataset.testOnly = 'axe'
    style.textContent = `.app::before, .sort-control::after, .search-filter__picker::after { display: none !important; }
      .app { background: var(--color-bg) !important; }`
    document.head.append(style)
    return getComputedStyle(document.querySelector('.app')!).backgroundImage === 'none'
  })
  expect(applied, 'decorative backgrounds flattened for axe').toBe(true)
}

type Options = {
  /** An open popover legitimately hides the content beneath it, which axe cannot measure. */
  popoverOpen?: boolean
  /**
   * A single element axe leaves unmeasured for a verified, browser-specific reason. The reason
   * is attached to the test result; every other unmeasured node still fails the check.
   */
  unmeasuredException?: { selector: string; reason: string }
}

async function expectNoViolations(page: Page, label: string, { popoverOpen = false, unmeasuredException }: Options = {}) {
  await flattenDecorativeBackgrounds(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`).slice(0, 5),
  }))
  expect(summary, `axe violations in state "${label}"`).toEqual([])
  // Guard against a vacuous pass: rules ran, and no text was left unmeasured for contrast.
  expect(results.passes.length, `axe ran rules in state "${label}"`).toBeGreaterThan(30)
  const unmeasured = results.incomplete
    .filter((rule) => rule.id === 'color-contrast')
    .flatMap((rule) => rule.nodes.map((node) => `${node.target.join(' ')}: ${node.any[0]?.message ?? ''}`))
    .filter((node) => !(popoverOpen && node.includes('overlapped by another element')))
    // Arrow glyphs (↑ ↓) are symbols, which axe does not treat as text.
    .filter((node) => !node.includes('contains only non-text characters'))
    .filter((node) => !(unmeasuredException && node.startsWith(`${unmeasuredException.selector}: `)))
  if (unmeasuredException) {
    await test.info().attach(`axe exception: ${label}`, { body: unmeasuredException.reason, contentType: 'text/plain' })
  }
  expect(unmeasured, `text axe could not measure for contrast in state "${label}"`).toEqual([])
  const measured = results.passes.find((rule) => rule.id === 'color-contrast')?.nodes.length ?? 0
  const record = { state: label, rulesPassed: results.passes.length, contrastNodesMeasured: measured }
  await test.info().attach(`axe: ${label}`, { body: JSON.stringify(record), contentType: 'application/json' })
  if (process.env.A11Y_SUMMARY) console.log(`A11Y ${test.info().project.name} ${JSON.stringify(record)}`)
  await page.locator('style[data-test-only="axe"]').evaluateAll((styles) => styles.forEach((style) => style.remove()))
}

const rateLimited = {
  status: 403,
  json: { message: 'API rate limit exceeded' },
  headers: {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
    'access-control-expose-headers': 'X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After',
  },
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // The theme follows the system by default. Reduced motion makes contrast checks
      // deterministic: axe must not sample text midway through a fade-in.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    })

    test('landing page, empty-query hint and qualifier suggestions', async ({ page }) => {
      await mockSearchApi(page)
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
      await expect(page.getByRole('heading', { name: 'Find your next dependency.' })).toBeVisible()
      await expectNoViolations(page, 'landing')

      const input = page.getByRole('combobox', { name: 'Search repositories' })
      await input.press('Enter')
      const hint = page.getByRole('alert')
      await expect(hint).toHaveText('Enter a keyword to search.')
      // The hint must be visible, not hidden under the qualifier list.
      await expect(page.getByRole('listbox')).toHaveCount(0)
      expect(
        await hint.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(box.left + 8, box.top + box.height / 2))
        }),
      ).toBe(true)
      await expectNoViolations(page, 'empty-query hint')

      await input.fill('language:ru')
      await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible()
      await input.press('ArrowDown')
      await expect(page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option', { selected: true })).toBeVisible()
      await expectNoViolations(page, 'qualifier suggestions', { popoverOpen: true })
    })

    test('loading, results and recent searches', async ({ page }) => {
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await mockSearchApi(page, async (request, route) => {
        if (request.q === 'react') await held
        await route.fulfill({ json: makeSearchBody({ page: request.page, total: 95 }) })
      })
      await page.goto('/?q=react')
      await expect(page.getByRole('status').filter({ hasText: 'Loading results…' })).toBeAttached()
      await expectNoViolations(page, 'loading skeleton')

      release()
      await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()
      await expectNoViolations(page, 'results')

      await page.getByText('Recent searches', { exact: false }).click()
      await expect(page.getByRole('list', { name: 'Recent searches' })).toBeVisible()
      await expectNoViolations(page, 'recent searches open')
    })

    test('no results', async ({ page }) => {
      await mockSearchApi(page, (_request, route) =>
        route.fulfill({ json: { total_count: 0, incomplete_results: false, items: [] } }),
      )
      await page.goto('/?q=zzzz-no-such-repo')
      await expect(page.getByRole('heading', { name: /No repositories match/ })).toBeVisible()
      await expectNoViolations(page, 'no results')
    })

    test('rate limited, and saved results after a failed refresh', async ({ page }) => {
      let calls = 0
      await mockSearchApi(page, (request, route) => {
        calls += 1
        if (request.q === 'blocked') return route.fulfill(rateLimited)
        return calls === 1 ? route.fulfill({ json: makeSearchBody({ total: 2 }) }) : route.fulfill(rateLimited)
      })
      await page.goto('/?q=react')
      await expect(page.getByRole('heading', { name: /2 repositories/ })).toBeVisible()
      await page.getByRole('button', { name: 'Refresh results' }).click()
      await expect(page.getByText('Search limit reached. Showing saved results.')).toBeVisible()
      await expectNoViolations(page, 'saved results after failed refresh')

      await page.goto('/?q=blocked')
      await expect(page.getByRole('heading', { name: 'Search limit reached' })).toBeVisible()
      await expectNoViolations(page, 'rate limited')
    })

    test('filter controls: active, locked and not understood', async ({ page }) => {
      await mockSearchApi(page)
      await page.goto('/?q=react+language%3Arust+stars%3A%3E100+archived%3Afalse')
      await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('Rust')
      await expectNoViolations(page, 'active filters')

      await page.goto('/?q=react+language%3Arust+language%3Ago+stars%3A%3Eabc')
      await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()
      await expect(page.getByText(/appears more than once/)).toBeVisible()
      await expectNoViolations(page, 'locked and not-understood filters')
    })

    test('comparison tray and dialog', async ({ page }) => {
      await mockSearchApi(page)
      await page.goto('/?q=react')
      await expect(page.getByRole('heading', { name: /95 repositories/ })).toBeVisible()
      for (const name of ['project-1', 'project-2', 'project-3']) {
        await page.getByRole('checkbox', { name: `Compare octo-org/${name}`, exact: true }).check()
      }
      await expect(page.getByText('3 of 3 selected', { exact: true })).toBeVisible()
      await expectNoViolations(page, 'compare tray at the limit')

      await page.getByRole('button', { name: 'Compare selected repositories' }).click()
      const dialog = page.getByRole('dialog', { name: 'Compare repositories' })
      // Focus reaches the heading once the dialog has finished opening.
      await expect(dialog.getByRole('heading', { name: 'Compare repositories' })).toBeFocused()
      await expectNoViolations(page, 'compare dialog', {
        // WebKit only: axe reports this note as "partially overlaps other elements", yet hit
        // testing across the note finds only the note and its ancestors and screenshots show no
        // overlap. Its colour (--color-text-subtle on --color-surface) is measured in Chromium.
        unmeasuredException:
          test.info().project.name === 'mobile-webkit'
            ? { selector: '.compare-dialog__note', reason: 'WebKit partial-overlap false positive; measured in Chromium' }
            : undefined,
      })
    })

    test('server error and invalid query', async ({ page }) => {
      await mockSearchApi(page, (request, route) =>
        request.q === 'broken'
          ? route.fulfill({ status: 503, body: '' })
          : route.fulfill({
            status: 422,
            json: { message: 'Validation Failed', errors: [{ message: 'The search is longer than 256 characters.' }] },
          }),
      )
      await page.goto('/?q=broken')
      // One automatic retry for a 5xx response happens first (2 s delay).
      await expect(page.getByRole('heading', { name: 'GitHub search is unavailable' })).toBeVisible({ timeout: 10_000 })
      await expectNoViolations(page, 'unavailable')

      await page.goto('/?q=invalid')
      await expect(page.getByRole('heading', { name: 'GitHub couldn’t run this search' })).toBeVisible()
      await expectNoViolations(page, 'invalid query')
    })
  })
}
