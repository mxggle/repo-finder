import { z } from 'zod'

// Portable validation for GitHub repository metadata.

export const repositoryId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/** A repository page on github.com itself: no other scheme, host, port or embedded credentials. */
export function isGitHubUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.protocol === 'https:' &&
    url.host === 'github.com' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname.length > 1
  )
}

export const gitHubUrl = z.string().refine(isGitHubUrl)

/** A finite, nonnegative whole number; anything else is unknown rather than zero. */
export const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)))

/** Parses a timestamp string into a Date, or null when it is absent or unreadable. */
export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
