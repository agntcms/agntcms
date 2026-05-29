import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ImageValue, Page, PageSeo, PageSummary, Section } from './index'
import { assertValidPage } from './index'

// Type-level checks for the Page / Section composition. These lock the
// decisions documented in section.ts (generic carrier) and page.ts (thin
// wrapper over ordered sections) so a drive-by refactor cannot quietly
// change the public shape.

describe('Page / Section composition', () => {
  it('Page.sections is a readonly array of the open Section carrier', () => {
    expectTypeOf<Page['sections']>().toEqualTypeOf<readonly Section[]>()
  })

  it('Page.slug is a string and seo is required with mandatory title and description', () => {
    expectTypeOf<Page['slug']>().toEqualTypeOf<string>()
    // SEO is required on every page (basic-SEO guarantee). Under
    // exactOptionalPropertyTypes, a required prop is NOT `T | undefined`.
    expectTypeOf<Page['seo']>().toEqualTypeOf<PageSeo>()
    // title + description are required strings — no `?` and no `| undefined`.
    expectTypeOf<PageSeo['title']>().toEqualTypeOf<string>()
    expectTypeOf<PageSeo['description']>().toEqualTypeOf<string>()
    // ogImage and canonical are the only optional members.
    expectTypeOf<PageSeo['ogImage']>().toEqualTypeOf<ImageValue | undefined>()
    expectTypeOf<PageSeo['canonical']>().toEqualTypeOf<string | undefined>()
  })

  it('a concrete Section<T, D> is assignable to the open Section', () => {
    type HeroData = { title: string }
    type HeroSection = Section<'Hero', HeroData>
    expectTypeOf<HeroSection>().toMatchTypeOf<Section>()
  })

  it('Section carries id, type and data', () => {
    expectTypeOf<Section>().toHaveProperty('id').toEqualTypeOf<string>()
    expectTypeOf<Section>().toHaveProperty('type').toEqualTypeOf<string>()
    expectTypeOf<Section>().toHaveProperty('data').toEqualTypeOf<unknown>()
  })

  it('Section.globalRef is an optional string', () => {
    // globalRef is optional — a section without it is valid.
    const plain: Section = { id: '1', type: 'Hero', data: {} }
    expectTypeOf(plain.globalRef).toEqualTypeOf<string | undefined>()

    // A section with globalRef is also valid.
    const withRef: Section = { id: '2', type: '', data: {}, globalRef: 'header' }
    expectTypeOf(withRef.globalRef).toEqualTypeOf<string | undefined>()
  })

  // Phase 5 metadata fields — flat optionals, not nested under a namespace.
  it('Page metadata fields (tags, excerpt, coverImage, publishedAt) are all optional', () => {
    // A page with only the required fields (slug + seo + sections) must
    // still be a valid Page — no Phase 5 metadata required. The
    // assignment itself is the test: the file would not compile if any
    // of tags / excerpt / coverImage / publishedAt were required.
    const bare: Page = {
      slug: 'home',
      seo: { title: 'Home', description: 'Home page' },
      sections: [],
    }
    expect(bare.tags).toBeUndefined()
    expect(bare.excerpt).toBeUndefined()
    expect(bare.coverImage).toBeUndefined()
    expect(bare.publishedAt).toBeUndefined()

    // A fully-decorated page is also valid.
    const cover: ImageValue = { filename: 'x.jpg', alt: 'x' }
    const full: Page = {
      slug: 'post/1',
      seo: { title: 'Post 1', description: 'first post' },
      tags: ['post', 'feature'],
      excerpt: 'short summary',
      coverImage: cover,
      publishedAt: '2026-04-27T10:00:00.000Z',
      sections: [],
    }
    expect(full.tags).toEqual(['post', 'feature'])
  })

  it('PageSummary is Page without sections', () => {
    expectTypeOf<PageSummary>().toEqualTypeOf<Omit<Page, 'sections'>>()
    // A PageSummary should NOT carry `sections`.
    expectTypeOf<PageSummary>().not.toHaveProperty('sections')
    // It should carry every other Page field, optional or not.
    expectTypeOf<PageSummary>().toHaveProperty('slug').toEqualTypeOf<string>()
    expectTypeOf<PageSummary>().toHaveProperty('tags')
    expectTypeOf<PageSummary>().toHaveProperty('excerpt')
    expectTypeOf<PageSummary>().toHaveProperty('coverImage')
    expectTypeOf<PageSummary>().toHaveProperty('publishedAt')
  })
})

