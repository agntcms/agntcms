// `AssetStorageAdapter` — minimum interface the runtime needs to upload
// assets, obtain a public URL for them, and list them for the image
// picker (ARCHITECTURE.md §5, §6).
//
// Scope of this file, and what was deliberately cut:
//
// The suggested v1 surface mentioned an optional `resolve(url)` method
// for fetching bytes back. I deliberately CUT it. Rationale:
//
//   v1 serves assets exclusively as static files. For the default FS
//   adapter (T-006), uploads land in `public/assets/` and are served by
//   Next.js static file handling through the URL returned by `upload`.
//   Nothing on the runtime hot path — not `getContent`, not the
//   EditableImage flow, not publish — ever needs to read the raw bytes
//   back through the adapter. The UI uses the URL as an <img src>; the
//   storage round-trip does not pass through the framework.
//
//   A remote adapter (e.g. S3) would behave the same way: the returned
//   URL is served directly by the remote origin or a CDN, never proxied
//   through the runtime. Adding `resolve` now would be YAGNI — there is
//   no consumer for it in §1..§10, and adding it later is an additive,
//   non-breaking change.
//
// `upload` input shape: raw bytes plus hints for filename and MIME type.
// No alt text in the contract — alt is a prop on `<EditableImage>` set
// by the section author in their component code, not persisted per
// asset. (0.1.16–0.1.17 briefly modelled alt at the asset layer with a
// sidecar; that was reverted in 0.1.18 as over-engineering.) The
// adapter is free to use the hints however it wants (pick an extension,
// derive a hash, include the original name in the URL) — the contract
// only promises that the returned URL resolves to the uploaded bytes.
// Implementations MUST NOT mutate the input buffer.
//
// Import policy: this file imports ONLY from `../domain/` (and only if
// it ever needs to — currently no domain types are referenced here).
// It MUST NOT import from `runtime/`, `react/`, `handlers/`, `mcp/`,
// `tasks/`, `sections/`, `config/`, or from `node:*` — interfaces stay
// environment-neutral so both FS and remote adapters can implement them.

/**
 * Input for an asset upload. `bytes` is the raw file body, `filename`
 * is a hint for naming and extension, `contentType` is the MIME type
 * the adapter should associate with the uploaded object.
 */
export interface AssetUploadInput {
  readonly bytes: Uint8Array
  readonly filename: string
  readonly contentType: string
}

/**
 * Result of an asset upload. `url` is the public URL the uploaded bytes
 * are served under; `filename` is the stored name the adapter chose
 * (used by `EditableImage` to reference the asset independently of the
 * URL base). The picker modal uses `filename` when inserting a freshly
 * uploaded asset into the section payload.
 */
export interface AssetUploadResult {
  readonly url: string
  readonly filename: string
}

/**
 * A single entry in the result of `AssetStorageAdapter.list()`. Carries
 * everything the image picker UI needs to render a card: the stored
 * filename (for display + section-payload value), the public URL (for
 * the `<img src>`), the content type when known, and the modification
 * timestamp so the adapter can sort newest-first.
 */
export interface AssetListEntry {
  readonly filename: string
  readonly url: string
  readonly contentType: string | undefined
  readonly modifiedAt: Date
}

/**
 * Asset storage adapter — the seam between the runtime and whatever
 * persists user-uploaded binary assets (primarily images via the
 * EditableImage flow, per ARCHITECTURE.md §6).
 *
 * Two methods: `upload` ingests new bytes; `list` enumerates existing
 * assets for the image picker. See the file header for why there is no
 * `resolve` method.
 */
export interface AssetStorageAdapter {
  /**
   * Persist the given bytes as an asset and return a public URL that
   * serves them, alongside the stored filename. Implementations MUST
   * NOT mutate `input.bytes`.
   *
   * The URL format is adapter-defined. For the default FS adapter
   * (T-006), it is a path under `/assets/...` served by Next.js static
   * file handling. For a remote adapter, it could be an absolute URL.
   * Callers treat the returned string as opaque.
   */
  upload(input: AssetUploadInput): Promise<AssetUploadResult>

  /**
   * Enumerate every asset in the store, newest first. Used by the image
   * picker modal to let the user browse and re-insert existing assets
   * without re-uploading.
   */
  list(): Promise<readonly AssetListEntry[]>
}
