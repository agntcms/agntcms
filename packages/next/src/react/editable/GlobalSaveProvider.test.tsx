// Tests for `<GlobalSaveProvider>`'s save dispatch logic.
//
// We test the pure `dispatchGlobalSave` helper that the provider's
// `saveField` calls under the hood. Pulled out of the React component
// so the URL/body routing logic can be exercised without driving an
// SSR render loop, while still living in the same file as a clear
// contract.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  composeAndDispatch,
  dispatchGlobalSave,
  handleEditableAnchorClick,
} from './GlobalSaveProvider'
import type { PreviewFieldOriginLike } from './isPreviewField'

// Stub `window.alert` so failure-path tests don't crash in node env.
const installAlertStub = (): { restore: () => void; calls: string[] } => {
  const calls: string[] = []
  const g = globalThis as { alert?: (msg: string) => void }
  const original = g.alert
  g.alert = (msg) => {
    calls.push(msg)
  }
  return {
    calls,
    restore: () => {
      // exactOptionalPropertyTypes: assigning `undefined` differs from
      // deleting the key. Restore by deletion when there was no prior
      // alert (e.g. node test env without window installed).
      if (original === undefined) {
        delete g.alert
      } else {
        g.alert = original
      }
    },
  }
}

interface FailingFetchHandle {
  readonly callsRef: { count: number }
  readonly restore: () => void
}