describe('assertValidPage', () => {
  // Helper that captures the thrown error so individual cases can assert
  // both the throw and the message contents in one go.
  const validBody = {
    slug: 'home',
    seo: { title: 'Home', description: 'Home page' },
    sections: [],
  }

  it('accepts a minimal valid page', () => {
    expect(() => assertValidPage(validBody)).not.toThrow()
  })

  it('accepts a page decorated with optional metadata', () => {
    const full = {
      slug: 'post/1',
      seo: {
        title: 'Post',
        description: 'desc',
        canonical: 'https://example.com/post/1',
      },
      tags: ['post'],
      excerpt: 'short',
      publishedAt: '2026-04-27T10:00:00.000Z',
      sections: [],
    }
    expect(() => assertValidPage(full)).not.toThrow()
  })

  it('rejects null', () => {
    expect(() => assertValidPage(null)).toThrow(/expected an object/)
  })

  it('rejects a missing slug', () => {
    const { slug: _slug, ...noSlug } = validBody
    void _slug
    expect(() => assertValidPage(noSlug)).toThrow(/missing or empty slug/)
  })

  it('rejects a missing seo', () => {
    const { seo: _seo, ...noSeo } = validBody
    void _seo
    expect(() => assertValidPage(noSeo)).toThrow(/seo must be an object/)
  })

  it('rejects a missing seo.title', () => {
    const body = {
      ...validBody,
      seo: { description: 'desc' } as unknown,
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.title must be a non-empty string/,
    )
  })

  it('rejects a missing seo.description', () => {
    const body = {
      ...validBody,
      seo: { title: 'Home' } as unknown,
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.description must be a non-empty string/,
    )
  })

  it('rejects an empty-string seo.title', () => {
    const body = {
      ...validBody,
      seo: { title: '', description: 'desc' },
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.title must be a non-empty string/,
    )
  })

  it('rejects an empty-string seo.description', () => {
    const body = {
      ...validBody,
      seo: { title: 'Home', description: '' },
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.description must be a non-empty string/,
    )
  })

  it('rejects a whitespace-only seo.title', () => {
    const body = {
      ...validBody,
      seo: { title: '   ', description: 'desc' },
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.title must be a non-empty string/,
    )
  })

  it('rejects a whitespace-only seo.description', () => {
    const body = {
      ...validBody,
      seo: { title: 'Home', description: '\t\n ' },
    }
    expect(() => assertValidPage(body)).toThrow(
      /seo\.description must be a non-empty string/,
    )
  })

  it('rejects a non-array sections', () => {
    const body = { ...validBody, sections: 'oops' }
    expect(() => assertValidPage(body)).toThrow(/sections must be an array/)
  })

  it('includes the slug in the error message when seo is malformed', () => {
    const body = { slug: 'about', seo: null, sections: [] }
    expect(() => assertValidPage(body)).toThrow(/"about"/)
  })

  // `seo.canonical` is optional, but when present it must be a non-empty
  // string. Otherwise a stored `canonical: ''` short-circuits the
  // template's `?? derived` fallback and emits `<link rel="canonical"
  // href="">`, which is worse than no tag at all.
  describe('seo.canonical (optional, presence-conditional)', () => {
    it('accepts a page with no canonical', () => {
      expect(() => assertValidPage(validBody)).not.toThrow()
    })

    it('accepts a page with a valid canonical URL', () => {
      const body = {
        ...validBody,
        seo: {
          title: 'Home',
          description: 'desc',
          canonical: 'https://example.com/home',
        },
      }
      expect(() => assertValidPage(body)).not.toThrow()
    })

    it('rejects an empty-string canonical', () => {
      const body = {
        ...validBody,
        seo: { title: 'Home', description: 'desc', canonical: '' },
      }
      expect(() => assertValidPage(body)).toThrow(
        /seo\.canonical, when present, must be a non-empty string/,
      )
    })

    it('rejects a whitespace-only canonical', () => {
      const body = {
        ...validBody,
        seo: { title: 'Home', description: 'desc', canonical: '   ' },
      }
      expect(() => assertValidPage(body)).toThrow(
        /seo\.canonical, when present, must be a non-empty string/,
      )
    })

    it('rejects a non-string canonical', () => {
      const body = {
        ...validBody,
        seo: { title: 'Home', description: 'desc', canonical: 42 },
      }
      expect(() => assertValidPage(body)).toThrow(
        /seo\.canonical, when present, must be a non-empty string/,
      )
    })
  })
})
