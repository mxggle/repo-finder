# Architecture and parallel development

Implemented structure: October 1, 2026. The application is one static Vite frontend that calls the
GitHub Search API directly from the browser. The GitHub Pages workflow deploys it; there is no backend.

## Module map

```text
src/
  app/                       Application composition, providers, cross-feature tests and layout
    App.tsx                  Application entry
    SearchPage.tsx           Search page composition and navigation
    ThemeSwitcher.tsx        Light/dark/system choice in the site header; logic in theme.ts
    styles.css               Ordered stylesheet imports
  features/
    search/                  URL state, browser API, query and cache policy, and their tests
      form/                  Search box, qualifier suggestions and filter controls
      results/               Result list, cards, pagination and status states
      history/               Recent searches on this device
    compare/                 Result selection, comparison tray and dialog, their styles and tests
  domain/repository/         Runtime-neutral models, parsing, validation and request parameters
  shared/
    ui/                      Icons and reusable control styles
    lib/                     Formatting, language colour, link and view-transition helpers
  styles/                    Tokens, reset, base styles and shared motion
  test/                      Test bootstrap, mock server and repository fixtures
e2e/                         Combined user journeys
scripts/                     Dependency-boundary, parallel-test and local performance tooling
docs/                        Architecture decisions and quality evidence
```

Add subdirectories only when they make an actual responsibility easier to find. Search groups its
input (`form/`), result presentation (`results/`) and recent searches (`history/`) by
responsibility; the URL state, transport and query policy they share stay at its root. Never group by
technical type (`components/`, `hooks/`, `utils/`). Unit tests live beside the module they verify. Cross-feature integration tests live
in `src/app/`; browser journeys stay in `e2e/`.

### Current implementation

Search and comparison are the executable features in this checkout. There are no `apps/` or `packages/`
directories; do not create empty modules to reserve structure.

Keep intentional entrypoints small: `app/App.tsx` selects the application page, `app/styles.css`
orders stylesheet imports, and each public `index.ts` lists supported exports. These are functioning
boundaries, not empty scaffolds. Do not create empty source files or `.gitkeep` placeholders just to
match the future tree. Remove obsolete empty directories after migrations.

### Migration map

| Previous location | Current location / responsibility |
| --- | --- |
| `src/App.tsx`, `src/App.test.tsx` | `src/app/`; page composition is in `SearchPage.tsx` |
| `src/queryClient.ts` | `src/app/queryClient.ts`; provider setup in `providers.tsx` |
| `src/components/` | Search components in `src/features/search/`; generic icons in `src/shared/ui/` |
| `src/hooks/` | Search hooks in `src/features/search/` |
| `src/api/github.ts` and tests | Browser requests in `src/features/search/github.ts`; portable parsing in `src/domain/repository/` |
| `src/lib/` | Search rules in `src/features/search/`; general format/link helpers in `src/shared/lib/` |
| `src/lib/pagination.ts` | `src/features/search/results/pageItems.ts`; distinct from the `Pagination.tsx` component |
| `src/index.css` | Tokens/base, app, shared controls, and feature CSS; assembled by `src/app/styles.css` |

The old `components`, `hooks`, `api`, and `lib` directories under `src/` are retired. Use the
responsibility of new code to choose its location instead of restoring those technical-layer folders.

## Allowed dependencies

| Consumer | May use |
| --- | --- |
| Application composition | Feature public APIs, repository public API, shared primitives |
| A feature | Its own files, repository public API, shared primitives |
| Repository domain | Its own files, pure shared utilities, runtime-neutral libraries such as zod |
| Shared primitives | Other shared primitives and appropriate general-purpose libraries |

Features cannot import one another or import the application. Shared primitives cannot import
application, feature, or repository-domain code. Domain production code must not use React, browser
state, network I/O, or Node APIs. Browser production code must not import backend code or test helpers.

The public entrypoints are `src/features/<feature>/index.ts` and `src/domain/repository/index.ts`.
Keep their exports explicit and limited to actual consumers. Inside a module, import the defining
file directly; do not route internal dependencies back through its public index. Shared primitives
are imported directly rather than through one universal barrel. Tests may inspect internal APIs.

`pnpm check:boundaries` checks these import directions, public entrypoints, production/test separation,
and common runtime violations. It resolves relative imports and configured TypeScript aliases and
inspects re-exports and dynamic imports. It is a focused architectural guard, not a security sandbox
or a proof that every dependency is runtime-neutral; review newly introduced dependencies as well.

## State and integration contracts

| State | Owner | Lifetime |
| --- | --- | --- |
| Query, sort and page | Search URL-state hook | Browser URL/history |
| Search responses | Search query hook and TanStack Query | In-memory cache plus bounded, versioned session storage |
| Recent query/sort combinations | Search history hook and persistence | Local storage on this device; up to 10 entries |
| Repositories selected for comparison | Compare selection hook (`features/compare/useCompareSelection.ts`), held by `SearchPage` | Session storage for this tab; up to 3 repository snapshots |
| Theme preference (light, dark or system) | App theme hook (`app/theme.ts`) | Local storage on this device; unset means system |

