// Types for the preview-token store.
//
// Preview tokens are single-use, short-lived tokens that gate access to the
// preview route. The handler issues a token (via the MCP bridge or a trusted
// internal call), and the preview page consumes it exactly once within the
// TTL window. This prevents replay and limits exposure of draft content to
// a single browser tab.

export interface PreviewToken {
  readonly token: string
  readonly slug: string
  readonly createdAt: number
}

export interface PreviewTokenStoreOptions {
  /** Time-to-live in milliseconds. Defaults to 600_000 (10 minutes). */
  readonly ttlMs?: number
}

export interface PreviewTokenStore {
  /** Issue a new single-use preview token for the given slug. */
  readonly issue: (slug: string) => PreviewToken

  /**
   * Consume a token. Returns the associated slug if the token exists and
   * has not expired; returns `null` otherwise. A consumed token is deleted
   * and cannot be reused.
   */
  readonly consume: (token: string) => string | null
}