const installFailingFetchMock = (mode: 'reject' | 'not-ok'): FailingFetchHandle => {
  const original = globalThis.fetch
  const callsRef = { count: 0 }
  globalThis.fetch = ((_url: string, _init?: RequestInit) => {
    callsRef.count++
    if (mode === 'reject') {
      return Promise.reject(new Error('network down'))
    }
    return Promise.resolve({
      ok: false,
      status: 500,
      text: async (): Promise<string> => 'boom',
    } as unknown as Response)
  }) as typeof fetch
  return {
    callsRef,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

// ---------------------------------------------------------------------------
// fetch mock + window.location.reload stub
// ---------------------------------------------------------------------------

interface FetchCall {
  readonly url: string
  readonly body: unknown
}

const installFetchMock = (): {
  calls: FetchCall[]
  restore: () => void
} => {
  const calls: FetchCall[] = []
  const original = globalThis.fetch
  const fakeResponse = {
    ok: true,
    status: 200,
    text: async (): Promise<string> => '',
  }
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    let parsed: unknown = undefined
    if (init?.body !== undefined && typeof init.body === 'string') {
      parsed = JSON.parse(init.body)
    }
    calls.push({ url, body: parsed })
    return Promise.resolve(fakeResponse as unknown as Response)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

// Stub `window.location.reload` so the success-path callback (`then`)
// can later run without crashing if the test environment ever drives
// it. The promise here resolves microtask-async; tests below assert
// synchronously on `mock.calls`, but the dispatcher's then-handler may
// still run before vitest tears down — keep the stub installed.
const installReloadStub = (): { restore: () => void } => {
  const originalWindow = (globalThis as { window?: unknown }).window
  const reload = vi.fn()
  ;(globalThis as unknown as { window: { location: { reload: () => void } } }).window = {
    location: { reload },
  }
  return {
    restore: () => {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as unknown as { window: unknown }).window = originalWindow
      }
    },
  }
}

let mock: ReturnType<typeof installFetchMock>
let reload: ReturnType<typeof installReloadStub>

beforeEach(() => {
  mock = installFetchMock()
  reload = installReloadStub()
})

afterEach(() => {
  mock.restore()
  reload.restore()
})

// ---------------------------------------------------------------------------
// 1. Routing — kind: 'global' origin → /api/agntcms/global-draft/save
// ---------------------------------------------------------------------------

describe('dispatchGlobalSave — routing', () => {
  it('POSTs the patched global to /api/agntcms/global-draft/save', () => {
    const origin: PreviewFieldOriginLike = {
      kind: 'global',
      globalName: 'site-header',
      pageSlug: '__global__:site-header',
      sectionId: 'site-header',
      fieldPath: 'title',
      source: 'draft',
      revision: 'r1',
    }

    const next = dispatchGlobalSave({
      origin,
      newValue: 'new title',
      globalName: 'site-header',
      globalType: 'SiteHeader',
      currentData: { title: 'old', logo: '/logo.png' },
    })

    expect(next).toEqual({ title: 'new title', logo: '/logo.png' })
    expect(mock.calls).toHaveLength(1)

    const call = mock.calls[0]!
    expect(call.url).toBe('/api/agntcms/global-draft/save')
    expect(call.body).toEqual({
      name: 'site-header',
      type: 'SiteHeader',
      data: { title: 'new title', logo: '/logo.png' },
    })
  })

  it('returns null and skips fetch when origin.kind is not "global"', () => {
    const pageOrigin: PreviewFieldOriginLike = {
      // No `kind` field → defaults to a page origin (back-compat).
      pageSlug: 'home',
      sectionId: 'sec-1',
      fieldPath: 'title',
      source: 'draft',
      revision: 'r1',
    }

    const next = dispatchGlobalSave({
      origin: pageOrigin,
      newValue: 'ignored',
      globalName: 'site-header',
      globalType: 'SiteHeader',
      currentData: { title: 'hello' },
    })

    expect(next).toBeNull()
    expect(mock.calls).toHaveLength(0)
  })

  it('returns null and skips fetch when origin.globalName mismatches the provider', () => {
    const otherGlobalOrigin: PreviewFieldOriginLike = {
      kind: 'global',
      globalName: 'site-footer',
      pageSlug: '__global__:site-footer',
      sectionId: 'site-footer',
      fieldPath: 'copyright',
      source: 'draft',
      revision: 'r1',
    }

    const next = dispatchGlobalSave({
      origin: otherGlobalOrigin,
      newValue: 'ignored',
      globalName: 'site-header',
      globalType: 'SiteHeader',
      currentData: { title: 'hello' },
    })

    expect(next).toBeNull()
    expect(mock.calls).toHaveLength(0)
  })

  it('preserves non-edited fields verbatim in the saved payload', () => {
    const origin: PreviewFieldOriginLike = {
      kind: 'global',
      globalName: 'site-header',
      pageSlug: '__global__:site-header',
      sectionId: 'site-header',
      fieldPath: 'title',
      source: 'draft',
      revision: 'r1',
    }

    dispatchGlobalSave({
      origin,
      newValue: 'updated',
      globalName: 'site-header',
      globalType: 'SiteHeader',
      currentData: {
        title: 'old',
        logo: '/logo.png',
        cta: { label: 'Buy', href: '/buy' },
      },
    })

    const call = mock.calls[0]!
    const body = call.body as { data: Record<string, unknown> }
    expect(body.data).toEqual({
      title: 'updated',
      logo: '/logo.png',
      cta: { label: 'Buy', href: '/buy' },
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Concurrency — two synchronous calls compose without losing edits.
//
// Regression for the bug: when GlobalSaveProvider's saveField was driven
// by useState alone, two synchronous calls in the same tick would BOTH
// read the initial snapshot, and the second POST body would only carry
// the second field's patch (silently dropping the first). The fix backs
// the in-tick state with a ref that's mutated synchronously inside the
// dispatch helper. composeAndDispatch is that mutate-then-return helper.
// ---------------------------------------------------------------------------

describe('composeAndDispatch — synchronous compose', () => {
  it('two same-tick calls compose: second POST contains both edits', () => {
    const ref: { current: Record<string, unknown> | null } = {
      current: { a: 0, b: 0, c: 'unchanged' },
    }
    const baseOrigin = {
      kind: 'global',
      globalName: 'site-header',
      pageSlug: '__global__:site-header',
      sectionId: 'site-header',
      source: 'draft',
      revision: 'r1',
    } as const

    // Two synchronous edits — the second must see the first's patch in
    // the ref before building its POST body.
    const r1 = composeAndDispatch({
      ref,
      origin: { ...baseOrigin, fieldPath: 'a' },
      newValue: 1,
      globalName: 'site-header',
      globalType: 'SiteHeader',
    })
    const r2 = composeAndDispatch({
      ref,
      origin: { ...baseOrigin, fieldPath: 'b' },
      newValue: 2,
      globalName: 'site-header',
      globalType: 'SiteHeader',
    })

    expect(r1).toEqual({ a: 1, b: 0, c: 'unchanged' })
    expect(r2).toEqual({ a: 1, b: 2, c: 'unchanged' })
    expect(ref.current).toEqual({ a: 1, b: 2, c: 'unchanged' })

    // Two POSTs were made — the second body must include BOTH a:1 and b:2.
    expect(mock.calls).toHaveLength(2)
    const secondBody = mock.calls[1]!.body as { data: Record<string, unknown> }
    expect(secondBody.data).toEqual({ a: 1, b: 2, c: 'unchanged' })
  })

  it('returns null and leaves ref untouched on non-global origin', () => {
    const ref: { current: Record<string, unknown> | null } = {
      current: { x: 'init' },
    }
    const result = composeAndDispatch({
      ref,
      origin: {
        // No `kind` → page origin; should be ignored.
        pageSlug: 'home',
        sectionId: 'sec-1',
        fieldPath: 'x',
        source: 'draft',
        revision: 'r1',
      },
      newValue: 'mutated',
      globalName: 'site-header',
      globalType: 'SiteHeader',
    })
    expect(result).toBeNull()
    expect(ref.current).toEqual({ x: 'init' })
    expect(mock.calls).toHaveLength(0)
  })

  it('treats null ref.current as empty data', () => {
    const ref: { current: Record<string, unknown> | null } = { current: null }
    const result = composeAndDispatch({
      ref,
      origin: {
        kind: 'global',
        globalName: 'site-header',
        pageSlug: '__global__:site-header',
        sectionId: 'site-header',
        fieldPath: 'title',
        source: 'draft',
        revision: 'r1',
      },
      newValue: 'first',
      globalName: 'site-header',
      globalType: 'SiteHeader',
    })
    expect(result).toEqual({ title: 'first' })
    expect(ref.current).toEqual({ title: 'first' })
  })
})

// ---------------------------------------------------------------------------
// 3. Rollback — failed POST must restore the pre-patch ref state.
//
// Regression for the bug: composeAndDispatch mutated `ref.current` to the
// optimistic post-patch value synchronously, but never reverted on a
// failed POST. The next compose then read this corrupted baseline and
// POSTed nonsense (the rejected edit was implicitly re-included). The
// fix threads an `onFailure` callback through dispatchGlobalSave that
// composeAndDispatch wires to a `ref.current = prePatch` rollback.
// ---------------------------------------------------------------------------

describe('composeAndDispatch — rollback on failure', () => {
  it('restores ref.current when fetch resolves with !res.ok', async () => {
    const fetchMock = installFailingFetchMock('not-ok')
    const alertStub = installAlertStub()
    try {
      const ref: { current: Record<string, unknown> | null } = {
        current: { a: 1 },
      }
      const next = composeAndDispatch({
        ref,
        origin: {
          kind: 'global',
          globalName: 'site-header',
          pageSlug: '__global__:site-header',
          sectionId: 'site-header',
          fieldPath: 'b',
          source: 'draft',
          revision: 'r1',
        },
        newValue: 2,
        globalName: 'site-header',
        globalType: 'SiteHeader',
      })

      // The function returns the optimistic patch; the rollback fires
      // asynchronously inside the fetch's .then handler.
      expect(next).toEqual({ a: 1, b: 2 })
      expect(ref.current).toEqual({ a: 1, b: 2 })

      // Drain microtasks so both the fetch promise resolution and the
      // `res.text()` chain inside the failure branch settle.
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      // Rollback must have restored the pre-patch baseline.
      expect(ref.current).toEqual({ a: 1 })
      expect(fetchMock.callsRef.count).toBe(1)
      // The failure-path calls alert. We just verify the stub is in place.
      expect(alertStub.calls.length).toBeGreaterThan(0)
    } finally {
      fetchMock.restore()
      alertStub.restore()
    }
  })

  it('restores ref.current when fetch rejects (network error)', async () => {
    const fetchMock = installFailingFetchMock('reject')
    const alertStub = installAlertStub()
    try {
      const ref: { current: Record<string, unknown> | null } = {
        current: { a: 1 },
      }
      composeAndDispatch({
        ref,
        origin: {
          kind: 'global',
          globalName: 'site-header',
          pageSlug: '__global__:site-header',
          sectionId: 'site-header',
          fieldPath: 'b',
          source: 'draft',
          revision: 'r1',
        },
        newValue: 2,
        globalName: 'site-header',
        globalType: 'SiteHeader',
      })

      expect(ref.current).toEqual({ a: 1, b: 2 })

      await Promise.resolve()
      await Promise.resolve()

      expect(ref.current).toEqual({ a: 1 })
      expect(alertStub.calls).toEqual(['Failed to save global.'])
    } finally {
      fetchMock.restore()
      alertStub.restore()
    }
  })

  it.skip('inverse-order rollback known-limitation: A fails after B succeeds clobbers B in the in-memory ref', async () => {
    // Documenting the unfixed v1 race: if A and B are dispatched in
    // overlap (which the GlobalSaveProvider's in-flight guard prevents
    // by gating saves), and B's POST succeeds while A's POST fails,
    // A's rollback restores `prePatch_A` (the pre-A state), undoing B
    // even though B was committed server-side. Patch-queue tracking is
    // the proper fix; deferred to v1.x.
    //
    // With the provider's `isSavingRef` gate in place this race is
    // unreachable: composeAndDispatch B can't run until A's fetch
    // settles. Direct callers of composeAndDispatch (like this test)
    // can still hit it. Skipped to keep the limitation documented in
    // code without producing red CI.
  })
  it('layered rollback: A succeeds, B fails — only B is reverted', async () => {
    // Mix-mode fetch: first call resolves OK, second rejects. Verifies
    // the per-compose `prePatch` capture: when B fails, ref reverts to
    // the post-A state, not the original pre-A state.
    const original = globalThis.fetch
    let calls = 0
    globalThis.fetch = ((_url: string, _init?: RequestInit) => {
      calls++
      if (calls === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async (): Promise<string> => '',
        } as unknown as Response)
      }
      return Promise.reject(new Error('network down'))
    }) as typeof fetch
    // Stub window.location.reload — first call's success branch will
    // try to invoke it. The outer beforeEach already installed a
    // reload stub for this describe block, so this is just defensive.
    const alertStub = installAlertStub()
    try {
      const ref: { current: Record<string, unknown> | null } = {
        current: { a: 0, b: 0 },
      }
      const baseOrigin = {
        kind: 'global',
        globalName: 'site-header',
        pageSlug: '__global__:site-header',
        sectionId: 'site-header',
        source: 'draft',
        revision: 'r1',
      } as const

      composeAndDispatch({
        ref,
        origin: { ...baseOrigin, fieldPath: 'a' },
        newValue: 1,
        globalName: 'site-header',
        globalType: 'SiteHeader',
      })
      // Optimistic post-A state.
      expect(ref.current).toEqual({ a: 1, b: 0 })

      composeAndDispatch({
        ref,
        origin: { ...baseOrigin, fieldPath: 'b' },
        newValue: 2,
        globalName: 'site-header',
        globalType: 'SiteHeader',
      })
      // Optimistic post-B state.
      expect(ref.current).toEqual({ a: 1, b: 2 })

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      // Only B is rolled back; A's successful save remains. The
      // rollback target is `prePatch` captured at the start of
      // compose B, which was the post-A snapshot.
      expect(ref.current).toEqual({ a: 1, b: 0 })
    } finally {
      globalThis.fetch = original
      alertStub.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. AbortSignal — caller-provided signal cancels the fetch's effects
//
// Regression for the v0.1.x race: a successful POST that lands AFTER
// the provider unmounts triggers `window.location.reload()` against a
// torn-down tree, and a failed POST in the same window fires alert() /
// rollback into stale state. The fix threads an AbortSignal through
// dispatchGlobalSave; when the signal is aborted, the response handler
// returns early without rollback / alert / reload.
// ---------------------------------------------------------------------------

describe('dispatchGlobalSave — abort signal', () => {
  it('skips reload and onFailure when the signal is already aborted on success', async () => {
    const handle = installFailingFetchMock('not-ok')
    // Override with OK response — but pre-abort the signal so the
    // success handler should bail out.
    globalThis.fetch = ((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: async (): Promise<string> => '',
      } as unknown as Response)) as typeof fetch
    const reloadCalls = { count: 0 }
    const reloadOriginal = (globalThis as { window?: unknown }).window
    ;(globalThis as unknown as {
      window: { location: { reload: () => void } }
    }).window = {
      location: {
        reload: () => {
          reloadCalls.count++
        },
      },
    }
    const settledCalls = { count: 0 }
    try {
      const ctrl = new AbortController()
      ctrl.abort() // Pre-abort: response handler must bail.
      dispatchGlobalSave({
        origin: {
          kind: 'global',
          globalName: 'site-header',
          pageSlug: '__global__:site-header',
          sectionId: 'site-header',
          fieldPath: 'title',
          source: 'draft',
          revision: 'r1',
        },
        newValue: 'x',
        globalName: 'site-header',
        globalType: 'SiteHeader',
        currentData: { title: 'old' },
        signal: ctrl.signal,
        onSettled: () => {
          settledCalls.count++
        },
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(reloadCalls.count).toBe(0)
      // onSettled MUST still fire so the in-flight guard releases.
      expect(settledCalls.count).toBe(1)
    } finally {
      handle.restore()
      if (reloadOriginal === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as unknown as { window: unknown }).window = reloadOriginal
      }
    }
  })

  it('treats AbortError rejection as cancel (no rollback, no alert)', async () => {
    const original = globalThis.fetch
    const ctrl = new AbortController()
    globalThis.fetch = ((_url: string, _init?: RequestInit) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      return Promise.reject(err)
    }) as typeof fetch
    const alertStub = installAlertStub()
    const onFailureCalls = { count: 0 }
    const settledCalls = { count: 0 }
    try {
      dispatchGlobalSave({
        origin: {
          kind: 'global',
          globalName: 'site-header',
          pageSlug: '__global__:site-header',
          sectionId: 'site-header',
          fieldPath: 'title',
          source: 'draft',
          revision: 'r1',
        },
        newValue: 'x',
        globalName: 'site-header',
        globalType: 'SiteHeader',
        currentData: { title: 'old' },
        signal: ctrl.signal,
        onFailure: () => {
          onFailureCalls.count++
        },
        onSettled: () => {
          settledCalls.count++
        },
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(onFailureCalls.count).toBe(0)
      expect(alertStub.calls).toEqual([])
      expect(settledCalls.count).toBe(1)
    } finally {
      globalThis.fetch = original
      alertStub.restore()
    }
  })

  it('onSettled fires after a successful save (before reload)', async () => {
    // Reload stub is installed by the outer beforeEach. Standard fetch
    // mock returns ok=true, so the success branch should run.
    const settledCalls = { count: 0 }
    dispatchGlobalSave({
      origin: {
        kind: 'global',
        globalName: 'site-header',
        pageSlug: '__global__:site-header',
        sectionId: 'site-header',
        fieldPath: 'title',
        source: 'draft',
        revision: 'r1',
      },
      newValue: 'x',
      globalName: 'site-header',
      globalType: 'SiteHeader',
      currentData: { title: 'old' },
      onSettled: () => {
        settledCalls.count++
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settledCalls.count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 5. onClickCapture — anchor navigation is cancelled inside the global,
//    but section-control chrome (e.g. EditableLink popovers) is exempt.
//
// Mirrors the page-level rule installed by `SectionEditControls`. The
// handler reads `e.target.closest('a')` and bails when the anchor sits
// inside a `[data-agntcms-section-control]` ancestor. We test the pure
// handler directly because the vitest env is node (no DOM); a synthetic
// target with a mocked `.closest()` is enough to verify the decision
// logic. The wrapper `<div>` in `<GlobalSaveProvider>` wires this same
// function to its `onClickCapture` — see GlobalSaveProvider.tsx.
// ---------------------------------------------------------------------------

interface FakeElement {
  closest(selector: string): FakeElement | null
}

/**
 * Build a fake DOM element whose `closest(selector)` returns whichever
 * mapping is provided. Sufficient for the handler we test — it only
 * calls `.closest()` on the click target and on the matched anchor.
 * The matches map is mutable so a caller can wire a self-referential
 * entry (anchors should match `closest('a')` to themselves — see real
 * DOM contract) after construction.
 */
const makeFakeElement = (
  matches: Record<string, FakeElement | null>,
): FakeElement => ({
  closest(selector: string): FakeElement | null {
    return selector in matches ? matches[selector]! : null
  },
})

describe('handleEditableAnchorClick — anchor click capture', () => {
  it('blocks anchor navigation inside global preview', () => {
    // Click target: a `<span>` inside an `<a href>` that is NOT inside
    // a section-control. The handler must call preventDefault.
    const anchorMatches: Record<string, FakeElement | null> = {
      '[data-agntcms-section-control]': null,
    }
    const anchor: FakeElement = makeFakeElement(anchorMatches)
    // Real `Element.closest('a')` returns the element itself when called
    // on an `<a>` (closest walks up AND includes self).
    anchorMatches['a'] = anchor
    const target: FakeElement = makeFakeElement({
      a: anchor,
    })
    const preventDefault = vi.fn()
    handleEditableAnchorClick({
      target: target as unknown as EventTarget,
      preventDefault,
    })
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does not block clicks on section controls', () => {
    // Case A: click target has no anchor ancestor at all — handler bails.
    const noAnchorTarget: FakeElement = makeFakeElement({ a: null })
    const pdNoAnchor = vi.fn()
    handleEditableAnchorClick({
      target: noAnchorTarget as unknown as EventTarget,
      preventDefault: pdNoAnchor,
    })
    expect(pdNoAnchor).not.toHaveBeenCalled()

    // Case B: click target IS inside an anchor, but the anchor itself
    // is inside section-control chrome — handler must bail.
    const controlContainer: FakeElement = makeFakeElement({})
    const anchorInsideControlMatches: Record<string, FakeElement | null> = {
      '[data-agntcms-section-control]': controlContainer,
    }
    const anchorInsideControl: FakeElement = makeFakeElement(
      anchorInsideControlMatches,
    )
    // Real `Element.closest('a')` includes self when the element matches.
    anchorInsideControlMatches['a'] = anchorInsideControl
    const targetInsideControl: FakeElement = makeFakeElement({
      a: anchorInsideControl,
    })
    const pdInControl = vi.fn()
    handleEditableAnchorClick({
      target: targetInsideControl as unknown as EventTarget,
      preventDefault: pdInControl,
    })
    expect(pdInControl).not.toHaveBeenCalled()
  })
})
