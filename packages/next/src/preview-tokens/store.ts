// In-memory, single-use preview-token store.
//
// Tokens gate access to the preview route handler: each token is valid for
// exactly one consumption within its TTL window. This prevents replay
// attacks and limits draft-content exposure to a single request.
//
// Expired entries are swept lazily on every `issue()` call rather than via
// a timer. This avoids dangling timers that would keep a test process alive
// and is perfectly adequate at the expected token volume (single-digit per
// minute at most).

import { randomUUID } from 'node:crypto'

import type {
  PreviewToken,
  PreviewTokenStore,
  PreviewTokenStoreOptions,
} from './types'

const DEFAULT_TTL_MS = 600_000 // 10 minutes

interface Entry {
  readonly slug: string
  readonly createdAt: number
}

export const createPreviewTokenStore = (
  options?: PreviewTokenStoreOptions,
): PreviewTokenStore => {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const entries = new Map<string, Entry>()

  // Remove entries whose createdAt + ttlMs is in the past.
  const sweep = (now: number): void => {
    for (const [token, entry] of entries) {
      if (entry.createdAt + ttlMs <= now) {
        entries.delete(token)
      }
    }
  }

  const issue: PreviewTokenStore['issue'] = (slug) => {
    const now = Date.now()
    sweep(now)

    const token = randomUUID()
    const entry: Entry = { slug, createdAt: now }
    entries.set(token, entry)

    return { token, slug, createdAt: now }
  }

  const consume: PreviewTokenStore['consume'] = (token) => {
    const entry = entries.get(token)
    if (entry === undefined) {
      return null
    }

    // Always delete first — the token is single-use regardless of expiry.
    entries.delete(token)

    const now = Date.now()
    if (entry.createdAt + ttlMs <= now) {
      return null
    }

    return entry.slug
  }

  return { issue, consume }
}
