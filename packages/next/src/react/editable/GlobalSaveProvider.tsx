'use client'

// `<GlobalSaveProvider>` — client-side save dispatcher for `<GlobalSlot>`.
//
// Purpose:
//   When `<GlobalSlot>` renders in preview mode, every field passed to
//   the section component is a `PreviewField` whose origin has
//   `kind: 'global'`. Descendant `<EditableText>` / `<EditableImage>` /
//   etc. discover the save callback via the existing `SaveContext`
//   (from `react/editable/SaveContext.tsx`). This provider supplies a
//   `saveField` that POSTs the patched global to
//   `/api/agntcms/global-draft/save` — saves write to the DRAFT bucket
//   only. Publishing the draft (via the AdminModal Publish action)
//   promotes it to the live global.
//
// Why a separate provider (not `<SectionEditControls>`'s saveField):
//   `<GlobalSlot>` typically lives in `app/layout.tsx`, OUTSIDE any
//   page tree. There is no page draft to write to — the save target is
//   the global itself. So we ship a small, dedicated provider whose
//   saveField is bound to a single global by name + type.
//
// Why this file lives in `react/editable/` (and NOT in `react-server/`):
//   `'use client'` directives are file-level boundaries that Next.js
//   relies on to split server and client graphs. When tsup bundles the
//   `react-server/` entry into `dist/server.mjs` it strips embedded
//   `'use client'` directives because they are no longer at the bundle
//   entry. Bundling a `'use client'` component into the server entry
//   collapses the boundary and breaks the consumer build (createContext
//   / useState end up in a server module).
//   So this provider lives with its peer client editing components,
//   gets re-exported from `@agntcms/next/client` (whose dist entry has
//   `'use client'` at the top of the bundle), and `<GlobalSlot>` (a real
//   server component) imports it across the public package boundary —
//   the canonical Next.js pattern for a server component that renders a
//   client provider.

import { useCallback, useEffect, useRef, useState } from 'react'

import { SaveProvider } from './SaveContext'
import type { PreviewFieldOriginLike } from './isPreviewField'

export interface GlobalSaveProviderProps {
  readonly globalName: string
  readonly globalType: string
  /**
   * The global's data as returned by `getGlobal` in preview mode —
   * each value is a `PreviewField<T>`. We strip the wrappers when
   * constructing the save payload so the on-disk global stores plain
   * values. Keeping `initialData` as a snapshot lets the provider patch
   * a single field without re-fetching the whole global.
   */
  readonly initialData: Readonly<Record<string, unknown>>
  readonly children: React.ReactNode
}

/**
 * Provides a `saveField` callback that routes a single field-level
 * edit to `/api/agntcms/global-draft/save` — saves write to the DRAFT
 * bucket only (mirrors the page editor's draft-first flow). Publishing
 * the draft to the live global is the user's separate action via the
 * AdminModal "Publish" control. After a successful draft save we
 * trigger a full page reload so layout-level globals (header, footer)
 * pick up server-recomputed state. We don't use Next.js's
 * `useRouter().refresh()` because `<GlobalSlot>` typically renders at
 * `app/layout.tsx` level where router context is unreliable; the reload
 * is the conservative pattern `SectionEditControls` already uses for
 * its global-ref save path.
 *
 * Concurrency note: two synchronous `saveField` calls in the same
 * render cycle (e.g. a UI that batches two edits) MUST compose. The
 * first call's update has to be visible to the second call. `useState`
 * alone breaks this — `setLatestData` schedules an update for the next
 * render, so the second call inside the same tick still reads the old
 * snapshot. We back the state with a `useRef` that we mutate
 * synchronously inside the callback; the `useState` mirror exists only
 * so the React tree re-renders if the provider's children depend on
 * data identity.
 */
