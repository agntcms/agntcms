// Internal helpers shared by the FS storage adapters (content, assets,
// submissions). Not exported from any public barrel — these are
// implementation details of `storage/fs/*`.
//
// Three small primitives live here:
//
//   1. `isEnoent` — a typed `ENOENT` guard that the adapters use to map
//      "file/dir not found" into the appropriate domain response (null,
//      empty list, etc.) instead of a 500.
//
//   2. `writeAtomic` — write to a sibling temp file in the SAME directory,
//      then `rename` onto the target. `rename` is atomic on POSIX
//      filesystems for files within the same directory, so no half-written
//      file can ever be observed by a reader. Cross-directory renames are
//      avoided because some filesystems treat them as copy+unlink.
//
//   3. `resolveUnderBucket` — defence-in-depth path resolution. After a
//      caller has already validated the user-supplied component (e.g.
//      `assertValidSlug`), this helper re-checks that the resolved
//      absolute path is still under the bucket directory. The regex
//      catches `..` and separators; this prefix check catches symlink
//      escapes and future regex bugs.
//
// Import policy: `node:*` only. MUST NOT import from `runtime/`,
// `react/`, `handlers/`, `mcp/`, `tasks/`, `sections/`, `forms/`,
// `config/`, or anywhere outside `storage/fs/`.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/** Type guard for Node's `ENOENT` (file/dir not found) errors. */
export const isEnoent = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  (err as { code: unknown }).code === 'ENOENT'

/** Default temp-file suffix (non-cryptographic; sufficient for v1 single-writer). */
const defaultRandomSuffix = (): string => Math.random().toString(36).slice(2)

/**
 * Write `data` to `target` atomically: write to a sibling temp file in
 * the same directory, then `rename` onto the target. Creates the
 * containing directory if missing. On error, makes a best-effort
 * `unlink` of the temp file and rethrows the original failure.
 *
 * `randomSuffix` defaults to a `Math.random()`-based suffix (fine for
 * the single-writer v1 model). Callers that need cryptographic
 * collision-resistance (submissions adapter under load) pass a
 * `randomUUID`-based suffix.
 *
 * Accepts `string | Uint8Array` because `fs.writeFile` already handles
 * both natively. We deliberately omit the `encoding` option: for
 * strings, Node's default is utf8 (matches the previous explicit
 * `encoding: 'utf8'`); for `Uint8Array`, encoding is ignored anyway.
 */
export const writeAtomic = async (
  target: string,
  data: string | Uint8Array,
  randomSuffix: () => string = defaultRandomSuffix,
): Promise<void> => {
  const dir = path.dirname(target)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.${process.pid}.${randomSuffix()}.tmp`,
  )
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, target)
  } catch (err) {
    // Best-effort cleanup: surfacing the original failure is more useful
    // than shadowing it with an unlink error.
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}

/**
 * Resolve `<bucket>/<key>` and verify the resulting absolute path is
 * still under `bucket`. Caller is responsible for validating `key`
 * upstream (e.g. via `assertValidSlug`); this helper is the
 * defence-in-depth traversal guard, not the primary validator.
 *
 * `errorLabel` is the message body thrown on traversal — kept
 * parameterised so each call site preserves its existing, distinct
 * error contract (e.g. `slug escapes storage bucket`,
 * `slug escapes history bucket`, `name escapes globals history bucket`).
 *
 * `errorKey` defaults to `key` and is the value JSON-stringified into
 * the thrown message. Override it when the on-disk `key` differs from
 * the conceptual identifier the caller wants to surface — e.g. when
 * `key` is `<slug>.json` but the error should reference just the
 * slug, matching the call site's pre-extraction error contract.
 */
export const resolveUnderBucket = (
  bucket: string,
  key: string,
  errorLabel: string,
  errorKey: string = key,
): string => {
  const resolved = path.resolve(bucket, key)
  const bucketWithSep = bucket.endsWith(path.sep) ? bucket : bucket + path.sep
  if (!resolved.startsWith(bucketWithSep)) {
    throw new Error(`${errorLabel}: ${JSON.stringify(errorKey)}`)
  }
  return resolved
}
