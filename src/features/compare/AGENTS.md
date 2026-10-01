# Compare feature

- Own the comparison selection, card toggle, selection tray, comparison dialog, field formatting and styles.
- Do not import another feature. The application composes comparison into search results through the
  props `Results` exposes; expose only what that composition needs through `index.ts`.
- Use only repository data already returned by search: no extra requests, scores, or recommendations.
  Keep selection rules and field formatting in the plain TS modules (`selection.ts`, `compareFields.ts`)
  with unit tests; components only render and manage focus.
- The selection holds up to 3 snapshots keyed by repository id, replaced only by a strictly newer
  `fetchedAt`. It lives in `sessionStorage` (validated through the domain parser), not in the URL.
- Show absent values as “Unknown”, never as zero, “No”, or an empty cell. Use `pushedAt` for last push.
- Announcements use a plain `aria-live` region; search results own the single `role="status"`.
- Style only `compare-` classes. The selected-card border belongs to search's card styles.
- Run `pnpm test src/features/compare src/app/Compare.test.tsx` for local changes; use `pnpm check`
  and `e2e/compare.spec.ts` after integration.
