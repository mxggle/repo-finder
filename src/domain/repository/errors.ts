export type ApiErrorKind =
  | 'rate-limited'
  | 'invalid-query'
  | 'unavailable'
  | 'network'
  | 'unexpected-response'

export class GitHubApiError extends Error {
  readonly kind: ApiErrorKind
  /** Earliest time a retry is allowed. Only set for `rate-limited`. */
  readonly retryAt: Date | null

  constructor(kind: ApiErrorKind, message: string, retryAt: Date | null = null) {
    super(message)
    this.name = 'GitHubApiError'
    this.kind = kind
    this.retryAt = retryAt
  }
}
