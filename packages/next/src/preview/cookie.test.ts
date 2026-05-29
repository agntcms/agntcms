import { describe, expect, it } from 'vitest'

import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_COOKIE_ON_VALUE,
  previewModeFromCookieValue,
} from './cookie'

describe('previewModeFromCookieValue', () => {
  it('returns "preview" when the value is exactly the on-value', () => {
    expect(previewModeFromCookieValue(PREVIEW_COOKIE_ON_VALUE)).toBe('preview')
    expect(previewModeFromCookieValue('1')).toBe('preview')
  })

  it('returns "published" when the cookie is absent', () => {
    expect(previewModeFromCookieValue(undefined)).toBe('published')
  })

  it('returns "published" for an empty value', () => {
    expect(previewModeFromCookieValue('')).toBe('published')
  })

  it('returns "published" for any other value', () => {
    expect(previewModeFromCookieValue('0')).toBe('published')
    expect(previewModeFromCookieValue('true')).toBe('published')
    expect(previewModeFromCookieValue('preview')).toBe('published')
  })
})

describe('PREVIEW_COOKIE_NAME', () => {
  it('is the agntcms preview cookie name (not Next draftMode)', () => {
    expect(PREVIEW_COOKIE_NAME).toBe('__agntcms_preview')
  })
})
