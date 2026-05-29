import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { enterPreview, exitPreview } from './previewMode'

// ---------------------------------------------------------------------------
// previewMode helpers — narrow side-effect shims around fetch + reload.
//
// We can exercise these directly in the node vitest env by stubbing
// `globalThis.fetch` and `window.location.reload`. They are intentionally
// shaped so that the entire body is `fetch().then(reload).catch(reload)` —
// the tests below pin that contract.
// ---------------------------------------------------------------------------

type FetchMock = ReturnType<typeof vi.fn>
type ReloadMock = ReturnType<typeof vi.fn>

let originalFetch: typeof globalThis.fetch | undefined
let originalWindow: typeof globalThis.window | undefined

function stubEnv(): { fetchMock: FetchMock; reloadMock: ReloadMock } {
  const reloadMock = vi.fn()
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response))

  originalFetch = globalThis.fetch
  // The helper checks `typeof window !== 'undefined'` before calling
  // `window.location.reload()`. Provide a minimal window object so the
  // path under test runs end-to-end.
  originalWindow = (globalThis as { window?: typeof globalThis.window }).window
  ;(globalThis as { window?: unknown }).window = {
    location: { reload: reloadMock },
  }
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  return { fetchMock, reloadMock }
}

function restoreEnv(): void {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
  }
  ;(globalThis as { window?: unknown }).window = originalWindow
}

describe('previewMode helpers', () => {
  beforeEach(() => {
    // Each test stubs its own env to avoid cross-test contamination of
    // the shared global mocks.
  })

  afterEach(() => {
    restoreEnv()
    vi.restoreAllMocks()
  })

  it('enterPreview POSTs to /api/agntcms/preview/enter and reloads on success', async () => {
    const { fetchMock, reloadMock } = stubEnv()

    enterPreview()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/agntcms/preview/enter', {
      method: 'POST',
    })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('exitPreview POSTs to /api/agntcms/preview/exit and reloads on success', async () => {
    const { fetchMock, reloadMock } = stubEnv()

    exitPreview()
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchMock).toHaveBeenCalledWith('/api/agntcms/preview/exit', {
      method: 'POST',
    })
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('enterPreview reloads even when the fetch rejects (best-effort contract)', async () => {
    // The "always reload" path is the contract that keeps the user
    // unstuck if the network blip-out occurs mid-toggle. Pin it.
    const reloadMock = vi.fn()
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    originalFetch = globalThis.fetch
    originalWindow = (globalThis as { window?: typeof globalThis.window }).window
    ;(globalThis as { window?: unknown }).window = {
      location: { reload: reloadMock },
    }
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    enterPreview()
    await Promise.resolve()
    await Promise.resolve()

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('exitPreview reloads even when the fetch rejects (best-effort contract)', async () => {
    const reloadMock = vi.fn()
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    originalFetch = globalThis.fetch
    originalWindow = (globalThis as { window?: typeof globalThis.window }).window
    ;(globalThis as { window?: unknown }).window = {
      location: { reload: reloadMock },
    }
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    exitPreview()
    await Promise.resolve()
    await Promise.resolve()

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })
})
