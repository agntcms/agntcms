// Shared helpers for handlers.
//
// These two helpers were duplicated verbatim (or near-verbatim) across
// every handler factory. Consolidating them here keeps the HTTP surface
// consistent: JSON content-type header shape and error-message extraction
// must not drift between endpoints.
//
// `extraHeaders` is the generalisation `preview-handler.ts` needs for
// `Set-Cookie`. Callers that pass nothing observe the same behaviour as
// the old handler-local versions, because object spread on `undefined`
// is a no-op in the headers init.
//
// Import policy (ARCHITECTURE.md section 8, Invariant 1):
//   This file is a handler-layer helper. It sits under handlers/ and
//   must stay there — it is not runtime, domain, or storage. It has no
//   imports beyond the standard Web `Response` type.

/**
 * Build a JSON `Response` with the given body and status. Optional
 * `extraHeaders` are merged into the headers init after Content-Type, so
 * callers can add Set-Cookie, Location, etc. without reimplementing the
 * JSON envelope.
 */
export const jsonResponse = (
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })

/**
 * Narrow an unknown thrown value to a descriptive string without
 * leaking stack traces into HTTP responses.
 */
export const safeErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'unknown error'
}
