import { describe, it, expect } from 'vitest'
import {
  validateEmail,
  validateExternalUrl,
  validateInternalSlug,
  validatePhone,
} from './linkValidation'

// The two validators replace the old single `validateLink` helper that
// checked the legacy `{ href, label, external? }` shape. The new
// `LinkValue` is a discriminated union so each branch has its own
// validator. Both validators treat the empty string as "incomplete,
// not invalid" — the editor's UX flags the empty state separately
// (placeholder dropdown option, empty URL input) without polluting
// the validator with UX concerns.

describe('validateInternalSlug — accepts', () => {
  it('empty string (incomplete, not invalid)', () => {
    expect(validateInternalSlug('')).toBeNull()
  })

  it('home', () => {
    expect(validateInternalSlug('home')).toBeNull()
  })

  it('single-segment lowercase slug', () => {
    expect(validateInternalSlug('about')).toBeNull()
  })

  it('hyphenated slug', () => {
    expect(validateInternalSlug('contact-us')).toBeNull()
  })

  it('multi-segment slug', () => {
    expect(validateInternalSlug('blog/welcome')).toBeNull()
  })

  it('slug with digits', () => {
    expect(validateInternalSlug('blog/post-2025-01-01')).toBeNull()
  })
})

describe('validateInternalSlug — rejects', () => {
  it('http:// prefix', () => {
    expect(validateInternalSlug('http://example.com')).toBe(
      'slug must not include a protocol',
    )
  })

  it('https:// prefix', () => {
    expect(validateInternalSlug('https://example.com')).toBe(
      'slug must not include a protocol',
    )
  })

  it('protocol-relative //', () => {
    expect(validateInternalSlug('//evil.test')).toBe('slug must not start with //')
  })

  it('leading slash', () => {
    expect(validateInternalSlug('/about')).toBe('slug must not start with /')
  })

  it('trailing slash', () => {
    expect(validateInternalSlug('about/')).toBe('slug must not end with /')
  })

  it('double slash inside', () => {
    expect(validateInternalSlug('blog//welcome')).toBe('slug must not contain //')
  })

  it('parent traversal', () => {
    expect(validateInternalSlug('blog/../secret')).toBe('slug must not contain ..')
  })

  it('uppercase letters', () => {
    expect(validateInternalSlug('Blog')).toBe(
      'slug must use lowercase letters, digits, hyphens, and slashes only',
    )
  })

  it('special characters', () => {
    expect(validateInternalSlug('blog?x=1')).toBe(
      'slug must use lowercase letters, digits, hyphens, and slashes only',
    )
  })

  it('whitespace', () => {
    expect(validateInternalSlug('blog welcome')).toBe(
      'slug must use lowercase letters, digits, hyphens, and slashes only',
    )
  })
})

describe('validateExternalUrl — accepts', () => {
  it('empty string (incomplete, not invalid)', () => {
    expect(validateExternalUrl('')).toBeNull()
  })

  it('http URL', () => {
    expect(validateExternalUrl('http://example.test/')).toBeNull()
  })

  it('https URL', () => {
    expect(validateExternalUrl('https://example.test/path')).toBeNull()
  })

  it('https URL with query and fragment', () => {
    expect(validateExternalUrl('https://example.test/path?x=1#frag')).toBeNull()
  })
})

describe('validateExternalUrl — rejects', () => {
  // The protocol allow-list is the security floor: the editor must not
  // let a paste of `javascript:alert(1)` survive into a `LinkValue`
  // where it would render as `<a href="javascript:...">`.
  it.each([
    ['javascript:alert(1)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
    ['mailto:a@b.test'],
    ['tel:+15551234'],
    ['ftp://example.test/'],
    ['vbscript:msgbox("x")'],
    ['ws://example.test/'],
    ['chrome://settings'],
    ['about:blank'],
  ])('rejects %s with the http(s) message', (url) => {
    expect(validateExternalUrl(url)).toBe(
      'External link must start with http:// or https://',
    )
  })

  it('rejects protocol-relative //evil.test', () => {
    expect(validateExternalUrl('//evil.test')).toBe(
      'External link must start with http:// or https://',
    )
  })

  it('rejects bare-string non-URL', () => {
    expect(validateExternalUrl('just a string')).toBe(
      'External link must start with http:// or https://',
    )
  })

  it('rejects site-relative path (belongs in the internal branch)', () => {
    expect(validateExternalUrl('/about')).toBe(
      'External link must start with http:// or https://',
    )
  })
})

describe('validateEmail — accepts', () => {
  it('empty string (incomplete, not invalid)', () => {
    expect(validateEmail('')).toBeNull()
  })

  it('a typical address', () => {
    expect(validateEmail('foo@example.com')).toBeNull()
  })

  it('addresses with subdomains', () => {
    expect(validateEmail('foo@mail.example.co.uk')).toBeNull()
  })

  it('addresses with + tags', () => {
    expect(validateEmail('foo+bar@example.com')).toBeNull()
  })
})

describe('validateEmail — rejects', () => {
  it.each([
    ['no @ sign'],
    ['foo@'],
    ['@example.com'],
    ['foo@example'],
    ['foo bar@example.com'],
    ['foo@bar baz.com'],
    ['foo@@bar.com'],
  ])('rejects %s', (email) => {
    expect(validateEmail(email)).toBe('Invalid email address')
  })
})

describe('validatePhone — accepts', () => {
  it('empty string (incomplete, not invalid)', () => {
    expect(validatePhone('')).toBeNull()
  })

  it('a 7-digit local number', () => {
    expect(validatePhone('1234567')).toBeNull()
  })

  it('an international number with + and formatting', () => {
    expect(validatePhone('+1 (555) 123-4567')).toBeNull()
  })

  it('a UK number with spaces', () => {
    expect(validatePhone('+44 20 7946 0958')).toBeNull()
  })
})

describe('validatePhone — rejects', () => {
  it('rejects fewer than 7 digits after stripping', () => {
    expect(validatePhone('123')).toBe('Phone number is too short')
    expect(validatePhone('555-12')).toBe('Phone number is too short')
  })

  it('rejects strings with no digits at all', () => {
    expect(validatePhone('not a phone')).toBe('Phone number is too short')
  })

  it('rejects 6 digits even with formatting', () => {
    // Formatting characters do not count toward the 7-digit floor.
    // The string carries 6 digits total (parens, spaces, hyphens are
    // stripped before counting) so this is below the 7-digit minimum.
    expect(validatePhone('(12) 34-56')).toBe('Phone number is too short')
  })
})
