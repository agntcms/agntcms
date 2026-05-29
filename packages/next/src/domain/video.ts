// Video provider detection — pure URL parsing for embedded video fields.
//
// Lifted from `template/agntcms/sections/Video/component.tsx` so the
// `<EditableVideo>` widget and any rendered iframe (section-level or
// modal-level preview) share one source of truth for "what host is this
// URL, and what is the safe embed URL?".
//
// Lives in `domain/` because:
//   - the function is pure (no React, no DOM, no fetch),
//   - it carries no domain TYPES — it operates on strings,
//   - both `react/` and (eventually) section-level template code need it,
//     and `react/` is allowed to import from `domain/` per invariant 2.
//
// This module is INTERNAL to the package: it is not re-exported from any
// public subpath barrel. Section authors who want the same detection in
// their own components are expected to write or copy a local helper —
// keeping the parser internal lets us refine it (e.g. provider-specific
// aspect-ratio detection, oEmbed) without committing to a public API.

/**
 * Result of parsing a raw video URL.
 *
 * `embedUrl` is null when the URL is empty, malformed, or points at a
 * host this v1 implementation does not recognise. Callers render a
 * placeholder in that case rather than emit a broken iframe.
 */
export type ParsedVideo =
  | { readonly provider: 'youtube' | 'vimeo' | 'wistia' | 'loom'; readonly embedUrl: string }
  | { readonly provider: 'unknown'; readonly embedUrl: null }

/**
 * Detect the hosting provider of a raw video URL and return a safe embed
 * URL for an `<iframe src>`. Pure, defensive against malformed input.
 *
 * Recognised hosts (v1):
 *   - YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
 *              youtube.com/shorts/ID, m.youtube.com/watch?v=ID
 *   - Vimeo:   vimeo.com/ID, player.vimeo.com/video/ID
 *   - Wistia:  *.wistia.com/medias/ID, fast.wistia.net/embed/iframe/ID
 *   - Loom:    loom.com/share/ID, loom.com/embed/ID
 *
 * Anything else (and any URL the `URL` constructor rejects) returns
 * `{ provider: 'unknown', embedUrl: null }`.
 */
export function parseVideoUrl(raw: string): ParsedVideo {
  if (!raw) return { provider: 'unknown', embedUrl: null }

  // URL constructor throws on malformed input; catch and return unknown
  // so a typing-in-progress URL renders an "unsupported" hint rather
  // than crashing the editor.
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { provider: 'unknown', embedUrl: null }
  }

  const host = u.hostname.replace(/^www\./, '')

  // YouTube ----------------------------------------------------------------
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const v = u.searchParams.get('v')
    if (v !== null && v !== '') {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(v)}`,
      }
    }
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)
    if (m && m[1]) {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${m[1]}`,
      }
    }
  }
  if (host === 'youtu.be') {
    const id = u.pathname.replace(/^\//, '')
    if (id !== '') {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}`,
      }
    }
  }

  // Vimeo ------------------------------------------------------------------
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/)
    if (m && m[1]) {
      return {
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${m[1]}`,
      }
    }
  }
  if (host === 'player.vimeo.com') {
    const m = u.pathname.match(/^\/video\/(\d+)/)
    if (m && m[1]) {
      return {
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${m[1]}`,
      }
    }
  }

  // Wistia -----------------------------------------------------------------
  if (host.endsWith('wistia.com') || host.endsWith('wistia.net')) {
    const m = u.pathname.match(/(?:medias|embed\/iframe)\/([\w-]+)/)
    if (m && m[1]) {
      return {
        provider: 'wistia',
        embedUrl: `https://fast.wistia.net/embed/iframe/${m[1]}`,
      }
    }
  }

  // Loom -------------------------------------------------------------------
  if (host === 'loom.com') {
    const m = u.pathname.match(/^\/(?:share|embed)\/([\w-]+)/)
    if (m && m[1]) {
      return {
        provider: 'loom',
        embedUrl: `https://www.loom.com/embed/${m[1]}`,
      }
    }
  }

  return { provider: 'unknown', embedUrl: null }
}