export function GlobalSaveProvider(
  props: GlobalSaveProviderProps,
): React.ReactElement {
  const { globalName, globalType, initialData, children } = props

  // Synchronous source of truth for the latest in-memory data. Updated
  // INSIDE `saveField` before the fetch is kicked off so a second
  // synchronous call within the same render cycle composes on top of
  // the first call's patch. See the concurrency note above.
  const latestDataRef = useRef<Record<string, unknown> | null>(null)
  if (latestDataRef.current === null) {
    latestDataRef.current = stripPreviewWrappers(initialData)
  }

  // React-visible mirror so consumers that depend on the snapshot (none
  // today, but future-proof for memoised children) re-render when data
  // changes. The ref above is the authoritative read source inside
  // `saveField`; this state exists purely for re-render scheduling.
  const [, setLatestData] = useState<Readonly<Record<string, unknown>>>(
    () => latestDataRef.current as Record<string, unknown>,
  )

  // In-flight guard: a successful save calls `window.location.reload()`,
  // and a second concurrent fetch that lands AFTER reload starts is at
  // best wasted work and at worst a silent edit drop (the second response
  // can be torn down before its handler runs, or — worse — committed
  // server-side just as the page reloads to pre-request state).
  // Gate-and-drop is the simplest correct shape for v1: every save kicks
  // off a reload anyway, so a concurrent second save would race the
  // reload either way; refusing it explicitly makes the behaviour
  // observable and avoids wasted POSTs.
  const isSavingRef = useRef(false)
  // Per-save AbortController so unmount cancels the pending fetch. We
  // also abort on a new save attempt as defence in depth — when the
  // in-flight guard is in place, this branch is theoretically
  // unreachable, but keeping `controller.abort()` before the new fetch
  // matches React's standard "previous-effect cleanup" pattern.
  const controllerRef = useRef<AbortController | null>(null)

  // Cancel any in-flight save on unmount so its `.then` / `.catch` cannot
  // setState on a torn-down provider. The fetch itself is fired from
  // `dispatchGlobalSave` (a non-React helper), so the abort signal is
  // the only handle we have to stop it cleanly.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const saveField = useCallback<
    (origin: PreviewFieldOriginLike, newValue: unknown) => void
  >(
    (origin, newValue) => {
      // Drop concurrent saves. The first save will reload the page on
      // success; the user's second edit can be re-applied after reload.
      if (isSavingRef.current) return
      // Abort any (theoretically) lingering controller before we start.
      controllerRef.current?.abort()
      const ctrl = new AbortController()
      controllerRef.current = ctrl
      isSavingRef.current = true
      const next = composeAndDispatch({
        ref: latestDataRef,
        origin,
        newValue,
        globalName,
        globalType,
        signal: ctrl.signal,
        onSettled: () => {
          // Clear the gate after the fetch settles (success OR failure).
          // Success path also calls `window.location.reload()` separately
          // — this hook only flips the boolean.
          isSavingRef.current = false
        },
      })
      if (next === null) {
        // Routing decision rejected the call (non-global origin or
        // mismatched name) — no fetch was made; release the gate
        // immediately so the next legitimate save isn't blocked.
        isSavingRef.current = false
        return
      }
      setLatestData(next)
    },
    // No data dep — the ref is stable; the callback itself never goes
    // stale. Keeping the dep array minimal prevents accidental
    // re-renders that would tear down `<SaveProvider>`'s context.
    [globalName, globalType],
  )

  return (
    <SaveProvider saveField={saveField}>
      {/* Mirror the page-level rule in `SectionEditControls`: in preview
          mode any anchor inside an editable subtree must NOT navigate —
          its click belongs to the inner editable widget (e.g. an
          `<EditableLink>` modal). Without this capture handler, a
          section-rendered `<a href>` inside a global steals the click
          and the browser navigates instead. Section-control chrome is
          exempt (see `handleEditableAnchorClick`). */}
      {/* `display: contents` keeps preview/prod DOM parity for
          layout-level globals: `<GlobalSlot>` typically mounts directly
          under `<body>` (header/footer), and a real `<div>` box would
          break parent flex/grid and `body > header` style selectors in
          preview only. The element stays in the React tree so
          `onClickCapture` still fires. */}
      <div style={{ display: 'contents' }} onClickCapture={handleEditableAnchorClick}>
        {children}
      </div>
    </SaveProvider>
  )
}

