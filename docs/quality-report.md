# Quality report

This report records how Repo Finder's accessibility, keyboard support, size, performance and
resilience were verified, what was found and fixed, and what the checks cannot show. Every result
below states its conditions. Automated results use mocked GitHub responses unless stated otherwise.

## Conditions

| Item | Value |
| --- | --- |
| Date | 2026-09-30 (UTC); 2026-10-01 local time (JST) |
| Code basis | Working tree on top of commit `c044881`, including the fixes in this report (uncommitted). Sections 1–7 were measured before the filter controls, repository comparison and GitHub sign-in were merged; [the integration section](#integration-filters-comparison-and-sign-in) re-runs the checks on the combined tree. GitHub sign-in was removed afterwards (it is kept on the `feature/github-sign-in` branch) |
| OS and hardware | macOS 26.6.2 (Darwin 25.6.0, arm64), Apple M5 Pro, 18 logical cores, 64 GB |
| Runtime | Node.js v22.23.1, pnpm 12.8.1 |
| Browsers | Playwright 1.63.0: Chromium 153.0.8010.12 (headless), WebKit 26.6 |
| Accessibility engine | axe-core 4.13.0 via `@axe-core/playwright` 4.13.0 |
| E2E projects | `desktop-chromium` (Desktop Chrome, 1280×720, DPR 1); `mobile-webkit` (iPhone 15, 393×659, DPR 3, touch) |
| GitHub API | Mocked by `e2e/mockApi.ts` for every automated result; the manual pass used the live API (2 requests) |

## Summary

| Area | Method | Result | Issues found → fixed |
| --- | --- | --- | --- |
| Automated accessibility | axe on 11 UI states × 2 themes × 2 browsers ([`e2e/a11y.spec.ts`](../e2e/a11y.spec.ts)) | 0 violations after the fixes; contrast measured on 7–245 text nodes per state | Contrast check was silently not running; 1 contrast failure; 1 hidden error message |
| Keyboard | Keyboard-only journey in both themes plus a forced-colors check ([`e2e/keyboard.spec.ts`](../e2e/keyboard.spec.ts)); one manual pass | Every stop is reached in order, shows a visible indicator, and is not hidden under the header | Focus hidden under sticky header; focus lost after removing history; ring clipped at viewport edge; no focus indicator in forced colors |
| Size and performance | `vite build` output; [`scripts/perf.mjs`](../scripts/perf.mjs) (7 runs, median) | 374.46 kB JS (114.27 kB gzip); FCP 136 ms and submit → results 68 ms at 4× CPU | None fixed; observations recorded below |
| Resilience demo | [`e2e/search-resilience.spec.ts`](../e2e/search-resilience.spec.ts) plus existing specs, recordable | Pass on both browsers | Existing stale-response test could not detect a placeholder regression; the new test does |

Final validation before integration: `pnpm check` passed (boundaries, lint, 12 tooling tests,
170 unit/integration tests, build). `pnpm e2e` gave 49 passed, 5 skipped, 0 failed. The skips are
by design: the keyboard specs are desktop-only, and one pagination test is mobile-only. The new specs
also passed 10 repeated runs (250/250) before later additions, and the final keyboard spec passed 5 repeated runs.

## Integration: filters, comparison and sign-in

On 2026-10-01 the checks were re-run on the combined tree: this report's changes plus the filter
controls, the repository comparison and the in-progress GitHub sign-in work. Conditions are the same as above.
Sign-in was removed after this run; the account control is no longer part of the keyboard journey.

**What changed in the checks:**

- The axe spec gained two states, each in both themes and both browsers: active, locked and
  not-understood filter controls, and the comparison tray at its limit plus the comparison dialog.
- The keyboard journey now includes the account control, the filter controls (language, its Remove
  button, minimum stars, exclude archived), and one compare toggle per card, so each card has two
  tab stops. The compare toggle's ring is measured on its own label, not the whole card.
- The mobile compare journey activates the disabled (limit-reached) toggle by keyboard. It used to
  force a pointer click, which landed on the sticky tray after the scroll-padding change.

**Issues found by the checks and fixed:**

| # | Issue | Found by | Fix | Files |
| --- | --- | --- | --- | --- |
| 9 | The language filter's chevron was an SVG background with a fixed grey fill. It did not follow the theme, and axe could not measure the select's text contrast | axe ("background image") | A masked pseudo-element coloured with `--color-text-muted`, as the Sort control uses | `src/features/search/form/SearchFilters.tsx`, `filters.css` |
| 10 | The comparison tray was 92% opaque with a backdrop blur, so its text contrast depended on the results scrolling underneath | axe ("partially obscured") + screenshot | Opaque `--color-surface` background | `src/features/compare/compare.css` (then `src/features/search/compare/`) |

**Accepted exception:** in WebKit only, axe reports the comparison dialog's note as "partially
overlaps other elements". Hit testing across the note finds only the note and its ancestors, the
settled screenshot shows no overlap, and Chromium measures the same colours. That one node is exempt
on WebKit, and the exemption is attached to the test result. Every other unmeasured node still fails.

**Size and performance (combined tree):** from `node scripts/perf.mjs --runs 7 --cpu 4`, same machine and conditions.

| | Before integration | Combined |
| --- | --- | --- |
| JS (raw / gzip -9) | 374.46 kB / 112.92 kB | 402.62 kB / 120.56 kB |
| CSS (raw / gzip -9) | 27.19 kB / 6.00 kB | 40.44 kB / 7.81 kB |
| Landing transferred | 120.18 kB | 130.69 kB |
| Landing FCP | 136 ms | 148 ms |
| Submit → 20 results rendered | 68 ms | 64 ms |
| Next page → new range rendered | 56 ms | 63 ms |
| Results URL → 20 results rendered | 191 ms | 208 ms |
| Results URL CLS | 0.019 | 0.018 |

The combined tree adds 7.6 kB of gzipped JS and 1.8 kB of gzipped CSS across three features. The
timing differences are about 10 ms at 4× CPU, close to the run-to-run spread, and no long task appears after FCP.

**Found but not fixed:**

- The sticky comparison tray can cover the card that has keyboard focus near the bottom of the
  viewport. The root `scroll-padding-bottom` of 16px does not account for the tray's height (about
  120px on phones). This is a WCAG 2.4.11 risk. The keyboard journey does not select repositories, so
  the tray is absent there. A fix needs the tray's height as a scroll padding while it is shown.

