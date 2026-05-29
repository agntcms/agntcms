// Preview mode route handlers (T-012, extended in T-045).
//
// agntcms preview mode uses a simple cookie flag. The template's
// catch-all page reads this cookie and passes the appropriate `mode`
// to `getContent`. These handlers just set and clear the cookie;
// they do not import runtime or storage — the lightest possible
// footprint.
//
// T-045 adds token-based entry: `issueToken` creates a single-use
// token for a slug (called by the MCP bridge or trusted internal
// code), and `enterWithToken` consumes it on a GET redirect so that
// an external link can open preview mode without a prior POST.
//
// Import policy: only imports types from preview-tokens (a leaf
// module with no framework dependencies).

import type { PreviewTokenStore } from '../../preview-tokens/index'
import { PREVIEW_COOKIE_NAME } from '../../preview/cookie'
import { jsonResponse } from '../utils'

// Single source of truth for the cookie name, shared with the reader
// (`getPreviewMode`) so the writer and reader cannot diverge.
const DEFAULT_COOKIE_NAME = PREVIEW_COOKIE_NAME

export interface PreviewHandlerDeps {
  /** Cookie name used for preview mode flag. Default: '__agntcms_preview' */
  readonly cookieName?: string
  /** Optional token store for single-use preview links. */
  readonly tokenStore?: PreviewTokenStore
}

export interface PreviewHandler {
  /** POST /api/agntcms/preview/enter -- enable preview mode */
  readonly enter: (req: Request) => Response
  /** POST /api/agntcms/preview/exit -- disable preview mode */
  readonly exit: (req: Request) => Response
  /** GET /api/agntcms/preview/enter?token=... -- token exchange + redirect */
  readonly enterWithToken: (req: Request) => Response
  /** POST /api/agntcms/preview/token -- issue a single-use preview token */
  readonly issueToken: (req: Request) => Promise<Response>
}

export function createPreviewHandler(deps?: PreviewHandlerDeps): PreviewHandler {
  const cookieName = deps?.cookieName ?? DEFAULT_COOKIE_NAME
  const tokenStore = deps?.tokenStore

  const enter = (_req: Request): Response => {
    // Set the preview cookie. HttpOnly prevents client-side JS from
    // tampering; SameSite=Lax prevents CSRF while still allowing
    // top-level navigations to carry the cookie.
    const cookie = `${cookieName}=1; Path=/; HttpOnly; SameSite=Lax`
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie })
  }

  const exit = (_req: Request): Response => {
    // Clear the cookie by setting Max-Age=0.
    const cookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie })
  }

  const enterWithToken = (req: Request): Response => {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!tokenStore) {
      return jsonResponse({ error: 'token_store_not_configured' }, 501)
    }

    if (!token) {
      return jsonResponse({ error: 'missing_token' }, 400)
    }

    const slug = tokenStore.consume(token)
    if (slug === null) {
      return jsonResponse({ error: 'invalid_or_expired_token' }, 403)
    }

    // Set preview cookie and redirect to the resolved page.
    const cookie = `${cookieName}=1; Path=/; HttpOnly; SameSite=Lax`
    const redirectUrl = `/${slug}`
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': cookie,
      },
    })
  }

  const issueToken = async (req: Request): Promise<Response> => {
    if (!tokenStore) {
      return jsonResponse({ error: 'token_store_not_configured' }, 501)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('slug' in body) ||
      typeof (body as Record<string, unknown>).slug !== 'string'
    ) {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }

    const slug = (body as Record<string, unknown>).slug as string
    const previewToken = tokenStore.issue(slug)

    return jsonResponse({
      token: previewToken.token,
      previewUrl: `/api/agntcms/preview/enter?token=${previewToken.token}`,
    }, 200)
  }

  return { enter, exit, enterWithToken, issueToken }
}
