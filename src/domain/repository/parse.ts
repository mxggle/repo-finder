import { z } from 'zod'
import { count, gitHubUrl, repositoryId, toDate } from './schemas'
import { GitHubApiError } from './errors'
import type { Repository, SearchResult } from './model'

const httpsUrl = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).protocol === 'https:')

const repositorySchema = z.object({
  id: repositoryId,
  full_name: z.string().min(1),
  owner: z
    .object({
      login: z.string(),
      avatar_url: httpsUrl.nullish().catch(null),
    })
    .nullish(),
  // Only link to GitHub itself, never to an arbitrary scheme or host.
  html_url: gitHubUrl,
  description: z.string().nullish().catch(null),
  language: z.string().nullish().catch(null),
  stargazers_count: count.nullish().catch(null),
  forks_count: count.nullish().catch(null),
  topics: z.array(z.string()).catch([]),
  license: z.object({ spdx_id: z.string().nullish(), name: z.string().nullish() }).nullish().catch(null),
  updated_at: z.string().nullish().catch(null),
  pushed_at: z.string().nullish().catch(null),
  archived: z.boolean().nullish().catch(null),
  fork: z.boolean().nullish().catch(null),
})

const envelopeSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(z.unknown()),
})

function toRepository(raw: z.infer<typeof repositorySchema>): Repository {
  const spdx = raw.license?.spdx_id
  return {
    id: raw.id,
    fullName: raw.full_name,
    owner: {
      login: raw.owner?.login ?? raw.full_name.split('/')[0],
      avatarUrl: raw.owner?.avatar_url ?? null,
    },
    url: raw.html_url,
    description: raw.description?.trim() || null,
    language: raw.language ?? null,
    stars: raw.stargazers_count ?? null,
    forks: raw.forks_count ?? null,
    topics: raw.topics,
    // GitHub uses NOASSERTION for licenses it could not identify.
    license: spdx && spdx !== 'NOASSERTION' ? spdx : (raw.license?.name ?? null),
    updatedAt: toDate(raw.updated_at),
    pushedAt: toDate(raw.pushed_at),
    archived: raw.archived ?? null,
    fork: raw.fork ?? null,
  }
}

export function parseSearchResponse(body: unknown, page = 1, fetchedAt = new Date()): SearchResult {
  const envelope = envelopeSchema.safeParse(body)
  if (!envelope.success) {
    throw new GitHubApiError('unexpected-response', 'GitHub returned a response we could not read.')
  }
  const items: Repository[] = []
  let skippedCount = 0
  for (const item of envelope.data.items) {
    const parsed = repositorySchema.safeParse(item)
    if (parsed.success) items.push(toRepository(parsed.data))
    else skippedCount += 1
  }
  return {
    page,
    totalCount: envelope.data.total_count,
    incompleteResults: envelope.data.incomplete_results,
    items,
    fetchedAt,
    skippedCount,
  }
}

