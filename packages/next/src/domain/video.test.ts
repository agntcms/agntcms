// Pure-function tests for `parseVideoUrl`. The function operates on
// strings only (no React, no DOM), so it runs cleanly in vitest's
// node environment.

import { describe, it, expect } from 'vitest'
import { parseVideoUrl } from './video'

describe('parseVideoUrl — YouTube', () => {
  it('parses youtube.com/watch?v=ID', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses youtu.be/ID short form', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses youtube.com/shorts/ID', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses youtube.com/embed/ID (already-embed URL)', () => {
    expect(parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('parses m.youtube.com mobile URLs', () => {
    expect(parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
  })

  it('strips the www prefix consistently', () => {
    // Bare youtube.com (no www) must produce the same result as www.youtube.com.
    expect(parseVideoUrl('https://youtube.com/watch?v=abc123')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/abc123',
    })
  })
})

describe('parseVideoUrl — Vimeo', () => {
  it('parses vimeo.com/ID', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    })
  })

  it('parses player.vimeo.com/video/ID', () => {
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    })
  })

  it('returns unknown for vimeo.com paths without a numeric id', () => {
    // vimeo.com/staffpicks etc. — the v1 parser only handles direct
    // numeric ids, deliberately. A staff-pick URL is not a valid embed
    // target without resolving server-side.
    expect(parseVideoUrl('https://vimeo.com/staffpicks')).toEqual({
      provider: 'unknown',
      embedUrl: null,
    })
  })
})

describe('parseVideoUrl — Wistia', () => {
  it('parses wistia.com/medias/ID', () => {
    expect(parseVideoUrl('https://example.wistia.com/medias/abc12345')).toEqual({
      provider: 'wistia',
      embedUrl: 'https://fast.wistia.net/embed/iframe/abc12345',
    })
  })

  it('parses fast.wistia.net/embed/iframe/ID', () => {
    expect(parseVideoUrl('https://fast.wistia.net/embed/iframe/abc12345')).toEqual({
      provider: 'wistia',
      embedUrl: 'https://fast.wistia.net/embed/iframe/abc12345',
    })
  })
})

describe('parseVideoUrl — Loom', () => {
  it('parses loom.com/share/ID', () => {
    expect(parseVideoUrl('https://www.loom.com/share/abc123def456')).toEqual({
      provider: 'loom',
      embedUrl: 'https://www.loom.com/embed/abc123def456',
    })
  })

  it('parses loom.com/embed/ID (already-embed URL)', () => {
    expect(parseVideoUrl('https://www.loom.com/embed/abc123def456')).toEqual({
      provider: 'loom',
      embedUrl: 'https://www.loom.com/embed/abc123def456',
    })
  })
})

describe('parseVideoUrl — unknown / malformed', () => {
  it('returns unknown for the empty string', () => {
    expect(parseVideoUrl('')).toEqual({ provider: 'unknown', embedUrl: null })
  })

  it('returns unknown for a malformed URL', () => {
    // The URL constructor throws on this; the catch path produces unknown.
    expect(parseVideoUrl('not a url')).toEqual({ provider: 'unknown', embedUrl: null })
  })

  it('returns unknown for an unrecognised host', () => {
    expect(parseVideoUrl('https://example.com/video/123')).toEqual({
      provider: 'unknown',
      embedUrl: null,
    })
  })

  it('returns unknown for youtube.com without a video id', () => {
    // youtube.com/feed/trending has no `v` query and no embed/shorts path —
    // the parser treats it as unknown rather than guessing.
    expect(parseVideoUrl('https://www.youtube.com/feed/trending')).toEqual({
      provider: 'unknown',
      embedUrl: null,
    })
  })

  it('returns unknown for youtu.be with empty path', () => {
    expect(parseVideoUrl('https://youtu.be/')).toEqual({
      provider: 'unknown',
      embedUrl: null,
    })
  })
})
