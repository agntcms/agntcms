// Preview-cookie single source of truth.
//
// agntcms preview mode is driven by a plain cookie flag (NOT Next's
// native `draftMode()` / `__prerender_bypass` cookie — nothing in the
// framework ever calls `draftMode().enable()`). The WRITER is the
// preview route handler (`handlers/preview/preview-handler.ts`); the
// READER is the server-only `getPreviewMode()` shell in `react-server/`.
// Both must agree on the cookie name AND on how a cookie value maps to a
// `PreviewMode`, or layout-level globals and page-level content drift
// into different modes (the exact bug this module exists to prevent).
//
// This is a LEAF module: it imports only the `PreviewMode` TYPE from
// runtime. It has no runtime dependencies, no `next/*` import, and no
// `node:*` import, so it is safe for both the handlers layer and the
// server-only reader to depend on without touching the module graph.

import type { PreviewMode } from '../runtime/getContent.types'

/**
 * The cookie set by the preview handler to flag preview mode. Both the
 * writer (preview handler) and the reader (`getPreviewMode`) import this
 * constant so the name cannot diverge between them.
 */
export const PREVIEW_COOKIE_NAME = '__agntcms_preview'

/**
 * The cookie value that means "preview mode is on". Centralised next to
 * the name so the writer's `=1` and the reader's `=== '1'` check stay in
 * lockstep.
 */
export const PREVIEW_COOKIE_ON_VALUE = '1'

/**
 * Pure decision: map a raw cookie value to a `PreviewMode`. Returns
 * `'preview'` only when the value is exactly the on-value; absent,
 * empty, or any other value resolves to `'published'`.
 *
 * Kept pure (no `cookies()` / `next/headers`) so it is unit-testable on
 * its own — the thin `getPreviewMode()` shell does the I/O and delegates
 * the decision here. Mirrors how the preview handler isolates its logic.
 */
export function previewModeFromCookieValue(
  value: string | undefined,
): PreviewMode {
  return value === PREVIEW_COOKIE_ON_VALUE ? 'preview' : 'published'
}