`SearchPage` composes the search form and results. `Results` renders repository cards and owns
result pagination and status presentation. Query, sort, and page remain in the URL. Search responses
use the in-memory query cache and a feature-owned session cache that preserves the original
`fetchedAt` and repository dates across reloads. Five-minute freshness and fifteen-minute session
retention are independent; stale cached results may be displayed while a request revalidates them.
Cached data must be validated before use, and persistence failure must never block the search.
Recent searches store query/sort combinations in local storage and always reopen at page 1; draft
edits and pagination are not new history entries. The application composes the feature's history
controls and records executed URL query/sort changes.

`SearchPage` composes comparison into search results through generic `Results` props:
`renderCardActions` adds a compare toggle to each card, `footer` places the selection tray (with its
modal comparison dialog) inside the results section, where it stays sticky, `headingRef` lets the
tray return focus to the results heading, and `onResults` passes each settled response to the
selection. Search does not know about comparison, and comparison does not import search. The selection keeps repository snapshots with their response `fetchedAt`, keyed by
repository id, so it is independent of the current query, sort and page. A strictly newer response
replaces a selected snapshot; comparing never sends a request. It is not part of the URL. The frontend
has no note storage.

The repository domain contains the portable `Repository` and `SearchResult` types, validation, and
response parsing. `RepositorySearchRequest` describes transport parameters without importing UI
`SearchState`. Browser requests and their mutable rate-limit gate remain in the search feature.
Feature retry decisions live in `useRepoSearch`; global query defaults are generic.

All searches are anonymous. GitHub sign-in is deliberately out of scope because its token exchange
needs a server-held secret; the README records the reasoning and the intended design.

## Style ownership

`src/app/styles.css` preserves a deliberate cascade: tokens, base styles, application layout,
shared controls, then search and compare styles. The styling is plain CSS with custom properties; there is no
UI framework or CSS Modules.

Colours, radii, shadows, easings and durations are tokens; add a token before repeating a raw value.
Light tokens are the `:root` defaults and dark overrides apply under `:root[data-theme='dark']`;
do not use `prefers-color-scheme` in component styles. An inline script in `index.html` resolves
the saved or system theme onto `<html>` before first paint, and `app/theme.ts` keeps it current.
Shared keyframes (`rise`, `fade`, `pop`, `blink`, …) live in `styles/base.css`. Page transitions between
the landing page and results are started by `SearchPage` through `shared/lib/viewTransition.ts`;
an element opts into the morph with `view-transition-name` in its owner's stylesheet (for example
`.search-form`), and the transition timing lives in `app/app.css`. Every animation must remain
optional: the global `prefers-reduced-motion` rule in `base.css` reduces it to an instant change.

Use feature-prefixed classes such as `search-form` and `repo-card` for feature CSS.
Reusable button/topic/badge/chip rules belong in shared controls. Design tokens belong in `styles/tokens.css`.
Cross-feature layout belongs in `app/app.css`.
Avoid introducing selectors in one feature that restyle another feature's internals.

## Work allocation and integration

Assign work by capability, such as filters, history or comparison. A task should identify:

1. Its accepted inputs/public interfaces and intended user-visible behavior.
2. The directories/files it owns, with explicitly coordinated exceptions.
3. Its module tests and any combined user journey affected.
4. The integration changes and remaining manual or runtime checks.

Agree on contract changes before parallel implementation. Keep domain contracts small; do not make
unrelated features share an all-purpose model merely because both contain repository metadata. Coordinate shared contracts, app composition, dependencies/lockfiles,
and CI changes through an integration owner. Ownership guides coordination, not a ban on refactoring
across a boundary when the task requires it.

Prefer one branch/worktree or checkout per task. Git isolates files and Git state, not running
processes, ports, external services, or databases. Give each development server a distinct port:

```sh
pnpm dev --port 5174 --strictPort
```

Playwright probes a free loopback port by default, propagates that choice to workers, and starts its
own production preview with `strictPort` and `reuseExistingServer: false`. A fixed port can be selected:

```sh
E2E_PORT=4274 pnpm e2e
```

An occupied explicit port fails; it does not silently attach to another branch's server. There is a
short gap between the probe and preview startup; another process taking the port makes startup fail
rather than redirecting the test. Each checkout owns its `dist`, `test-results`, and
`playwright-report`. Concurrent build/E2E sessions in the same checkout are not supported.

Run `pnpm check`, then `pnpm e2e` for combined UI/style changes. The normal CI job already invokes
these commands, so it includes boundary and tooling checks. Live GitHub, real IME, background runtime,
and deployment evidence must be reported separately from deterministic local checks.
Documentation-only changes and removal of verified empty directories need local-link/path checks
and `git diff --check`, rather than another application test run.

## Decision references

- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/): organize
  related changes together while limiting cross-feature coupling.
- [Bulletproof React project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md):
  feature colocation and composition at the application level.
- [Feature-Sliced Design public APIs](https://fsd.how/docs/reference/public-api/): explicit contracts
  and the limits of barrel files without dependency enforcement.
- [Git worktree](https://git-scm.com/docs/git-worktree): separate working trees within one repository.

This project adopts the useful boundaries, not a full architecture framework or a per-feature service.