## 1. Automated accessibility checks (axe)

**Command:** `pnpm e2e` (or `pnpm exec playwright test e2e/a11y.spec.ts`). Set `A11Y_SUMMARY=1` to
print one summary line per state. The same data is attached to each test in the Playwright report.

**Rules:** tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `best-practice`.

**States (each in light and dark, on desktop Chromium and mobile WebKit):** landing page;
empty-query validation hint; qualifier suggestions open with an active option; loading skeleton;
results; recent searches expanded; no results; saved results after a rate-limited refresh;
rate-limited error; GitHub unavailable (5xx after the automatic retry); invalid query (422).

**Conditions:** `prefers-reduced-motion: reduce` is emulated, so contrast is measured on settled
text rather than on a fade-in frame.

### First finding: the contrast check was not running

The first run reported zero violations, so I checked what axe had actually measured. axe had marked
**every** text node as "incomplete" for `color-contrast`: 13 of 13 on the landing page and 240 of
240 on the results page. It had measured **0**. Three decorative layers prevent axe from computing a background:

- `.app::before`, a 1px dot grid (about 1% coverage at 7–9% alpha);
- the `.app` radial glow gradient;
- `.sort-control::after`, the select's chevron.

For measurement only, the spec replaces these with the plain page background. The reasoning, from
`src/app/app.css` (`radial-gradient(900px 420px at 50% -160px, …, transparent 70%)`): the glow paints
only the top ~134px of the document, at ≤3.7% alpha in light and ≤3.2% in dark. The only text there
is the header brand in `--color-text`, which stays above 16:1 either way. The dot grid covers about 1%
of the area. The chevron does not overlap the "Sort" label, whose colours were checked separately:
4.63:1 in light and 5.20:1 in dark.

