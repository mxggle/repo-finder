# Repo Finder

A small React + TypeScript app for searching public GitHub repositories with the
[GitHub Search REST API](https://docs.github.com/en/rest/search/search#search-repositories).

**Live demo:** _added after deployment_

## Features

- Keyword search with GitHub qualifiers (`language:rust stars:>1000`, `topic:cli`, …)
- Numbered pagination (compact “Page 2 of 50” on phones)
- Sort by best match, stars, forks or recently updated
- Search, sort and page live in the URL, so results can be shared and the browser’s back/forward buttons work
- Designed loading, empty, error, rate-limit and offline states
- Responsive layout, light/dark themes, keyboard and screen-reader friendly

## Getting started

Requires Node.js 22+ and pnpm (`corepack enable` picks up the version pinned in `package.json`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

No token or environment variables are needed: the app calls the public API anonymously.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm check` | Lint, unit/integration tests, type-check and production build |
| `pnpm e2e` | Playwright tests against the production build (desktop Chromium + iPhone WebKit), with the API mocked |
| `pnpm e2e:live` | One smoke test against the real GitHub API (uses 2 requests of the rate limit) |
| `pnpm test:watch` | Vitest in watch mode |

Install Playwright browsers once with `pnpm exec playwright install chromium webkit`.
CI runs `pnpm check` and `pnpm e2e` on pushes to `main` and on pull requests, and deploys `main` to GitHub Pages.

## Design decisions

**The URL is the single source of truth.** `?q=&sort=&page=` is parsed and validated on every change
([`searchState.ts`](src/lib/searchState.ts)). A new query or sort order always starts at page 1.
Malformed values such as `page=abc` are rewritten in place, and `page` is capped at 50 (the last page the
API can serve). A page past the end of a smaller result set shows a message that links to the last page.
Because of this, every screen can be shared, and back/forward need no extra code.

**Working within the anonymous rate limit.** Without a token, GitHub allows 10 search requests a
minute, and a token cannot be kept secret in a browser-only app. So the app:

- searches on submit instead of on every keystroke;
- caches each query/sort/page for five minutes (TanStack Query), so going back to a page costs nothing;
- reads `retry-after` / `x-ratelimit-reset` on a limit response, shows a countdown, and refuses to send
  requests locally until the wait is over ([`github.ts`](src/api/github.ts)). It never retries a rate
  limit automatically;
- retries only network errors and 5xx responses, and only once.

**Only the first 1,000 results are reachable.** The Search API returns at most 1,000 results per query,
so pagination stops at page 50 (20 per page), and the UI says so when there are more matches. GitHub’s
`incomplete_results` flag (the search timed out) is shown as a notice instead of being ignored.

**Validating the API response.** Responses are checked with zod before rendering. Nullable fields such
as `description`, `language` and `license` get safe fallbacks. A result that cannot be shown safely
(for example, a link that is not an `https://github.com/` URL) is skipped, and the page says how many
were skipped. All external text is rendered as text, never as HTML.

**Keeping results consistent while loading.** Moving to another page or changing the sort keeps the
current results visible (dimmed, `aria-busy`) until the new page arrives. A new query never shows the
previous query’s results. Because responses are cached by their parameters, a slow earlier request
cannot overwrite a newer one.

**Japanese IME input.** Pressing Enter to confirm an IME conversion does not submit the search,
including Safari’s `keyCode 229` case.

**Libraries.** React 19, Vite, TanStack Query (caching, cancellation, retry policy) and zod. The styling
is plain CSS with custom properties ([`index.css`](src/index.css)); no UI framework.

## Testing

- **Unit/integration (Vitest, Testing Library, MSW):** URL-state parsing, pagination windows, response
  parsing, error classification, the rate-limit gate, and the app’s behaviour through the UI (paging,
  sort reset, history, empty/error states, IME Enter, out-of-order responses, text-only rendering).
- **End-to-end (Playwright):** keyboard-only journey, shared URLs, sort reset, a slow earlier response,
  rate limiting, long-content overflow, and mobile pagination. Runs on desktop Chromium and iPhone WebKit.
- **Live smoke test:** `pnpm e2e:live` searches the real API and opens page 2. It is kept out of CI
  because it depends on the network and a shared rate limit.

## Known limitations

- Anonymous use is limited to 10 searches per minute (shared per IP address).
- Only the first 1,000 results of a query are reachable (a GitHub API limit).
- Each page change sends a request right away. If you click “Next” several times quickly, every click
  still counts against the rate limit, even though the earlier requests are cancelled. A debounce would
  save requests but add delay to every page change.
- In development, React StrictMode mounts components twice, so the first search sends two requests.
  The production build sends one.
- Real IME behaviour cannot be simulated by the test tools. The Enter-to-confirm case is covered by a
  unit test that simulates the key events; the real behaviour needs a manual check with a Japanese IME
  in Safari and Chrome.
