import { describe, it, expect } from 'vitest'
import type { LinkValue } from './fields'
import { hrefOf, isExternalLink, linkAnchorAttrs, normalizeLinkValue } from './link'

describe('hrefOf — internal links', () => {
  it('empty slug → root', () => {
    expect(hrefOf({ type: 'internal', slug: '', label: 'Home' })).toBe('/')
  })

  it('"home" slug → root', () => {
    expect(hrefOf({ type: 'internal', slug: 'home', label: 'Home' })).toBe('/')
  })

  it('single-segment slug → /<slug>', () => {
    expect(hrefOf({ type: 'internal', slug: 'about', label: 'About' })).toBe('/about')
  })

  it('multi-segment slug → /<slug>', () => {
    expect(hrefOf({ type: 'internal', slug: 'blog/welcome', label: 'Welcome' })).toBe(
      '/blog/welcome',
    )
  })

  it('defensive: leading-slash slug does not double-slash', () => {
    // Hand-edited or migrated content might still carry a leading
    // slash. We strip it so the rendered href stays valid (a `//`
    // prefix is protocol-relative and would point off-site).
    expect(hrefOf({ type: 'internal', slug: '/blog', label: 'Blog' })).toBe('/blog')
  })

  it('trailing slash is preserved as part of the slug', () => {
    // We deliberately do NOT strip trailing slashes — a slug with a
    // trailing slash is invalid by the validator anyway, and silently
    // rewriting it here would mask the upstream bug.
    expect(hrefOf({ type: 'internal', slug: 'blog/', label: 'Blog' })).toBe('/blog/')
  })
})

describe('hrefOf — external links', () => {
  it('returns the URL verbatim', () => {
    expect(
      hrefOf({ type: 'external', url: 'https://example.test/path', label: 'X' }),
    ).toBe('https://example.test/path')
  })

  it('returns empty string for an empty URL', () => {
    // The validator allows an empty URL as "not yet entered" and the
    // editor surfaces the empty-state UX. hrefOf is content-agnostic.
    expect(hrefOf({ type: 'external', url: '', label: 'X' })).toBe('')
  })
})

describe('hrefOf — email links', () => {
  it('returns mailto: + email when populated', () => {
    expect(hrefOf({ type: 'email', email: 'foo@bar.test', label: 'Mail' })).toBe(
      'mailto:foo@bar.test',
    )
  })

  it('returns empty string for an empty email so an anchor can be skipped', () => {
    expect(hrefOf({ type: 'email', email: '', label: 'Mail' })).toBe('')
  })
})

describe('hrefOf — phone links', () => {
  it('returns tel: with non-[\\d+] characters stripped from the URI', () => {
    // The original phone field stays formatted for display. hrefOf
    // strips parens, hyphens, and spaces before emitting the tel:
    // URI so dialler apps receive a clean number.
    expect(
      hrefOf({ type: 'phone', phone: '+1 (555) 123-4567', label: 'Call' }),
    ).toBe('tel:+15551234567')
  })

  it('preserves the leading + when present', () => {
    expect(hrefOf({ type: 'phone', phone: '+44 20 7946 0958', label: '' })).toBe(
      'tel:+442079460958',
    )
  })

  it('returns empty string for an empty phone so an anchor can be skipped', () => {
    expect(hrefOf({ type: 'phone', phone: '', label: '' })).toBe('')
  })
})

describe('isExternalLink', () => {
  it('true for external', () => {
    expect(isExternalLink({ type: 'external', url: 'https://x.test/', label: '' })).toBe(true)
  })

  it('false for internal', () => {
    expect(isExternalLink({ type: 'internal', slug: 'about', label: '' })).toBe(false)
  })

  it('false for email — native handler, not a navigation off-site', () => {
    expect(isExternalLink({ type: 'email', email: 'a@b.test', label: '' })).toBe(false)
  })

  it('false for phone — native handler, not a navigation off-site', () => {
    expect(isExternalLink({ type: 'phone', phone: '+1 555', label: '' })).toBe(false)
  })
})

