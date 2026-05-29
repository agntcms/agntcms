import { describe, it, expect } from 'vitest'
import {
  deriveFolderContents,
  filterCreatableSectionTypes,
  formatTimestampLabel,
  isGlobalDeletable,
  isGlobalDeleteVisible,
  localName,
  partitionGlobalsBySystem,
  sortGlobals,
  sortPages,
  wrapGlobalData,
} from './AdminModal'

// ---------------------------------------------------------------------------
// Helper to build a minimal PageEntry for testing. Only `slug` matters for
// folder derivation; the other fields are fixed stubs.
// ---------------------------------------------------------------------------

function page(slug: string) {
  return { slug, hasPublished: true, hasDraft: false, updatedAt: '' } as const
}

// ---------------------------------------------------------------------------
// deriveFolderContents
// ---------------------------------------------------------------------------

describe('deriveFolderContents', () => {
  const pages = [
    page('home'),
    page('about'),
    page('blog/post-1'),
    page('blog/post-2'),
    page('blog/tutorials/intro'),
    page('blog/tutorials/advanced'),
    page('docs/api'),
  ]

  it('returns folders and pages at root level', () => {
    const items = deriveFolderContents(pages, '')

    // Folders first (alphabetical), then pages (alphabetical)
    expect(items).toEqual([
      { kind: 'folder', name: 'blog', path: 'blog', count: 4 },
      { kind: 'folder', name: 'docs', path: 'docs', count: 1 },
      { kind: 'page', entry: page('about') },
      { kind: 'page', entry: page('home') },
    ])
  })

  it('returns folders and pages inside "blog"', () => {
    const items = deriveFolderContents(pages, 'blog')

    expect(items).toEqual([
      { kind: 'folder', name: 'tutorials', path: 'blog/tutorials', count: 2 },
      { kind: 'page', entry: page('blog/post-1') },
      { kind: 'page', entry: page('blog/post-2') },
    ])
  })

  it('returns only pages inside "blog/tutorials"', () => {
    const items = deriveFolderContents(pages, 'blog/tutorials')

    expect(items).toEqual([
      { kind: 'page', entry: page('blog/tutorials/advanced') },
      { kind: 'page', entry: page('blog/tutorials/intro') },
    ])
  })

  it('returns empty array when navigating into a non-existent folder', () => {
    const items = deriveFolderContents(pages, 'nonexistent')
    expect(items).toEqual([])
  })

  it('handles an empty page list', () => {
    const items = deriveFolderContents([], '')
    expect(items).toEqual([])
  })

  it('counts all nested pages inside a folder (recursively)', () => {
    // "blog" contains post-1, post-2, tutorials/intro, tutorials/advanced.
    // The count reflects how many pages have a "/" after the folder name in
    // their remaining path -- i.e. all pages nested at any depth below the
    // folder. This is the total count used for the badge display.
    const items = deriveFolderContents(pages, '')
    const blogFolder = items.find(
      (i) => i.kind === 'folder' && i.name === 'blog',
    )
    expect(blogFolder).toBeDefined()
    if (blogFolder && blogFolder.kind === 'folder') {
      expect(blogFolder.count).toBe(4)
    }
  })

  it('does not include pages with a slug that is a prefix of the folder path', () => {
    // A page "blog" at root should appear as a page, not as part of "blog/" folder
    const pagesWithBlogRoot = [...pages, page('blog')]
    const items = deriveFolderContents(pagesWithBlogRoot, '')

    const blogPages = items.filter(
      (i) => i.kind === 'page' && i.entry.slug === 'blog',
    )
    expect(blogPages).toHaveLength(1)

    const blogFolders = items.filter(
      (i) => i.kind === 'folder' && i.name === 'blog',
    )
    expect(blogFolders).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// localName
// ---------------------------------------------------------------------------

describe('localName', () => {
  it('returns the full slug at root level', () => {
    expect(localName('home', '')).toBe('home')
  })

  it('strips the current path prefix', () => {
    expect(localName('blog/post-1', 'blog')).toBe('post-1')
  })

  it('strips a deep current path prefix', () => {
    expect(localName('blog/tutorials/intro', 'blog/tutorials')).toBe('intro')
  })

  it('returns the slug unchanged if it does not match the prefix', () => {
    expect(localName('about', 'blog')).toBe('about')
  })
})

// ---------------------------------------------------------------------------
// wrapGlobalData — bridge from raw global data to PreviewField-shaped values
// that EditableText / EditableImage recognize as preview mode.
// ---------------------------------------------------------------------------

describe('wrapGlobalData', () => {
  it('wraps every field value with the __agntcmsPreview brand', () => {
    const wrapped = wrapGlobalData('header', { title: 'Hello', count: 3 })
    expect(Object.keys(wrapped).sort()).toEqual(['count', 'title'])
    for (const key of Object.keys(wrapped)) {
      const field = wrapped[key] as Record<string, unknown>
      expect(field['__agntcmsPreview']).toBe(true)
    }
  })

  it('preserves field values verbatim on the wrapped .value property', () => {
    const image = { filename: 'x.png', alt: 'x' }
    const wrapped = wrapGlobalData('header', {
      title: 'Hello',
      image,
      count: 42,
    })
    expect((wrapped['title'] as { value: unknown }).value).toBe('Hello')
    expect((wrapped['image'] as { value: unknown }).value).toBe(image)
    expect((wrapped['count'] as { value: unknown }).value).toBe(42)
  })

  it('sets origin.fieldPath to the field key and origin.sectionId to the global name', () => {
    const wrapped = wrapGlobalData('footer', { copyright: '2026' })
    const field = wrapped['copyright'] as {
      origin: { fieldPath: string; sectionId: string; pageSlug: string; source: string; revision: string }
    }
    expect(field.origin.fieldPath).toBe('copyright')
    expect(field.origin.sectionId).toBe('footer')
    // pageSlug uses a sentinel since globals are not pages.
    expect(field.origin.pageSlug).toBe('__global__:footer')
    expect(field.origin.source).toBe('draft')
    expect(field.origin.revision).toBe('footer')
  })

  it('returns an empty object for empty data', () => {
    expect(wrapGlobalData('header', {})).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// sortPages
// ---------------------------------------------------------------------------

function pageWith(
  slug: string,
  opts: { published?: boolean; draft?: boolean; updatedAt?: string } = {},
) {
  return {
    slug,
    hasPublished: opts.published ?? false,
    hasDraft: opts.draft ?? false,
    updatedAt: opts.updatedAt ?? '',
  } as const
}

describe('sortPages', () => {
  it('sorts by name ascending using local names at root', () => {
    const pages = [pageWith('charlie'), pageWith('alpha'), pageWith('bravo')]
    const sorted = sortPages(pages, { column: 'name', direction: 'asc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('sorts by name descending', () => {
    const pages = [pageWith('alpha'), pageWith('bravo'), pageWith('charlie')]
    const sorted = sortPages(pages, { column: 'name', direction: 'desc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['charlie', 'bravo', 'alpha'])
  })

  it('uses local names for sorting inside a folder', () => {
    // Inside "blog", "blog/zeta" should sort as "zeta" and "blog/alpha" as "alpha"
    const pages = [pageWith('blog/zeta'), pageWith('blog/alpha')]
    const sorted = sortPages(pages, { column: 'name', direction: 'asc' }, 'blog')
    expect(sorted.map((p) => p.slug)).toEqual(['blog/alpha', 'blog/zeta'])
  })

  it('sorts by status rank ascending: neither < draft < published < both', () => {
    const pages = [
      pageWith('both', { draft: true, published: true }),
      pageWith('neither'),
      pageWith('pub', { published: true }),
      pageWith('drft', { draft: true }),
    ]
    const sorted = sortPages(pages, { column: 'status', direction: 'asc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['neither', 'drft', 'pub', 'both'])
  })

  it('sorts by status rank descending', () => {
    const pages = [
      pageWith('neither'),
      pageWith('both', { draft: true, published: true }),
      pageWith('drft', { draft: true }),
    ]
    const sorted = sortPages(pages, { column: 'status', direction: 'desc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['both', 'drft', 'neither'])
  })

  it('sorts by updatedAt ascending (ISO string compare)', () => {
    const pages = [
      pageWith('c', { updatedAt: '2025-03-01T00:00:00Z' }),
      pageWith('a', { updatedAt: '2025-01-01T00:00:00Z' }),
      pageWith('b', { updatedAt: '2025-02-01T00:00:00Z' }),
    ]
    const sorted = sortPages(pages, { column: 'updated', direction: 'asc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['a', 'b', 'c'])
  })

  it('breaks ties by slug for deterministic order', () => {
    // All same status rank (neither), so slug alphabetical breaks the tie
    const pages = [pageWith('zeta'), pageWith('alpha'), pageWith('mu')]
    const sorted = sortPages(pages, { column: 'status', direction: 'asc' }, '')
    expect(sorted.map((p) => p.slug)).toEqual(['alpha', 'mu', 'zeta'])
  })

  it('does not mutate the input array', () => {
    const pages = [pageWith('b'), pageWith('a')]
    const snapshot = pages.map((p) => p.slug)
    sortPages(pages, { column: 'name', direction: 'asc' }, '')
    expect(pages.map((p) => p.slug)).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// sortGlobals
// ---------------------------------------------------------------------------

function g(name: string, type: string, updatedAt = '') {
  return { name, type, updatedAt } as const
}

describe('sortGlobals', () => {
  it('sorts by name ascending', () => {
    const globals = [g('charlie', 'header'), g('alpha', 'footer'), g('bravo', 'nav')]
    const sorted = sortGlobals(globals, { column: 'name', direction: 'asc' })
    expect(sorted.map((x) => x.name)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('sorts by type ascending with name as tiebreaker', () => {
    const globals = [g('b', 'alpha'), g('a', 'alpha'), g('c', 'beta')]
    const sorted = sortGlobals(globals, { column: 'type', direction: 'asc' })
    expect(sorted.map((x) => x.name)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by updatedAt descending', () => {
    const globals = [
      g('a', 't', '2025-01-01T00:00:00Z'),
      g('b', 't', '2025-03-01T00:00:00Z'),
      g('c', 't', '2025-02-01T00:00:00Z'),
    ]
    const sorted = sortGlobals(globals, { column: 'updated', direction: 'desc' })
    expect(sorted.map((x) => x.name)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const globals = [g('b', 't'), g('a', 't')]
    const snapshot = globals.map((x) => x.name)
    sortGlobals(globals, { column: 'name', direction: 'asc' })
    expect(globals.map((x) => x.name)).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// formatTimestampLabel — converts a history filename stem back into a
// readable local date/time. History filenames use '-' where ':' would be,
// so the raw stem doesn't parse as a Date.
// ---------------------------------------------------------------------------

describe('formatTimestampLabel', () => {
  it('returns a readable label for a valid history filename', () => {
    // The exact string depends on the test runner's locale / timezone,
    // so assert only that the function produced SOMETHING (not the raw
    // unparseable stem) and that it contains the expected year.
    const out = formatTimestampLabel('2026-04-12T16-00-00.000Z')
    expect(out).not.toBe('2026-04-12T16-00-00.000Z')
    expect(out).toContain('2026')
  })

  it('falls back to the raw timestamp when it cannot be parsed', () => {
    expect(formatTimestampLabel('not-a-timestamp')).toBe('not-a-timestamp')
  })
})

// (isCreateWithAgentDisabled / isDisabledOnlyByBridge / BridgeStatus
// removed in v0.5 — the agent channel was dropped and page creation no
// longer goes through the agent. See ARCHITECTURE.md sections 6 and 7.)

// ---------------------------------------------------------------------------
// partitionGlobalsBySystem — splits a flat globals list into user and
// system buckets. The Globals tab uses this to render a separate
// "Settings" group BELOW user globals; the test asserts the partitioning
// behaviour (rendering is exercised through e2e/manual since AdminModal
// uses React hooks and cannot mount in the node test env).
// ---------------------------------------------------------------------------

describe('isGlobalDeletable', () => {
  // The (×) delete button in the Globals tab is rendered iff this helper
  // returns true. Every row is deletable now — including system-flagged
  // rows — because the server-side handler no longer rejects deletion of
  // a system global. The helper is kept as the single source of truth so
  // future per-row policy lands in one place. See ARCHITECTURE.md §3
  // "Section registration".
  it('returns true for entries without a system flag', () => {
    expect(isGlobalDeletable({})).toBe(true)
  })

  it('returns true for entries with system: false', () => {
    expect(isGlobalDeletable({ system: false })).toBe(true)
  })

  it('returns true for entries with system: true (system globals are now deletable)', () => {
    expect(isGlobalDeletable({ system: true })).toBe(true)
  })
})

describe('isGlobalDeleteVisible', () => {
  // The (×) Delete button is rendered iff this helper returns true. The
  // dispatch ("Finding 1 — Delete on draft-only rows is misleading")
  // requires that draft-only rows (hasPublished: false, hasDraft: true)
  // do NOT show Delete — Discard is the right action there, and Delete
  // would 404 on the missing live file. Published rows (or rows where
  // the flag is absent, for backward compat) keep the affordance.
  it('hides Delete for a draft-only row (hasPublished: false)', () => {
    expect(isGlobalDeleteVisible({ hasPublished: false })).toBe(false)
  })

  it('hides Delete for a draft-only system row too', () => {
    // System flag is independent of the draft-only gate; both checks apply.
    expect(
      isGlobalDeleteVisible({ system: true, hasPublished: false }),
    ).toBe(false)
  })

  it('shows Delete for a published row', () => {
    expect(isGlobalDeleteVisible({ hasPublished: true })).toBe(true)
  })

  it('shows Delete for a published system row', () => {
    expect(
      isGlobalDeleteVisible({ system: true, hasPublished: true }),
    ).toBe(true)
  })

  it('shows Delete when hasPublished is absent (backward compat)', () => {
    // Older list responses (pre-v0.2 client composition) didn't carry the
    // hasPublished flag. Treating absent as true keeps those callers
    // working — they only ever returned rows that did have a published
    // copy on disk in the first place.
    expect(isGlobalDeleteVisible({})).toBe(true)
  })
})

describe('partitionGlobalsBySystem', () => {
  // Minimal GlobalEntry stubs. The fields we don't care about (updatedAt)
  // get fixed values so we can compare entry references by name only.
  const g = (name: string, system?: boolean) => ({
    name,
    type: 'X',
    updatedAt: '',
    ...(system === undefined ? {} : { system }),
  } as const)

  it('returns two empty groups when input is empty', () => {
    const { user, system } = partitionGlobalsBySystem([])
    expect(user).toEqual([])
    expect(system).toEqual([])
  })

  it('puts entries without a system flag into user', () => {
    const { user, system } = partitionGlobalsBySystem([g('a'), g('b')])
    expect(user.map((e) => e.name)).toEqual(['a', 'b'])
    expect(system).toEqual([])
  })

  it('treats system: false as user (not system)', () => {
    const { user, system } = partitionGlobalsBySystem([g('a', false)])
    expect(user.map((e) => e.name)).toEqual(['a'])
    expect(system).toEqual([])
  })

  it('puts entries with system: true into the system group', () => {
    const { user, system } = partitionGlobalsBySystem([
      g('header'),
      g('site-meta', true),
      g('footer'),
    ])
    expect(user.map((e) => e.name)).toEqual(['header', 'footer'])
    expect(system.map((e) => e.name)).toEqual(['site-meta'])
  })

  it('preserves input order within each group', () => {
    // Order matters because each group is sorted in the caller; the
    // partition itself must not reorder.
    const { user, system } = partitionGlobalsBySystem([
      g('z'),
      g('site-meta', true),
      g('a'),
      g('search-config', true),
    ])
    expect(user.map((e) => e.name)).toEqual(['z', 'a'])
    expect(system.map((e) => e.name)).toEqual(['site-meta', 'search-config'])
  })
})

describe('filterCreatableSectionTypes', () => {
  // The datalist for "create new global" must not offer a type that the
  // save handler will reject with `system_global_cannot_be_created`. The
  // helper is pure so it can be exercised here without mounting the modal
  // (AdminModal itself can't render in the node test env — see header).
  it('returns all types unchanged when no systemTypes are provided', () => {
    expect(filterCreatableSectionTypes(['Hero', 'Footer'], [])).toEqual([
      'Hero',
      'Footer',
    ])
  })

  it('removes system-flagged types from the list', () => {
    expect(
      filterCreatableSectionTypes(
        ['Hero', 'SiteMeta', 'Footer'],
        ['SiteMeta'],
      ),
    ).toEqual(['Hero', 'Footer'])
  })

  it('is a no-op when systemTypes contains no matches', () => {
    // A handler that knows about a system type the current page has no
    // section for should still leave the autocomplete intact for the
    // remaining user types.
    expect(
      filterCreatableSectionTypes(['Hero'], ['SiteMeta']),
    ).toEqual(['Hero'])
  })
})