The spec now **fails** if any text remains unmeasured. Only two kinds of node are excluded: content
hidden under an open suggestion popover, and the ↑/↓ glyphs, which axe classifies as non-text symbols.
Their colour is `--color-text-muted` on `--color-surface`: 7.73:1 in light and 7.53:1 in dark.

### Results after the fixes

The counts are identical in both themes. "Contrast nodes" is the number of text nodes axe measured.

| State | axe rules passed | Contrast nodes: desktop / mobile | Violations |
| --- | --- | --- | --- |
| Landing | 42 | 13 / 13 | 0 |
| Empty-query hint | 42 | 14 / 14 | 0 |
| Qualifier suggestions open | 45 | 13 / 12 | 0 |
| Loading skeleton | 41 | 7 / 7 | 0 |
| Results (20 cards) | 51 | 240 / 237 | 0 |
| Recent searches expanded | 51 | 245 / 242 | 0 |
| No results | 41 | 12 / 12 | 0 |
| Saved results after failed refresh | 51 | 38 / 37 | 0 |
| Rate limited | 41 | 9 / 9 | 0 |
| GitHub unavailable | 41 | 10 / 10 | 0 |
| Invalid query | 41 | 11 / 11 | 0 |

### Issues found by this check

1. **Keyboard-hint text in the suggestion list failed contrast.** The `.suggestions__keys` text
   ("↑ ↓ to choose · Enter to insert · Esc to close") measured 4.39:1 in light (`#71717a` on
   `#f4f4f5`) and 4.48:1 in dark (`#7d8490` on `#1a1d22`), against the 4.5:1 minimum. It is shown on
   fine pointers only, so it failed on desktop and not on mobile. **Fix:** use `--color-text-muted`
   instead of `--color-text-subtle` (7.03:1 light, 6.90:1 dark) in `src/features/search/form/form.css`.
2. **The empty-query error message was hidden under the suggestion list.** An empty, focused field
   opens qualifier suggestions by design. Submitting it showed "Enter a keyword to search." directly
   beneath the popover, where sighted users could not see it (screen readers still announced it
   through `role="alert"`). axe reported the hint as "overlapped", and a screenshot confirmed it.
   **Fix:** an empty submit also dismisses the list (`src/features/search/form/SearchForm.tsx`); typing
   reopens it. The regression is covered by `src/app/App.test.tsx` (fails without the fix) and by the
   axe spec, which checks that the hint is the topmost element at its position.

### What this check does not cover

- axe tests a machine-checkable subset of WCAG. It cannot judge meaningful reading order, the quality of
  labels and announcements, cognitive load, or most of 1.3.x/2.4.x beyond structure.
- States not scanned: offline, a page past the last page, the "incomplete results" and "skipped
  results" notices, and the dimmed previous page while the next page loads. The dimmed page is
  deliberately rendered at 50% opacity with `aria-busy` and would not meet text contrast while it is
  shown; this is treated as inactive content.
- Mid-animation frames are not measured.

## 2. Keyboard

### 2.1 Automated keyboard-only journey

**Command:** `pnpm exec playwright test e2e/keyboard.spec.ts --project=desktop-chromium`. Set
`FOCUS_SUMMARY=1` to print the measurement at each stop.

The journey runs once per theme, using only key presses: Tab to the brand link and the theme radio
group, then arrow keys to pick Dark or Light. Tab to the search field; type `lang`, press ↓ and
Enter to insert `language:`; type `ru`, press ↓ and Enter to insert `rust`; type `to`, check that Esc
closes the list without clearing the field; then submit `language:rust topic:cli`. Tab through the
Search button, the Recent searches summary and Refresh results to the Sort select, and change it by
type-ahead. Tab through all 20 repository cards and every page link to Next, then press Enter.
Shift+Tab back up the page. Open the recent searches, reuse an entry, remove it, move back to
"Clear all" and press it. Finally, Shift+Tab to the brand link and press `/`.

At every stop the spec checks:

- **Focus location and order.** The expected element has focus; each card is exactly one tab stop;
  focus stays on Sort after results update and on the reused history entry after the list reorders.
