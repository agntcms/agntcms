'use client'

// previewMode — tiny client-side helpers that POST to the preview
// enter/exit endpoints and reload the page on completion. Extracted so
// the floating EnterPreviewButton and PreviewToolbar's Exit button can
// share one implementation rather than each ship its own near-duplicate.
//
// Why a reload (and not router.refresh)? The preview cookie is read by
// the runtime's `getContent` at request boundary — a soft refresh
// re-runs server components but won't always re-evaluate every cached
// edge, so a hard reload is the simplest correct behaviour. This
// matches the behaviour the old usePreviewHotkey shipped.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - client-only. No imports from storage/, runtime/, handlers/, config/.

const ENTER_ENDPOINT = '/api/agntcms/preview/enter'
const EXIT_ENDPOINT = '/api/agntcms/preview/exit'

function reload(): void {
  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

/**
 * POST to /api/agntcms/preview/enter and reload. Best-effort — on
 * network failure we still reload so the user is not stuck staring at a
 * page that silently swallowed their click.
 */
export function enterPreview(): void {
  fetch(ENTER_ENDPOINT, { method: 'POST' })
    .then(reload)
    .catch(reload)
}

/**
 * POST to /api/agntcms/preview/exit and reload. Same best-effort
 * contract as enterPreview.
 */
export function exitPreview(): void {
  fetch(EXIT_ENDPOINT, { method: 'POST' })
    .then(reload)
    .catch(reload)
}