// ---------------------------------------------------------------------------
// handleEditableAnchorClick — pure event handler shared between unit
// tests and the runtime `onClickCapture`.
//
// Extracted from the inline JSX so the decision logic (anchor in subtree?
// inside section-control chrome?) can be exercised in node-env unit tests
// without invoking React hooks. Mirrors the page-level rule in
// `SectionEditControls.tsx:400-405`. If you change one, audit the other —
// there is no shared helper enforcing parity; the two handlers have
// diverged in signature (this one takes a test-friendly synthetic shape
// with explicit guards, the other takes a React MouseEvent inline).
// ---------------------------------------------------------------------------

/** @internal Exported for unit tests only. */
export function handleEditableAnchorClick(e: {
  readonly target: EventTarget | null
  readonly preventDefault: () => void
}): void {
  const target = e.target as { closest?: (selector: string) => unknown } | null
  if (target === null || typeof target.closest !== 'function') return
  const anchor = target.closest('a') as
    | { closest: (selector: string) => unknown }
    | null
  if (anchor === null) return
  if (anchor.closest('[data-agntcms-section-control]') !== null) return
  e.preventDefault()
}

// ---------------------------------------------------------------------------
// Dispatch primitive — exported for unit testing.
//
// Pulled out of `saveField` so the routing decision (origin → URL +
// body) can be tested as a pure function, without depending on the
// React render loop or SSR quirks. Returns the patched data when a
// save was dispatched, or `null` when the call was ignored (defensive
// guards — non-global origin, mismatched globalName).
// ---------------------------------------------------------------------------

interface DispatchGlobalSaveInput {
  readonly origin: PreviewFieldOriginLike
  readonly newValue: unknown
  readonly globalName: string
  readonly globalType: string
  readonly currentData: Readonly<Record<string, unknown>>
  /**
   * Optional callback fired synchronously BEFORE the alert when the
   * POST fails (non-OK response, network error, etc.). The caller
   * uses this to roll back any optimistic state it mutated; without
   * a rollback the next compose would build on top of a baseline
   * the server rejected, silently corrupting subsequent saves.
   */
  readonly onFailure?: () => void
  /**
   * Optional callback fired after the fetch settles (success or
   * failure). Used by the provider to release its in-flight guard.
   * Distinct from `onFailure` so the guard releases regardless of
   * outcome, while rollback only fires on failure.
   */
  readonly onSettled?: () => void
  /**
   * Optional `AbortSignal` so the caller can cancel the fetch (on
   * unmount, for instance). When the signal aborts, we treat the
   * resulting rejection as a non-failure: the user navigated away
   * before the response landed, so no rollback / alert / reload is
   * appropriate.
   */
  readonly signal?: AbortSignal
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function dispatchGlobalSave(
  input: DispatchGlobalSaveInput,
): Record<string, unknown> | null {
  const { origin, newValue, globalName, globalType, currentData, onFailure, onSettled, signal } =
    input

  // Defensive guards: ignore non-global origins and mismatched names.
  // A non-global origin under a GlobalSaveProvider means a page-style
  // editable somehow rendered inside a global slot — silently dropping
  // is safer than misrouting to the wrong endpoint.
  if (origin.kind !== 'global') return null
  if (origin.globalName !== undefined && origin.globalName !== globalName) {
    return null
  }

  const updated = { ...currentData, [origin.fieldPath]: newValue }

  // Forward the abort signal verbatim. When the caller passes an
  // AbortController and aborts (typically on unmount), the fetch
  // promise rejects with an AbortError; the catch branch below filters
  // those out so we don't fire rollback / alert on a deliberate cancel.
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: globalName,
      type: globalType,
      data: updated,
    }),
    ...(signal !== undefined ? { signal } : {}),
  }

  fetch('/api/agntcms/global-draft/save', fetchInit)
    .then((res) => {
      // If the caller aborted between dispatch and response, drop the
      // result on the floor: don't reload (the component is gone), and
      // don't roll back (the user's intent was to cancel).
      if (signal?.aborted) {
        onSettled?.()
        return
      }
      if (!res.ok) {
        // Roll back BEFORE the alert so even if the user dismisses
        // the alert and immediately makes another edit, the next
        // compose reads from the rejected-state baseline, not the
        // optimistic one.
        onFailure?.()
        // eslint-disable-next-line no-restricted-globals
        void res.text().then((t) => alert(`Failed to save global: ${t}`))
        onSettled?.()
        return
      }
      // Reload so the entire layout (header, footer, etc.) reflects
      // the new global content. Site-wide refresh is the simplest
      // correct semantic for v1. We DO NOT call onSettled before
      // reload — the provider unmounts as part of the reload, and
      // the unmount-effect's abort is harmless at that point.
      onSettled?.()
      window.location.reload()
    })
    .catch((err: unknown) => {
      // Aborts are deliberate cancellation, not failure. `fetch` rejects
      // with `AbortError` (DOMException in browsers, plain Error in
      // node-test envs); both expose `.name === 'AbortError'`.
      const aborted =
        signal?.aborted === true ||
        (err instanceof Error && err.name === 'AbortError')
      if (aborted) {
        onSettled?.()
        return
      }
      onFailure?.()
      // eslint-disable-next-line no-restricted-globals
      alert('Failed to save global.')
      onSettled?.()
    })

  return updated
}