- **A visible indicator, measured in pixels.** The element (or the theme label or card that draws its
  ring) is screenshotted focused and unfocused, with a 5px margin, and pixels whose colour changes by
  at least 3:1 contrast are counted. At least half of a 1px perimeter must change; this is my threshold
  for "visible" (2.4.7), not a WCAG formula. Computed styles are not compared, because forced-colors mode
  repaints without changing computed values (see 2.2).
- **Not obscured (2.4.11), and stricter.** The element must be below the sticky header, and its
  outline must fit inside the viewport.
- **Requests.** The recorded request log is exactly three searches: submit, sort, page 2.

Focus appearance after the fixes. The ratio compares the change with a 2px perimeter, the size WCAG
2.4.13 (AAA) asks for. It is informational and not enforced.

| Stop | Perimeter (px) | Pixels changed ≥3:1, dark / light | Ratio to 2px perimeter, dark / light |
| --- | --- | --- | --- |
| Brand link, theme radios, Search, summary, Refresh, page links, Next, results heading, history links, Clear all, Remove | 116–1,632 | 205–3,275 / 205–3,247 | 0.88–1.05 / 0.88–0.99 |
| Search field | 1,804 | 1,759 / 1,734 | 0.49 / 0.48 |
| Sort select | 396 | 363 / 348 | 0.46 / 0.44 |
| Repository cards (20) | 2,021 when fully visible | ≈2,000 / ≈1,980 | 0.50 / 0.49 |

The search field, Sort select and cards change a 1px border to the focus colour; the 22%-alpha ring
around them does not reach 3:1. They are clearly visible (see 2.3), but they would not meet a
2px-perimeter AAA heuristic. This is recorded as a possible improvement, not a failure.

### 2.2 Forced-colors (high contrast) mode

The test `focus stays visible in forced-colors (high contrast) mode` emulates
`forced-colors: active` in Chromium and measures the search field, Sort select, first card and a page link.

| Stop | Before fix (px changed) | After fix |
| --- | --- | --- |
| Search field | 1,098 (a faint border shift) | 4,703 |
| Sort select | **0** | 808 |
| First repository card | **35** (only the arrow icon) | 4,082 |
| Page 2 link | 368 | 368 |

These three indicators used `outline: none` and drew focus with `box-shadow` and `border-color`, which
forced-colors mode removes or overrides. **Fix:** `outline: 2px solid transparent` on those focus
states (`src/features/search/form/form.css` and `results/results.css`). The outline is invisible normally; forced-colors mode
repaints it in a system colour. A screenshot confirmed a clear outline on the focused card.
Limitation: this uses Chromium's emulation, not Windows High Contrast on real hardware.

### 2.3 Manual walkthrough

**Conditions:** the Claude Code desktop Browser pane (embedded Chromium; its version is not
exposed), connected to `pnpm build && pnpm preview --host 127.0.0.1 --port 5190 --strictPort`. Port
5174 was already in use by another process. The **live** GitHub API was used and received 2 requests.
The viewport height was 768px.

| Step | Observed |
| --- | --- |
| Tab to theme radio group, arrows | Green 2px ring clearly visible; arrows switch the theme immediately; choice saved in `localStorage` |
| Tab into search, `lang` ↓ | Active option shows a green marker and tint; the field shows a green border |
| Insert qualifiers, submit | `language:rust topic:cli` returned 14,561 live results; focus stayed in the field |
| Reload the results URL | 0 requests to api.github.com; results came from the session cache |
| Tab to Sort | Green border and soft ring, visible after the 200 ms transition |
| Tab to first card | Green border, soft ring and arrow icon; visible, but the subtlest indicator in light theme |
| 20 Tabs to "Page 1" | **Found:** the bottom of the focus ring was clipped at the viewport edge → fixed with `scroll-padding-bottom` (see below) and added to the spec |
| Enter on Next | Heading focused at y=80, below the 60px header; live region announced "Showing 21–40, page 2 of 50" |
| Shift+Tab to summary, open, remove last entry | Focus moved to the search field; no popover opened |
| Theme switch to dark, Tab to card | Settled dark state correct; ring clearly visible |
| Empty submit | Hint visible below the field, not covered (fix 2 above) |

