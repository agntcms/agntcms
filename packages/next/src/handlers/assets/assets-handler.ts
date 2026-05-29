// Assets management route handlers (image picker).
//
// Two endpoints for the image picker lifecycle: list every asset the
// store knows about, and upload new bytes. Thin HTTP wrappers over
// `AssetStorageAdapter` — validation, multipart parsing, and error
// mapping only. No business logic lives here.
//
// 0.1.18: alt metadata was removed at every layer. Alt is a prop on
// `<EditableImage>` in the section component code, with a single
// framework-level default when the author does not provide one.
//
// Import policy (ARCHITECTURE.md §8, Invariant 1):
//   handlers/ may import from domain/, storage/, and runtime/.
//   It MUST NOT import from react/, mcp/, tasks/, sections/, or config/.

import type {
  AssetListEntry,
  AssetStorageAdapter,
  AssetUploadResult,
} from '../../storage/assets'
import { jsonResponse, safeErrorMessage } from '../utils'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AssetsHandlerDeps {
  readonly assetAdapter: AssetStorageAdapter
}

export interface AssetsHandler {
  /** GET /api/agntcms/assets -- list every asset (newest first) */
  readonly list: (req: Request) => Promise<Response>
  /** POST /api/agntcms/assets -- upload bytes */
  readonly upload: (req: Request) => Promise<Response>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Serialise an `AssetListEntry` for JSON transport. `Date` → ISO string;
// `undefined` content-type becomes `null` rather than a missing key so
// the JSON shape is stable for consumers.
const serialiseEntry = (e: AssetListEntry): Record<string, unknown> => ({
  filename: e.filename,
  url: e.url,
  contentType: e.contentType ?? null,
  modifiedAt: e.modifiedAt.toISOString(),
})

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAssetsHandler(deps: AssetsHandlerDeps): AssetsHandler {
  const { assetAdapter } = deps

  const list = async (req: Request): Promise<Response> => {
    // Guard against accidental POST to the list route — this handler is
    // GET-only. The template wires list/upload to the same URL via
    // method-dispatch, so a misrouted POST landing here would otherwise
    // silently succeed.
    if (req.method !== 'GET') {
      return jsonResponse(
        { error: 'method_not_allowed', message: `Expected GET, got ${req.method}` },
        405,
      )
    }

    let entries: readonly AssetListEntry[]
    try {
      entries = await assetAdapter.list()
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse(
      { assets: entries.map(serialiseEntry) },
      200,
    )
  }

  const upload = async (req: Request): Promise<Response> => {
    // Parse multipart/form-data. The frozen route for this endpoint
    // passes `Request` straight through, so we rely on the standard
    // `Request.formData()` parser here.
    let form: FormData
    try {
      form = await req.formData()
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'invalid_body', message: safeErrorMessage(err) },
        400,
      )
    }

    const fileField = form.get('file')

    // Missing file. `File` is a subclass of `Blob` in the undici runtime
    // Next.js uses for route handlers; the type guard `instanceof Blob`
    // covers both.
    if (!(fileField instanceof Blob)) {
      return jsonResponse(
        { error: 'missing_file', message: 'Missing required field: file' },
        400,
      )
    }

    // Content-type guard. The picker is an image-only UI; accepting
    // other MIME types here would either pollute the assets directory
    // or surface unrenderable entries in the picker grid. The filter
    // is deliberately broad (`image/*`) so new formats like AVIF work
    // without a framework release.
    const contentType = fileField.type
    if (!contentType.startsWith('image/')) {
      return jsonResponse(
        {
          error: 'invalid_content_type',
          message: `Expected image/*, got ${contentType || 'unknown'}`,
        },
        400,
      )
    }

    // `File.name` carries the original filename in browsers; for a bare
    // Blob it is empty. The adapter only uses this as a hint for the
    // extension, so an empty string is safe — it just stores the asset
    // without an extension.
    const filename = 'name' in fileField && typeof (fileField as File).name === 'string'
      ? (fileField as File).name
      : ''

    const arrayBuffer = await fileField.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    let result: AssetUploadResult
    try {
      result = await assetAdapter.upload({
        bytes,
        filename,
        contentType,
      })
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'upload_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    // Shape the response as an `AssetListEntry` so the picker can merge
    // the new asset into its list state without a second fetch. The
    // adapter does not surface mtime on upload, so we stamp `now()`
    // (the file was just written).
    const asset: Record<string, unknown> = {
      filename: result.filename,
      url: result.url,
      contentType,
      modifiedAt: new Date().toISOString(),
    }

    return jsonResponse({ asset }, 200)
  }

  return { list, upload }
}
