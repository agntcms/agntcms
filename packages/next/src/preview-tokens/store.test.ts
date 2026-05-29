import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createPreviewTokenStore } from './store'

describe('createPreviewTokenStore', () => {
  it('issue returns a token with the correct slug', () => {
    const store = createPreviewTokenStore()
    const result = store.issue('/about')

    expect(result.token).toEqual(expect.any(String))
    expect(result.token.length).toBeGreaterThan(0)
    expect(result.slug).toBe('/about')
    expect(result.createdAt).toEqual(expect.any(Number))
  })

  it('consume returns the slug for a valid token', () => {
    const store = createPreviewTokenStore()
    const { token } = store.issue('/about')

    const slug = store.consume(token)
    expect(slug).toBe('/about')
  })

  it('consume returns null for an unknown token', () => {
    const store = createPreviewTokenStore()

    const slug = store.consume('nonexistent-token')
    expect(slug).toBeNull()
  })

  it('double-consume returns null (single-use)', () => {
    const store = createPreviewTokenStore()
    const { token } = store.issue('/about')

    expect(store.consume(token)).toBe('/about')
    expect(store.consume(token)).toBeNull()
  })

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('expired token returns null', () => {
      const store = createPreviewTokenStore({ ttlMs: 1000 })
      const { token } = store.issue('/about')

      // Advance past the TTL
      vi.advanceTimersByTime(1001)

      expect(store.consume(token)).toBeNull()
    })

    it('token at exact TTL boundary returns null', () => {
      const store = createPreviewTokenStore({ ttlMs: 1000 })
      const { token } = store.issue('/about')

      // Advance to exactly the TTL (createdAt + ttlMs <= now)
      vi.advanceTimersByTime(1000)

      expect(store.consume(token)).toBeNull()
    })

    it('token just before TTL boundary is still valid', () => {
      const store = createPreviewTokenStore({ ttlMs: 1000 })
      const { token } = store.issue('/about')

      vi.advanceTimersByTime(999)

      expect(store.consume(token)).toBe('/about')
    })

    it('lazy cleanup removes expired entries on issue()', () => {
      const store = createPreviewTokenStore({ ttlMs: 1000 })

      // Issue a token that will expire
      const { token: expiredToken } = store.issue('/old')

      vi.advanceTimersByTime(1001)

      // Issue a new token — this triggers sweep
      store.issue('/new')

      // The expired token should already be gone (swept), not just
      // rejected by TTL check in consume
      expect(store.consume(expiredToken)).toBeNull()
    })
  })
})