Tool limitations observed during the pass (these are not app defects):

- The pane cannot drive a native `<select>`: its popup is drawn by the OS. On macOS, arrow keys open the
  popup rather than changing the value. Type-ahead is covered by the automated spec in headless Chromium.
- The pane's `type "/"` inserted the character even though the app cancels the keydown, apparently
  because it delivers text separately from key events. Playwright's real key events show the
  shortcut working, and the query stays selected.
- Batched key presses were sometimes applied late, and screenshots were occasionally stale. Each step was
  therefore re-verified with a DOM read.

### 2.4 What automation cannot prove here

- Whether indicators are noticeable enough for a given person. The pixel counts show that something
  changes; the manual pass judged the card and select rings visible but subtle.
- Screen-reader output. No VoiceOver, NVDA or TalkBack session was run. Roles, names and live regions
  are asserted, but not how they are announced.
- Firefox, desktop Safari and real Windows High Contrast were not tested. Mobile WebKit ran axe only,
  since it has no Tab navigation.
- A physical keyboard with a native `<select>` on macOS, and real IME composition (Japanese IME in
  Safari and Chrome), still need manual checks. The IME Enter guard is covered by a simulated unit test only.

## 3. Issues found and changes made

| # | Issue | Found by | Fix | Files |
| --- | --- | --- | --- | --- |
| 1 | axe measured no text contrast; the pass was vacuous | Inspecting axe's "incomplete" results | Measurement-only flattening, and a spec failure if any text is unmeasured | `e2e/a11y.spec.ts` |
| 2 | Suggestion keyboard hint below 4.5:1 (4.39 / 4.48) | axe | Muted instead of subtle text colour | `src/features/search/form/form.css` |
| 3 | Empty-query error hidden under the suggestion list | axe ("overlapped") + screenshot | Dismiss the list on an empty submit | `src/features/search/form/SearchForm.tsx`, `src/app/App.test.tsx` |
| 4 | Shift+Tab put focused controls fully under the sticky header (WCAG 2.2 2.4.11, AA); "Refresh results" at y=5 under a 60px header | Keyboard spec | `html { scroll-padding-top: calc(var(--header-height) + 20px) }`; the results heading's `scroll-margin-top` became redundant and was removed, and the heading still lands at y=80 | `src/app/app.css`, `src/features/search/results/results.css` |
| 5 | Focus ring clipped at the bottom viewport edge when tabbing forward | Manual pass | `scroll-padding-bottom: 16px`; the spec now includes the outline in its viewport check | `src/app/app.css`, `e2e/keyboard.spec.ts` |
| 6 | Removing a recent search, or "Clear all", dropped focus to `<body>` (back to the page start) | Keyboard spec | Focus moves to the Remove button of the entry that takes its place, or to the search field when the list disappears | `src/features/search/history/SearchHistory.tsx`, `SearchHistory.test.tsx` (2 tests, fail without the fix) |
| 7 | No visible focus on the Sort select and cards in forced-colors mode | Forced-colors pixel test + screenshot | `outline: 2px solid transparent` on three focus states | `src/features/search/form/form.css`, `results/results.css` |
| 8 | Stale-response E2E could not detect "previous query's results shown under the new query" | Mutation test (placeholder rule changed to always keep previous data): the existing and first-draft tests still passed | New test snapshots the heading and first card at every DOM change; it fails under the mutation | `e2e/search-resilience.spec.ts` |

No features were added. Every product change (2–7) is a focus, contrast or visibility correction.

## 4. Build size and performance

### Build output

From `pnpm build` (Vite 8.3.1; Vite reports kB = 1000 bytes and its own gzip level):

| File | Raw | gzip (Vite) | gzip -9 | brotli (q11) |
| --- | --- | --- | --- | --- |
| `index.html` | 1.01 kB | 0.56 kB | 0.56 kB | 0.41 kB |
| `assets/index-*.js` (single chunk) | 374.46 kB | 114.27 kB | 112.92 kB | 97.75 kB |
| `assets/index-*.css` | 27.19 kB | 6.02 kB | 6.00 kB | 5.30 kB |

