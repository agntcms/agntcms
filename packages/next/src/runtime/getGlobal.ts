// `getGlobal` — site-wide global content reader.
//
// Sibling to `getContent` (ARCHITECTURE.md §6) for standalone globals.
// Same dual nature: in 'preview' mode, every field in the global's data
// is wrapped in `PreviewField<T>` carrying origin metadata so editable
// widgets can save back through the draft endpoint. In 'published' mode,
// the bare `Global` from the adapter is returned with zero allocation.
//
// Draft → publish composition (mirror of `getContent`):
//   In preview mode, we try the draft bucket first and fall back to
//   published. This matches the page-content rule precisely so users
//   see "what they last saved" — a freshly saved draft — without
//   needing to publish. The fallback lives HERE in the runtime, NOT
//   in the storage adapter (see storage/content.ts header for the
//   rationale: keeping each adapter method's behaviour obvious).
//
//   The `source` field on the origin reflects which bucket the data
//   actually came from ('draft' or 'published'), so editable widgets
//   can surface that distinction (and so debugging is easier when an
//   edit "doesn't show up" because the user is reading published data).
//   The `revision` hash is computed over the bytes the user is
//   actually editing — the global as returned by the chosen bucket.
//
// Differences from `getContent`:
//   - The origin discriminates as `kind: 'global'` and carries
//     `globalName` so the client save dispatcher can route to the
//     globals endpoint instead of the page-draft endpoint.
//   - Returns `null` (NOT throws) when the named global doesn't exist
//     in either bucket. A typo'd name in `<GlobalSlot name="..." />`
//     should let the layout render its fallback gracefully, not 500
//     the whole app.
//
// Import policy: same as `getContent.ts` — only `../domain/` and
// `../storage/`. No imports from `react/`, `handlers/`, `mcp/`,
// `tasks/`, `sections/`, or `config/`.

import { createHash } from 'node:crypto'

import type { Global } from '../domain/index'
import type { ContentStorageAdapter } from '../storage/content'
import type {
  PreviewField,
  PreviewFieldOrigin,
  PreviewMode,
} from './getContent.types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GetGlobalInput {
  readonly name: string
  readonly mode: PreviewMode
}

/**
 * The runtime function shape for `getGlobal`. Returned as part of the
 * `Runtime` surface from `createRuntime`. Returns `null` when the named
 * global doesn't exist.
 */
export type GetGlobal = (options: GetGlobalInput) => Promise<Global | null>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * SHA-256 hex hash of the serialized global. Same rationale as
 * `getContent`'s `computeRevision`: stateless, adapter-agnostic, and
 * detects actual content drift. We hash the global as-is (name, type,
 * data) so any field-level change produces a new revision.
 */
const computeRevision = (global: Global): string => {
  const serialized = JSON.stringify(global)
  return createHash('sha256').update(serialized).digest('hex')
}

/**
 * Wrap every field in a global's data with `PreviewField` carrying a
 * `kind: 'global'` origin. The origin's `pageSlug`/`sectionId` slots
 * are populated with sentinel values matching the convention
 * `AdminModal.wrapGlobalData` already uses (`__global__:<name>` /
 * `<name>`). Existing editable widgets read these properties for the
 * agent ✨ context summary; keeping them populated avoids forking the
 * widget code.
 *
 * `source` is now per-call: it reflects which bucket the wrapped data
 * was actually read from in preview mode (draft if a draft exists,
 * otherwise published). Globals carry a real draft/publish cycle, and
 * leaking that distinction up to the widget means a future "you are
 * editing the published copy, no draft yet" UI affordance can read the
 * origin instead of guessing.
 */
const wrapGlobalData = (
  global: Global,
  revision: string,
  source: 'draft' | 'published',
): Record<string, PreviewField<unknown>> => {
  const data = global.data as Record<string, unknown>
  const wrapped: Record<string, PreviewField<unknown>> = {}
  for (const key of Object.keys(data)) {
    const origin: PreviewFieldOrigin = {
      kind: 'global',
      globalName: global.name,
      // Sentinel values: keep the shape stable for editable widgets that
      // already read these props. The `__global__:` prefix surfaces the
      // origin in any debug logging without ambiguity vs. real slugs.
      pageSlug: `__global__:${global.name}`,
      sectionId: global.name,
      fieldPath: key,
      source,
      revision,
    }
    wrapped[key] = {
      __agntcmsPreview: true,
      value: data[key],
      origin,
    }
  }
  return wrapped
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the `getGlobal` runtime function. Takes the same content
 * adapter the rest of the runtime uses; no global state.
 */
export function createGetGlobal(
  contentAdapter: ContentStorageAdapter,
): GetGlobal {
  return async (input: GetGlobalInput): Promise<Global | null> => {
    const { name, mode } = input

    // -----------------------------------------------------------------------
    // PUBLISHED MODE — prod hot path
    // -----------------------------------------------------------------------
    //
    // Bare data from the adapter, no wrapping, no hashing. Fast.
    // The adapter ONLY reads from the published bucket in this branch —
    // it does not (must not) fall back to a draft on production
    // surfaces. Drafts are an editor concept, never visible on the
    // live site (ARCHITECTURE.md §6: dual nature of getContent).
    if (mode === 'published') {
      return contentAdapter.readGlobal(name, 'published')
    }

    // -----------------------------------------------------------------------
    // PREVIEW MODE — editor path
    // -----------------------------------------------------------------------
    //
    // Compose draft → published, same discipline as `getContent` in
    // preview. The fallback is intentionally HERE in the runtime, not in
    // the adapter, so each adapter method stays single-purpose. `source`
    // on the wrapped origin records which bucket was actually consumed.
    // Assign `source` on the same branch as the actual read decision so a
    // future edit that reorders the fallback can't leave `source = 'draft'`
    // stuck on a published-bucket result. The default-then-overwrite shape
    // is one rename away from quietly lying about the origin.
    let global = await contentAdapter.readGlobal(name, 'draft')
    let source: 'draft' | 'published'
    if (global !== null) {
      source = 'draft'
    } else {
      global = await contentAdapter.readGlobal(name, 'published')
      source = 'published'
    }
    if (global === null) return null

    const revision = computeRevision(global)
    const wrappedData = wrapGlobalData(global, revision, source)

    return {
      name: global.name,
      type: global.type,
      data: wrappedData,
    }
  }
}
