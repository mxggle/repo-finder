# Repository domain

- Keep models, validation, parsing and request parameters portable between browser and future runner.
- Do not import React, query hooks, feature state, browser storage, fetch, or Node APIs.
- Export the supported domain contract through `index.ts`; internal files import one another directly.
- Preserve unknown counts/flags separately from zero/false, safe IDs/URLs, and distinct repository and
  fetch timestamps. Do not manufacture a new observation time when reading cached data.
- Coordinate public contract changes with domain consumers before parallel implementation.
- Run `pnpm test src/domain/repository`, `pnpm check:boundaries`, then the full application checks.