// ---------------------------------------------------------------------------
// composeAndDispatch — synchronous compose-update wrapper around
// dispatchGlobalSave.
//
// Why it exists separately from dispatchGlobalSave:
//   The provider must let two synchronous saveField calls in the same
//   tick compose. If the second call reads a stale `currentData`, its
//   POST body silently overwrites the first edit. The fix is to mutate
//   a ref BEFORE returning so subsequent reads see the patch. That ref
//   mutation is what makes this helper non-pure relative to its input;
//   pulling it out keeps the React component tiny and the compose
//   semantics testable from a node-environment unit test (we can build
//   a real ref-shaped object and call composeAndDispatch twice).
// ---------------------------------------------------------------------------

interface ComposeAndDispatchInput {
  readonly ref: { current: Record<string, unknown> | null }
  readonly origin: PreviewFieldOriginLike
  readonly newValue: unknown
  readonly globalName: string
  readonly globalType: string
  /**
   * Optional abort signal forwarded to `dispatchGlobalSave`. The
   * provider passes its per-save AbortController so unmount can
   * cancel the in-flight fetch.
   */
  readonly signal?: AbortSignal
  /**
   * Optional settled callback forwarded to `dispatchGlobalSave`. The
   * provider uses this to release its in-flight guard.
   */
  readonly onSettled?: () => void
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function composeAndDispatch(
  input: ComposeAndDispatchInput,
): Record<string, unknown> | null {
  const { ref, origin, newValue, globalName, globalType, signal, onSettled } = input
  const current = ref.current ?? {}
  // Capture the pre-patch ref value so we can roll back to it if the
  // POST fails. With the provider's in-flight guard in place, two
  // composes cannot overlap on the wire — so the layered "A succeeds,
  // B fails" race that motivated the per-compose capture is unreachable
  // by construction. We keep `prePatch` as defence in depth: a future
  // refactor that removes the guard, or a direct test caller that
  // bypasses the provider, would still get a correct rollback for the
  // single-compose case.
  const prePatch = ref.current
  const next = dispatchGlobalSave({
    origin,
    newValue,
    globalName,
    globalType,
    currentData: current,
    onFailure: () => {
      ref.current = prePatch
    },
    ...(onSettled !== undefined ? { onSettled } : {}),
    ...(signal !== undefined ? { signal } : {}),
  })
  if (next === null) return null
  // Mutate ref BEFORE returning so any subsequent synchronous call in
  // the same tick reads the patched data.
  ref.current = next
  return next
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip `__agntcmsPreview` wrappers from a flat record. Mirrors the
 * `stripSectionData` pattern used in `SectionEditControls`. Any value
 * that is a PreviewField is replaced by its inner `.value`; non-wrapped
 * values pass through unchanged.
 */
function stripPreviewWrappers(
  data: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const stripped: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    const val = data[key]
    if (
      typeof val === 'object' &&
      val !== null &&
      '__agntcmsPreview' in val
    ) {
      stripped[key] = (val as unknown as { value: unknown }).value
    } else {
      stripped[key] = val
    }
  }
  return stripped
}