describe('linkAnchorAttrs', () => {
  it('returns target=_blank + rel=noreferrer for external', () => {
    expect(
      linkAnchorAttrs({ type: 'external', url: 'https://x.test/', label: '' }),
    ).toEqual({ href: 'https://x.test/', target: '_blank', rel: 'noreferrer' })
  })

  it('returns just href for internal', () => {
    expect(linkAnchorAttrs({ type: 'internal', slug: 'about', label: '' })).toEqual({
      href: '/about',
    })
  })

  it('returns just href for email — mailto: opens the native handler', () => {
    expect(linkAnchorAttrs({ type: 'email', email: 'foo@bar.test', label: '' })).toEqual(
      { href: 'mailto:foo@bar.test' },
    )
  })

  it('returns just href for phone — tel: opens the native dialler', () => {
    expect(linkAnchorAttrs({ type: 'phone', phone: '555-1234', label: '' })).toEqual({
      href: 'tel:5551234',
    })
  })

  it('preserves the empty-href contract for empty email/phone', () => {
    expect(linkAnchorAttrs({ type: 'email', email: '', label: '' })).toEqual({ href: '' })
    expect(linkAnchorAttrs({ type: 'phone', phone: '', label: '' })).toEqual({ href: '' })
  })
})

describe('normalizeLinkValue — old shape mailto/tel migration', () => {
  it('mailto: href becomes email type', () => {
    // Legacy `{ href: 'mailto:foo@bar.test' }` content must migrate
    // onto the email branch on read. The `mailto:` prefix is
    // stripped — `link.email` carries just the address.
    expect(
      normalizeLinkValue({ href: 'mailto:foo@bar.test', label: 'Mail' }),
    ).toEqual({ type: 'email', email: 'foo@bar.test', label: 'Mail' })
  })

  it('MAILTO: (uppercase) is also recognised', () => {
    expect(
      normalizeLinkValue({ href: 'MAILTO:foo@bar.test', label: '' }),
    ).toEqual({ type: 'email', email: 'foo@bar.test', label: '' })
  })

  it('tel: href becomes phone type with the suffix preserved verbatim', () => {
    // The phone string is preserved verbatim (formatted) — only the
    // `tel:` URI emitted by `hrefOf` strips non-[\d+] characters.
    expect(
      normalizeLinkValue({ href: 'tel:+1 555 123 4567', label: 'Call' }),
    ).toEqual({ type: 'phone', phone: '+1 555 123 4567', label: 'Call' })
  })

  it('TEL: (uppercase) is also recognised', () => {
    expect(normalizeLinkValue({ href: 'TEL:+15551234567', label: '' })).toEqual({
      type: 'phone',
      phone: '+15551234567',
      label: '',
    })
  })
})

describe('normalizeLinkValue — old shape', () => {
  it('http href becomes external', () => {
    const result = normalizeLinkValue({ href: 'http://example.test/', label: 'x' })
    expect(result).toEqual({
      type: 'external',
      url: 'http://example.test/',
      label: 'x',
    } satisfies LinkValue)
  })

  it('https href becomes external', () => {
    expect(
      normalizeLinkValue({ href: 'https://example.test/path', label: 'x' }),
    ).toEqual({ type: 'external', url: 'https://example.test/path', label: 'x' })
  })

  it('site-relative href becomes internal with leading slash stripped', () => {
    expect(normalizeLinkValue({ href: '/about', label: 'About' })).toEqual({
      type: 'internal',
      slug: 'about',
      label: 'About',
    })
  })

  it('multi-segment site-relative href becomes internal', () => {
    expect(
      normalizeLinkValue({ href: '/blog/welcome', label: 'Welcome' }),
    ).toEqual({ type: 'internal', slug: 'blog/welcome', label: 'Welcome' })
  })

  it('href without leading slash becomes internal as-is', () => {
    // Authors sometimes hand-write the href without the slash. We
    // accept it and route through the same internal branch.
    expect(normalizeLinkValue({ href: 'about', label: 'About' })).toEqual({
      type: 'internal',
      slug: 'about',
      label: 'About',
    })
  })

  it('empty href becomes blank internal', () => {
    expect(normalizeLinkValue({ href: '', label: 'x' })).toEqual({
      type: 'internal',
      slug: '',
      label: 'x',
    })
  })

  it('drops the legacy `external` flag — type derives from the protocol', () => {
    // The legacy flag is unreliable (most authors never set it). We
    // re-derive `type` from the href so the editor renders the right
    // sub-form on the next open.
    expect(
      normalizeLinkValue({ href: '/about', label: 'x', external: true }),
    ).toEqual({ type: 'internal', slug: 'about', label: 'x' })
    expect(
      normalizeLinkValue({ href: 'https://x.test/', label: 'x', external: false }),
    ).toEqual({ type: 'external', url: 'https://x.test/', label: 'x' })
  })

  it('missing label becomes empty string', () => {
    expect(normalizeLinkValue({ href: '/about' })).toEqual({
      type: 'internal',
      slug: 'about',
      label: '',
    })
  })
})

