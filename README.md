# Repo Finder

A small React + TypeScript app for searching public GitHub repositories with the
[GitHub Search REST API](https://docs.github.com/en/rest/search/search#search-repositories).

**Live demo:** _added after deployment_

## Features

- Keyword search with GitHub qualifiers (`language:rust stars:>1000`, `topic:cli`, …)
- Filter controls for language, minimum stars and archived repositories that stay in sync with the
  search text: typing `language:typescript stars:>100` shows editable filters, and editing or removing
  a filter rewrites only its own qualifier
- Numbered pagination (compact “Page 2 of 50” on phones)
- Sort by best match, stars, forks or recently updated
- Search, sort and page live in the URL, so results can be shared and the browser’s back/forward buttons work
- Recent searches saved on this device, with one-click reuse, individual removal, and clear-all
- Compare 2–3 repositories side by side (stars, forks, language, license, last push, archived status,
  description, topics); the selection survives pagination, sort and query changes, and reloads in the same tab
- Result caching across page reloads in the same tab, with fetch timestamps and an explicit refresh action
- Designed loading, empty, error, rate-limit and offline states
- Responsive layout; light and dark themes that follow the system or a saved choice from the header switcher; keyboard and screen-reader friendly; press `/` to jump to the search

## Getting started

Requires Node.js 22+ and pnpm (`corepack enable` picks up the version pinned in `package.json`).

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

No token, environment variables or backend are needed: the app calls the GitHub API directly from
the browser and deploys as static files.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm check` | Architecture boundaries, lint, tooling/unit/integration tests, type-check and production build |
| `pnpm check:boundaries` | Verify module dependencies and public interfaces |
| `pnpm test:tooling` | Verify architecture checks and parallel-test port selection |
| `pnpm e2e` | Playwright tests against the production build (desktop Chromium + iPhone WebKit), with the API mocked |
| `pnpm e2e:live` | One smoke test against the real GitHub API (uses 2 requests of the rate limit) |
| `pnpm test:watch` | Vitest in watch mode |

Install Playwright browsers once with `pnpm exec playwright install chromium webkit`.
CI runs `pnpm check` and `pnpm e2e` on pushes to `main` and on pull requests, and deploys `main` to GitHub Pages.

## Project structure and parallel development

The current project is one static Vite frontend, not a multi-package workspace. The directory layout
separates ownership as follows:

```text
src/
  main.tsx                 Mount React, application providers, and styles
  app/                     Page composition, providers, layout, and application tests
  features/
    search/                URL state, browser requests, query and cache policy, and their tests
      form/                Search box, qualifier suggestions, and filter controls
      results/             Result list, cards, pagination, and status states
      history/             Recent searches on this device
    compare/               Repository selection, comparison tray and dialog, CSS, and unit tests
  domain/repository/       Portable repository types, validation, parsing, and request parameters
  shared/
    ui/                    Reusable icons and control styles
    lib/                   General formatting, language colour, link, and view-transition helpers
  styles/                  Design tokens and base styles
  test/                    Shared test setup, mock server, and repository fixtures
e2e/                       Browser journeys and API mocks
scripts/                   Dependency-boundary checks and isolated test-port selection
docs/                      Architecture guide and quality evidence
```


Some implementation files are deliberately small: `app/App.tsx` is the application entry,
`app/styles.css` assembles the CSS cascade, and module `index.ts` files expose public APIs.
Their size does not indicate missing implementation.

The previous `src/components/`, `src/hooks/`, `src/api/`, and `src/lib/` layout has been retired.
Search-specific code now lives with search; portable parsing lives in the repository domain;
general helpers and icons live in shared. See the [migration map](docs/architecture.md#migration-map)
before looking for an old path or recreating a directory.

Read [the architecture and ownership guide](docs/architecture.md) and [AGENTS.md](AGENTS.md) before
changing module interfaces. Runtime dependencies, database setup, and backend credentials are not
required to build this frontend.

For parallel tasks, assign one feature directory to each owner and designate an integration owner
for `src/app/`, shared contracts, global styles, dependencies, and configuration. Features communicate
through application composition and public APIs; they do not import one another. A new feature should
bring its UI, logic, styles, and tests together, with only its needed integration points exported.

Use a separate worktree/checkout per parallel task and a distinct dev-server port, for example
`pnpm dev --port 5174 --strictPort`. Playwright selects a free loopback port and never reuses an
existing server. To select an explicit free port, run `E2E_PORT=4274 pnpm e2e`. Do not run concurrent
builds or E2E sessions in one checkout; they share `dist` and test output directories.

## Design decisions

**The URL is the single source of truth.** `?q=&sort=&page=` is parsed and validated on every change
([`searchState.ts`](src/features/search/searchState.ts)). A new query or sort order always starts at page 1.
Malformed values such as `page=abc` are rewritten in place, and `page` is capped at 50 (the last page the
API can serve). A page past the end of a smaller result set shows a message that links to the last page.
Because of this, every screen can be shared, and back/forward need no extra code.

**Working within GitHub's rate limits.** Anonymous search allows 10 requests per minute. The app:

- searches on submit instead of on every keystroke;
- reuses fresh results for each query/sort/page for five minutes (TanStack Query), so going back to a
  recently viewed page costs no additional search request;
- keeps a bounded session cache so reloading the same tab can reuse those results too; older saved
  results appear immediately while an eligible search refreshes in the background;
- reads `retry-after` / `x-ratelimit-reset` on a limit response, shows a countdown, and refuses to send
  requests locally until the wait is over ([`github.ts`](src/features/search/github.ts)). It never retries a rate
  limit automatically;
- retries only network errors and 5xx responses, and only once.

**No sign-in, by design.** Signing in would raise the limit to 30 searches per minute, but GitHub's
OAuth token exchange needs a client secret and cannot be called from a browser, so it requires a
server. That would turn a static site into a hosted service with secrets, sessions and a larger attack
surface, for a gain the search flow does not need. If it were added, a same-origin server would keep the
secret and tokens, use OAuth state with PKCE, request no scopes, and give the browser only an opaque
HttpOnly session cookie. Search would receive an optional transport from application composition and
keep separate caches and rate-limit gates per account.

**Search history stays on this device.** The recent-search disclosure below the search box keeps up
to 10 distinct query/sort combinations in `localStorage`. Only executed searches are recorded, not
keystrokes; pagination does not create another entry. Selecting an entry restores its query and sort
at page 1. Remove individual entries or clear the list without affecting the current results.
History is not sent to a separate service. Corrupt or unavailable browser storage does not prevent searching.

**Comparison uses data already on screen.** Each result card has a **Compare** checkbox. Up to three
repositories can be selected; at the limit the remaining checkboxes stay focusable but explain the limit
instead of selecting. The tray below the results lists the selection with per-item removal and **Clear all**,
and opens a modal comparison once two are selected: a table with repositories as columns and fields as row
headers. It is a native modal `<dialog>` rather than an inline region because the table needs more width
than the results column, and the element provides focus containment, Escape, and an inert page. Focus moves
to the dialog heading on open, stays on a neighbouring control when an item is removed, and returns to the
**Compare** button on close. On phones the dialog fills the screen and only the table scrolls sideways,
with field names pinned.
Values come from the search responses the repositories were selected from, so comparing sends no requests.
Missing values read “Unknown”; the only emphasis is a neutral “Highest” label on star and fork counts.
There is no score or recommendation. The selection stores repository snapshots, not only ids, because a
selected repository may not be on the current page. Repositories are deduplicated by id; when a selected
repository appears in a strictly newer response, its snapshot and fetch time are replaced, and older
cached pages never overwrite it. The selection is kept in `sessionStorage` for the current tab, so it survives
a reload but not a new session, and it is not written to the URL: the URL remains the shareable search state,
and a shared id list would need extra requests to rebuild snapshots. Stored data is size-bounded, versioned,
and revalidated with the same parser as API responses; blocked storage leaves an in-memory selection.

**Cached results keep their original age.** Successful responses are saved in `sessionStorage`,
separately from history, for up to 15 minutes, with a maximum of 20 result pages and a 1 MiB size cap
(counting each UTF-16 code unit as two bytes).
Freshness lasts five minutes from the original fetch, including after reload. Saved repository dates
and the fetch timestamp are validated and restored as dates; reading the cache never changes the
observation time. The result list shows when its data was fetched. **Refresh results** explicitly
requests a new response, subject to the existing rate-limit gate. If a background refresh fails or
pauses offline, saved results remain visible with an explanation. Invalid, expired, or unsupported
cache data is discarded; storage failures fall back to the normal in-memory query cache.
The app does not prefetch unvisited pages or issue requests for each keystroke.

**Only the first 1,000 results are reachable.** The Search API returns at most 1,000 results per query,
so pagination stops at page 50 (20 per page). When there are more matches, the count is shown in compact
form (exact figure in its tooltip) and the UI offers one-click refinements that search immediately: the
most common languages among the returned results, a minimum star count and `archived:false`, each only
when the query does not already set that filter. GitHub’s `incomplete_results` flag (the search timed
out) marks the count as approximate (“About”). A warning appears only when every match is otherwise
reachable, because missing matches are invisible behind the 1,000-result cap anyway.

**Validating the API response.** Responses are checked with zod before rendering. Nullable fields such
as `description`, `language` and `license` get safe fallbacks. A result that cannot be shown safely
(for example, a link that is not an `https://github.com/` URL) is skipped, and the page says how many
were skipped. All external text is rendered as text, never as HTML.

**Keeping results consistent while loading.** Moving to another page or changing the sort keeps the
current results visible (dimmed, `aria-busy`) until the new page arrives. A new query never shows the
previous query’s results. Because responses are cached by their parameters, a slow earlier request
cannot overwrite a newer one.

**Filters are a view of the search text.** The filter row under the search box
([`queryFilters.ts`](src/features/search/form/queryFilters.ts)) understands only `language:`, `stars:` and
`archived:`. It splits the text on whitespace, keeping `"quoted values"` together, and reads each
filter on every change. A filter edit replaces, adds or removes that one qualifier in place. Free text,
other qualifiers (`topic:`, `user:`, `in:name`), negations (`-language:go`, `NOT …`), token order,
quoting and spacing are kept as typed. Filters do not guess: if a qualifier appears twice, or is
next to `AND`/`OR` or inside brackets, its filter becomes a note that says to edit the text. A value
it cannot read (`stars:>abc`) can only be removed. Only a lower star bound (`>N`, `>=N`) is editable.
Other forms such as `<N`, `N..M` or an exact count appear as chips you can remove. Filter edits change
the text in the box, just like typing or picking a suggestion. They search only when you press
**Search**, or Enter in the stars field, so each edit does not use up the rate limit or add a
recent-search entry. The text is never rewritten during an IME composition.

**Japanese IME input.** Pressing Enter to confirm an IME conversion does not submit the search,
including Safari’s `keyCode 229` case.

**Libraries.** React 19, Vite, TanStack Query (caching, cancellation, retry policy) and zod. The styling
is plain CSS with custom properties, split between feature styles and shared primitives.
[`styles.css`](src/app/styles.css) defines the application cascade; no UI framework is required.

**Visual language and motion.** Graphite neutrals with one GitHub-green accent, reserved for actions
and active states; counts, qualifiers and metadata use the monospace face. All colours, radii, shadows,
easings and durations are tokens in [`tokens.css`](src/styles/tokens.css), with a dark palette that
follows the system setting. Motion is short and purposeful: moving between the landing page and results
uses the View Transitions API (where supported) so the search field glides into place, suggestions pop
from the field, and new result cards rise in with a short stagger. Everything collapses to instant
changes under `prefers-reduced-motion`.

## Testing

- **Unit/integration (Vitest, Testing Library, MSW):** URL-state parsing, pagination windows, response
  parsing, error classification, the rate-limit gate, and the app’s behaviour through the UI (paging,
  sort reset, history, empty/error states, IME Enter, out-of-order responses, text-only rendering),
  comparison selection rules, field formatting, selection storage, the compare tray and dialog,
  plus table-driven tests that parse and edit filter qualifiers, including identical output for no-op edits.
- **End-to-end (Playwright):** keyboard-only journey, shared URLs, sort reset, a slow earlier response,
  rate limiting, long-content overflow, mobile pagination, persistent search history, cache reuse
  across reloads, explicit refresh, keeping saved results after refresh failure, comparing repositories
  across pages (deduplication, the limit, removal, and the phone layout), and filter controls that stay
  in sync with the search text (including a 320px-wide layout). Runs on desktop Chromium and iPhone WebKit.
- **Live smoke test:** `pnpm e2e:live` searches the real API and opens page 2. It is kept out of CI
  because it depends on the network and a shared rate limit.
- **Quality evidence:** [docs/quality-report.md](docs/quality-report.md) records accessibility, keyboard, size and performance results with their conditions and limits.

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
