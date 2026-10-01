# Working in Repo Finder

Preserve existing uncommitted work. Do not commit, push, deploy, or publish unless the user asks.
Use English for code, interface copy, and repository documentation.

## Current scope and starting points

This is one static Vite frontend that calls the GitHub Search API from the browser. There is no
backend; GitHub sign-in is deliberately out of scope (see the README).

Read this file first, then any `AGENTS.md` in the directory being changed. Nested instructions apply
to that subtree. The README explains setup and current capabilities; architecture.md explains
boundaries.

| Task | Primary files / owner |
| --- | --- |
| Search UI, state, requests, or search styling | `src/features/search/`; read its `AGENTS.md` |
| Repository comparison selection, tray, or dialog | `src/features/compare/`; read its `AGENTS.md` |
| Repository types, validation, or parsing | `src/domain/repository/`; read its `AGENTS.md` |
| Page composition, providers, or global layout | `src/app/`; integration owner |
| Generic icons, controls, or helpers | `src/shared/`; coordinate with consumers |
| Tokens or base styles | `src/styles/`; integration owner |
| Shared test setup or fixtures | `src/test/`; coordinate with test consumers |
| Browser journeys | `e2e/`; coordinate with affected feature owners |
| Boundary tooling, build/test config, dependencies, or CI | `scripts/`, root config, `.github/`; integration owner |

Do not recreate the retired top-level `src/components/`, `src/hooks/`, `src/api/`, or `src/lib/`
directories. Place feature-specific code with its feature; extract into shared only when it has
a concrete general-purpose responsibility. See the migration map in `docs/architecture.md`.

## Empty directories

- Create source files for working responsibilities, not to fill out a proposed directory tree.
  Do not add empty exports, fake feature switches, or `.gitkeep` scaffolding.
- Remove obsolete empty directories after moving their contents; Git does not track empty directories.
- Small entrypoints such as `app/App.tsx`, `app/styles.css`, and public `index.ts` files are intentional.
  Preserve their composition/export responsibilities rather than adding unrelated logic to them.
- When adding a new module, update the root README and architecture guide in the same change. Add
  module-specific `AGENTS.md` when it has distinct implementation rules.

## Structure and dependencies

- Read [docs/architecture.md](docs/architecture.md) before changing module boundaries.
- Keep feature UI, hooks, rules, styles, and unit tests together in `src/features/<feature>/`.
- Compose features in `src/app/`. Features must not import another feature or the app.
- Import a feature's explicit public `index.ts` from production application code. Within a feature,
  import its files directly, never its own index. Export only what a consumer actually needs.
- Keep repository models, validation, and parsing in `src/domain/repository/`; use its public index
  outside that directory. It must remain independent of React, browser state, network I/O, and Node.
- Shared utilities and UI must not depend on features, the app, or repository domain rules.
- Feature retry policies belong to the feature; application query defaults must stay generic.
- Keep fixture builders specific to a feature with that feature. Production must never import tests
  or `testing.ts`. Cross-feature user journeys belong in `src/app/` tests or `e2e/`.
- Feature styles use namespaced classes. Design tokens and resets belong in `src/styles/`;
  cross-feature layout belongs in `src/app/app.css`. Maintain import order in `src/app/styles.css`.

## Parallel work

- Before implementation, record each task's owned paths, public-interface changes, tests, and
  integration owner in the task handoff. A feature assignment does not grant exclusive ownership
  of shared contracts or configuration. Coordinate those changes before editing.
- Use one branch/worktree or checkout per independent task. For edits within a shared checkout,
  agree on disjoint file ownership and designate one integration owner before changing files.
- Agree on public API changes first. Coordinate changes to app composition, domain contracts,
  dependencies, lockfiles, test configuration, and CI rather than editing them independently.
- Assign each dev server a distinct port: `pnpm dev --port 5174 --strictPort`.
- Playwright selects a free loopback port by default and never reuses an existing server. Set
  `E2E_PORT` to an unused port when a fixed port is needed. Do not run simultaneous builds/E2E
  sessions in the same checkout: they share `dist` and output files.

## Validation

- For documentation-only edits and removal of verified empty directories, check local links, path
  accuracy, implementation-status claims, and `git diff --check`; a full app test run is unnecessary.
- For code or tooling changes, run `pnpm check` (dependency boundaries, lint, tooling tests,
  unit/integration tests, and build).
- Run `pnpm e2e` after user-flow, application composition, or style changes. It uses mocked GitHub
  responses on desktop Chromium and mobile WebKit.
- `pnpm e2e:live` is an optional real-GitHub smoke check with shared network/quota constraints.
  Report its result separately. Real IME behavior still requires a manual check.
- Check both the changed module and the combined application after integration. Do not describe
  a typecheck or mocked test as proof of a live API, a background schedule, or deployment.

Do not add backend dependencies, account setup, or secrets to the basic frontend to reserve future structure.