describe('normalizeLinkValue — new shape', () => {
  it('internal passes through', () => {
    const v: LinkValue = { type: 'internal', slug: 'home', label: 'Home' }
    expect(normalizeLinkValue(v)).toEqual(v)
  })

  it('external passes through', () => {
    const v: LinkValue = { type: 'external', url: 'https://x.test/', label: 'X' }
    expect(normalizeLinkValue(v)).toEqual(v)
  })

  it('internal with missing slug coerces to empty', () => {
    expect(normalizeLinkValue({ type: 'internal', label: 'x' })).toEqual({
      type: 'internal',
      slug: '',
      label: 'x',
    })
  })

  it('external with missing url coerces to empty', () => {
    expect(normalizeLinkValue({ type: 'external', label: 'x' })).toEqual({
      type: 'external',
      url: '',
      label: 'x',
    })
  })

  it('email passes through', () => {
    const v: LinkValue = { type: 'email', email: 'a@b.test', label: 'Mail' }
    expect(normalizeLinkValue(v)).toEqual(v)
  })

  it('phone passes through', () => {
    const v: LinkValue = { type: 'phone', phone: '+1 555', label: 'Call' }
    expect(normalizeLinkValue(v)).toEqual(v)
  })

  it('email with missing email coerces to empty', () => {
    expect(normalizeLinkValue({ type: 'email', label: 'x' })).toEqual({
      type: 'email',
      email: '',
      label: 'x',
    })
  })

  it('phone with missing phone coerces to empty', () => {
    expect(normalizeLinkValue({ type: 'phone', label: 'x' })).toEqual({
      type: 'phone',
      phone: '',
      label: 'x',
    })
  })
})

describe('normalizeLinkValue — garbage', () => {
  it('null becomes a blank internal link', () => {
    expect(normalizeLinkValue(null)).toEqual({ type: 'internal', slug: '', label: '' })
  })

  it('undefined becomes a blank internal link', () => {
    expect(normalizeLinkValue(undefined)).toEqual({
      type: 'internal',
      slug: '',
      label: '',
    })
  })

  it('a primitive becomes a blank internal link', () => {
    expect(normalizeLinkValue(42)).toEqual({ type: 'internal', slug: '', label: '' })
    expect(normalizeLinkValue('https://x.test')).toEqual({
      type: 'internal',
      slug: '',
      label: '',
    })
  })

  it('an object with no recognisable shape becomes a blank internal link', () => {
    expect(normalizeLinkValue({ foo: 'bar' })).toEqual({
      type: 'internal',
      slug: '',
      label: '',
    })
  })

  it('an unrecognised `type` discriminator falls through to old-shape detection', () => {
    // The function tries old-shape detection on `href` after `type`
    // failed to match — this is intentional, so a record with an
    // unknown type but a usable href still produces a sensible link.
    expect(normalizeLinkValue({ type: 'mystery', href: '/about', label: 'x' })).toEqual({
      type: 'internal',
      slug: 'about',
      label: 'x',
    })
  })
})
