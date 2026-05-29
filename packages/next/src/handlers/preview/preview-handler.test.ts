import { describe, it, expect } from 'vitest'
import { createPreviewHandler } from './preview-handler'
import { createPreviewTokenStore } from '../../preview-tokens/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dummyRequest = (): Request => new Request('http://localhost/api/agntcms/preview/enter', { method: 'POST' })

const getCookie = (res: Response): string | null => res.headers.get('Set-Cookie')

const jsonBody = async (res: Response): Promise<Record<string, unknown>> =>
  await res.json() as Record<string, unknown>

// ---------------------------------------------------------------------------
// enter / exit (backward compat — existing tests)
// ---------------------------------------------------------------------------

describe('createPreviewHandler', () => {
  it('enter sets the preview cookie', () => {
    const handler = createPreviewHandler()
    const res = handler.enter(dummyRequest())

    expect(res.status).toBe(200)
    const cookie = getCookie(res)
    expect(cookie).toContain('__agntcms_preview=1')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('exit clears the preview cookie via Max-Age=0', () => {
    const handler = createPreviewHandler()
    const res = handler.exit(dummyRequest())

    expect(res.status).toBe(200)
    const cookie = getCookie(res)
    expect(cookie).toContain('__agntcms_preview=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('custom cookie name is respected', () => {
    const handler = createPreviewHandler({ cookieName: 'my_preview' })

    const enterRes = handler.enter(dummyRequest())
    expect(getCookie(enterRes)).toContain('my_preview=1')

    const exitRes = handler.exit(dummyRequest())
    expect(getCookie(exitRes)).toContain('my_preview=')
    expect(getCookie(exitRes)).toContain('Max-Age=0')
  })

  it('enter returns { ok: true } JSON body', async () => {
    const handler = createPreviewHandler()
    const res = handler.enter(dummyRequest())
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ ok: true })
  })

  it('exit returns { ok: true } JSON body', async () => {
    const handler = createPreviewHandler()
    const res = handler.exit(dummyRequest())
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// enterWithToken
// ---------------------------------------------------------------------------

describe('enterWithToken', () => {
  it('returns 302 redirect with Set-Cookie for a valid token', () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })
    const { token } = tokenStore.issue('blog/hello-world')

    const req = new Request(`http://localhost/api/agntcms/preview/enter?token=${token}`)
    const res = handler.enterWithToken(req)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/blog/hello-world')

    const cookie = getCookie(res)
    expect(cookie).toContain('__agntcms_preview=1')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('returns 403 for an invalid token', () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    const req = new Request('http://localhost/api/agntcms/preview/enter?token=bogus')
    const res = handler.enterWithToken(req)

    expect(res.status).toBe(403)
  })

  it('returns 400 when token param is missing', () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    const req = new Request('http://localhost/api/agntcms/preview/enter')
    const res = handler.enterWithToken(req)

    expect(res.status).toBe(400)
  })

  it('returns 501 when tokenStore is not configured', () => {
    const handler = createPreviewHandler()

    const req = new Request('http://localhost/api/agntcms/preview/enter?token=abc')
    const res = handler.enterWithToken(req)

    expect(res.status).toBe(501)
  })

  it('consumes the token (single use)', () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })
    const { token } = tokenStore.issue('about')

    // First use succeeds
    const req1 = new Request(`http://localhost/api/agntcms/preview/enter?token=${token}`)
    expect(handler.enterWithToken(req1).status).toBe(302)

    // Second use fails — token already consumed
    const req2 = new Request(`http://localhost/api/agntcms/preview/enter?token=${token}`)
    expect(handler.enterWithToken(req2).status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// issueToken
// ---------------------------------------------------------------------------

describe('issueToken', () => {
  it('returns 200 with token and previewUrl for a valid slug', async () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    const req = new Request('http://localhost/api/agntcms/preview/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'blog/my-post' }),
    })
    const res = await handler.issueToken(req)

    expect(res.status).toBe(200)
    const body = await jsonBody(res)
    expect(typeof body.token).toBe('string')
    expect(body.previewUrl).toBe(`/api/agntcms/preview/enter?token=${body.token as string}`)
  })

  it('returns 400 when slug is missing', async () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    const req = new Request('http://localhost/api/agntcms/preview/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notSlug: 'oops' }),
    })
    const res = await handler.issueToken(req)

    expect(res.status).toBe(400)
    const body = await jsonBody(res)
    expect(body.error).toBe('missing_slug')
  })

  it('returns 400 for invalid JSON body', async () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    const req = new Request('http://localhost/api/agntcms/preview/token', {
      method: 'POST',
      body: 'not json',
    })
    const res = await handler.issueToken(req)

    expect(res.status).toBe(400)
    const body = await jsonBody(res)
    expect(body.error).toBe('invalid_json')
  })

  it('returns 501 when tokenStore is not configured', async () => {
    const handler = createPreviewHandler()

    const req = new Request('http://localhost/api/agntcms/preview/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'anything' }),
    })
    const res = await handler.issueToken(req)

    expect(res.status).toBe(501)
    const body = await jsonBody(res)
    expect(body.error).toBe('token_store_not_configured')
  })

  it('issued token is consumable via enterWithToken', async () => {
    const tokenStore = createPreviewTokenStore()
    const handler = createPreviewHandler({ tokenStore })

    // Issue
    const issueReq = new Request('http://localhost/api/agntcms/preview/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'products/widget' }),
    })
    const issueRes = await handler.issueToken(issueReq)
    const { token } = await issueRes.json() as { token: string }

    // Consume via enterWithToken
    const enterReq = new Request(`http://localhost/api/agntcms/preview/enter?token=${token}`)
    const enterRes = handler.enterWithToken(enterReq)

    expect(enterRes.status).toBe(302)
    expect(enterRes.headers.get('Location')).toBe('/products/widget')
  })
})