The baseline build before this work was 374.12 kB of JS and 27.07 kB of CSS. The fixes added 0.34 kB
of JS (history focus handling) and 0.12 kB of CSS.
The landing page transfers 120.18 kB (encoded bodies, as served by `vite preview`).

**JS composition** (a one-off estimate, not scripted): a `vite build --sourcemap` written outside the
repo, with generated bytes attributed to sources through the source-map segments.

| Package | Bytes | Share |
| --- | --- | --- |
| react-dom | 207.1 kB | 55.3% |
| zod | 84.3 kB | 22.5% |
| App source (`src/`) | 36.2 kB | 9.7% |
| @tanstack/query-core + react-query | 32.8 kB | 8.7% |
| react + scheduler | 11.7 kB | 3.1% |

zod is the second-largest dependency. The schemas only validate one response shape, so `zod/mini`
or a narrower validator could save a meaningful share. That would be a change to the repository
domain, so it is recorded here as an option and not made.

### Performance

**Command:** `pnpm build && node scripts/perf.mjs --runs 7 --cpu 4` (add `--json` for raw runs,
`--port` or `PERF_PORT` to change the port; default 4312). The script is not part of `pnpm check`,
because its timings depend on the machine.

**Conditions:** `vite preview` of `dist/` on loopback; Playwright Chromium 153 headless; viewport
1280×720 at DPR 1; CPU throttling through CDP `Emulation.setCPUThrottlingRate`; no network
throttling; GitHub API mocked and answered instantly, so timings are the app's own work; avatar
images blocked; a fresh browser context per run (cold HTTP cache and storage); 1 discarded warm-up
run, then 7 measured runs, reporting the median with min and max. Timings are taken in the page with
`performance.now()`, and "rendered" means the DOM contains the 20 result cards, not that paint or
animations have finished.

| Metric | 4× CPU: median (min–max) | 20× CPU: median (min–max) |
| --- | --- | --- |
| Landing FCP | 136 ms (132–136) | 680 ms (664–700) |
| Landing LCP | 136 ms (132–136) | 680 ms (664–700) |
| Landing DOMContentLoaded | 80 ms (78–84) | 410 ms (396–428) |
| Landing TBT (long tasks after FCP) | 0 ms | 0 ms |
| Landing long tasks, total incl. before FCP | 61 ms (58–63) | 395 ms (391–406) |
| Landing CLS | 0.000 | 0.000 |
| Submit → 20 results rendered | 68 ms (64–70) | 382 ms (376–388) |
| Submit blocking time (>50 ms parts) | 0 ms | 204 ms (195–218) |
| Next page → new range rendered | 56 ms (55–57) | 268 ms (266–281) |
| Results URL: navigation → 20 results rendered | 191 ms (188–194) | 1,033 ms (1,024–1,046) |
| Results URL LCP | 244 ms (236–248) | 1,268 ms (1,248–1,272) |
| Results URL CLS | 0.019 | 0.019 |

Interpretation and observations:

- "4× CPU" means a 4× slowdown of a fast desktop CPU. It is not a model of a real phone, and 20× is a
  stress setting. The numbers are useful for comparing changes on this machine, not as field data.
- TBT stays at 0 even at 20× because it only counts long tasks after FCP, and script evaluation
  happens before FCP. The "long tasks, total" row shows that work: 395 ms at 20×.
- The CLS of 0.019 on a first visit to a results URL comes from the "Recent searches (1)" disclosure
  (36px plus 12px margin). It is inserted after the first render, when the history effect records the
  search, and moves the results down 48px. This only happens while history is empty, and it is below the
  0.1 "good" threshold, so behaviour was not changed.
- Not measured: network-constrained loading, real GitHub latency (typically hundreds of ms per search,
  which would dominate "submit → results"), mobile devices, and memory.

## 5. Resilience demo: stale responses, cache reuse, rate-limit recovery

