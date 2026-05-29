// `getPreviewMode()` — server-only reader for the agntcms preview cookie.
//
// Why this exists:
//   agntcms preview mode is flagged by the `__agntcms_preview` cookie set
//   by the preview handler — NOT by Next's native `draftMode()` (whose
//   `__prerender_bypass` cookie nothing in the framework ever enables).
//   Both the template's `page.tsx` and `layout.tsx` must derive the same
//   `mode` and feed it to `getContent` / `<GlobalSlot>`. Reading the raw
//   cookie in two places once drifted (layout used `draftMode()`, page
//   used the cookie), so the layout's globals always rendered as
//   'published'. This shared helper makes both call sites read the SAME
//   cookie through the SAME decision function.
//
// Why this lives in `react-server/` (not `runtime/`):
//   It imports `cookies` from `next/headers`, which is a server-only
//   Next.js API. `runtime/` is deliberately framework-agnostic and
//   unit-testable without Next, so a `next/headers` import must not land
//   there (invariant 1 — runtime purity). `react-server/` is the
//   server-only zone bundled into `dist/server.mjs` and exported solely
//   through `@agntcms/next/server`; the client bundle never reaches it
//   (invariant 2). The decision logic itself is the pure
//   `previewModeFromCookieValue` in `preview/cookie.ts`, which IS
//   unit-tested — this file is a thin I/O shell over it.

import { cookies } from 'next/headers'

import type { PreviewMode } from '../runtime/getContent.types'
import {
  PREVIEW_COOKIE_NAME,
  previewModeFromCookieValue,
} from '../preview/cookie'

export interface GetPreviewModeOptions {
  /**
   * Override the cookie name to read. Defaults to the shared
   * `PREVIEW_COOKIE_NAME` that the preview handler writes — pass this
   * only if a custom preview handler was configured with a custom
   * `cookieName`.
   */
  readonly cookieName?: string
}

/**
 * Resolve the current request's preview `mode` from the agntcms preview
 * cookie. Returns `'preview'` when the cookie is set to the on-value,
 * `'published'` otherwise.
 *
 * Use this in `app/layout.tsx` and `app/[[...slug]]/page.tsx` to feed the
 * SAME `mode` to `getContent` and `<GlobalSlot>`, so page content and
 * layout-level globals never disagree about whether preview is active.
 *
 * `cookies()` is async in Next 15+, so this helper is async too.
 */
export async function getPreviewMode(
  options?: GetPreviewModeOptions,
): Promise<PreviewMode> {
  const cookieName = options?.cookieName ?? PREVIEW_COOKIE_NAME
  const store = await cookies()
  const value = store.get(cookieName)?.value
  return previewModeFromCookieValue(value)
}
