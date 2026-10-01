# Search feature

- Own the search form, results, pagination, URL state, GitHub browser client, query policy and styles.
- Group files by responsibility: `form/` (input, suggestions, filters), `results/` (list, cards,
  pagination, status), `history/` (recent searches). Shared state, transport and query policy stay at
  the root. Each subfolder keeps its own styles and tests; do not add technical-type folders.
- Do not import another feature.
- Expose composition through `index.ts`. Keep repository cards and result presentation within search.
  Preserve cached `fetchedAt`; placeholder results are not a new response.
- Keep query/sort/page history and IME behavior intact.
- Filters (`form/queryFilters.ts`, `form/SearchFilters.tsx`) support only `language:` (one value; quoted or
  `c++`/`c#`), `stars:` (`>N`, `>=N`, `<N`, `<=N`, `N`, `N..M`, `*` bounds; only `>`/`>=` editable) and
  `archived:true|false`. Parse the draft with the quote-aware tokeniser; do not build a full grammar.
- Filter edits must change only their own token. Keep everything else verbatim: free text, other
  qualifiers, negations (`-x:`, `NOT x:`), order, quoting, and spacing. Duplicate qualifiers, or
  qualifiers next to `AND`/`OR` or inside brackets, are locked, so they are read-only and their text
  is unchanged. Unreadable values can only be removed. A no-op edit must return the identical string.
- Filter edits update the draft only and never search, except Enter in the stars field. Do not
  rewrite the text during an IME composition.
- Narrowing links (`results/narrowing.ts`) appear only beyond the 1,000-result cap. They add one supported
  filter through the `queryFilters` setters, never touch a filter that is set or locked, and derive
  languages from results already returned: no extra requests. Clicking one searches immediately.
- Repository response parsing belongs to `src/domain/repository/`. The browser rate-limit gate
  belongs here and must not become shared state for a future runner.
- `Results` accepts generic card actions, a footer, a heading ref and a settled-results callback;
  the application uses them to compose comparison. Keep them free of comparison concepts.
- Keep a single `role="status"` in results; other features' announcements use plain `aria-live` regions.
- Run `pnpm test src/features/search` for local changes; use `pnpm check` and relevant E2E after integration.