| Scenario | Spec | What it proves |
| --- | --- | --- |
| Rapid switching: a slow earlier response never wins, and no other query's results appear even briefly | `e2e/search-resilience.spec.ts` › *rapid query switching…* (new) and `e2e/search.spec.ts` › *a slow earlier search never replaces a newer one* (existing) | `first` renders; `second` (1.5 s) and `third` (0.4 s) are submitted back to back. Every DOM change is snapshotted, and the cards always belong to the query in the heading. The late `second` response never appears. |
| Reload reuses the cache; Refresh fetches | `e2e/search-cache.spec.ts` › *a reload reuses fresh results…* (existing, reused) | A reload makes 0 new requests and keeps the original fetch time; Refresh makes 1 |
| Recovery after rate limiting | `e2e/search-resilience.spec.ts` › *after a rate limit, searching resumes…* (new); blocking alone is in `e2e/search.spec.ts` › *rate limiting shows a countdown…* (existing) | A 429 with `retry-after: 2` shows a countdown; a search during the wait sends no request; when the countdown ends, "Try again" is enabled and the search succeeds |
| Saved results survive a failed refresh | `e2e/search-cache.spec.ts` › *failed refreshing retains…* (existing) | Results stay visible with a message, and the refresh is on cooldown |

**Checking the checks:** I temporarily changed `placeholderData` in `useRepoSearch.ts` to always keep
the previous query's data. The existing two-query test and my first draft still passed, because no
earlier query had resolved and the heading always shows the current query. The final test failed, with
"3 repositories for “second” | project-101". The file was then restored unchanged.

**Reproduce, recording video and trace** (`E2E_RECORD=1` switches on `video: 'on'` and `trace: 'on'`
in `playwright.config.ts`):

```sh
pnpm install && pnpm exec playwright install chromium webkit
E2E_RECORD=1 pnpm exec playwright test e2e/search-resilience.spec.ts e2e/search-cache.spec.ts e2e/search.spec.ts \
  --project=desktop-chromium --grep "rapid|slow earlier|reload reuses|rate limit|failed refreshing"
# 6 tests; output: test-results/<test>/video.webm and trace.zip (about 4 MB in total)
pnpm exec playwright show-trace test-results/<test>/trace.zip   # step-by-step with DOM snapshots
```

Add `--headed` to watch live. The mocked delays are real time, so the demo takes a few seconds per test.

## 6. Reproducing everything

```sh
pnpm check                                   # boundaries, lint, tooling, unit/integration tests, build
pnpm e2e                                     # all E2E incl. a11y, keyboard and resilience specs (mocked API)
A11Y_SUMMARY=1 pnpm exec playwright test e2e/a11y.spec.ts        # per-state axe numbers
FOCUS_SUMMARY=1 pnpm exec playwright test e2e/keyboard.spec.ts --project=desktop-chromium
pnpm build && node scripts/perf.mjs --runs 7 --cpu 4             # size and performance tables
pnpm e2e:live                                # optional real-GitHub smoke test (not run for this report)
```

Use `E2E_PORT=<free port>` for a fixed E2E port. Do not run two builds or E2E sessions in one checkout.

## 7. Remaining limitations

- **Mocked versus live.** Every automated result uses `e2e/mockApi.ts`. Live GitHub was exercised only by
  hand (2 requests). `pnpm e2e:live` was not run for this report. Real rate-limit headers and timing may
  differ from the mocks.
- **Accessibility coverage.** axe covers a subset of WCAG. No screen reader was used. Forced colors was
  emulated in Chromium, not tested in Windows High Contrast.
- **Browsers.** Chromium and WebKit through Playwright only; no Firefox, desktop Safari or Edge. The keyboard journey is desktop Chromium only.
- **IME.** Real Japanese IME behaviour still needs a manual check in Safari and Chrome.
- **Performance.** Local, single machine, CPU throttling only, mocked API, headless. It is not field data,
  not a device model, and does not measure network conditions.
- **Comparison and filters.** Covered by axe, the keyboard journey and their own E2E specs, but not by a
  screen reader. The dialog's focus handling was checked by automation only.
- **Heuristics.** The "visible focus" pixel threshold and the contrast flattening are this project's
  documented heuristics. They make the checks meaningful, but they are not WCAG conformance tests.
