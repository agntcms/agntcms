import { describe, it, expect } from 'vitest'
import { fieldDiff, type ImageFieldDiff, type StringFieldDiff } from './fieldDiff'
import { TextField, RichTextField, ImageField, ReferenceField } from '../../domain/fields'

describe('fieldDiff — text field', () => {
  const schema = { headline: TextField, body: TextField } as const

  it('returns an empty list when nothing changed', () => {
    const before = { headline: 'hello', body: 'world' }
    const after = { headline: 'hello', body: 'world' }
    expect(fieldDiff(schema, before, after)).toEqual([])
  })

  it('reports a single field diff for a pure-add change', () => {
    const before = { headline: '', body: 'same' }
    const after = { headline: 'new title', body: 'same' }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    expect(entry.kind).toBe('text')
    expect(entry.fieldName).toBe('headline')
    expect(entry.ops).toEqual([{ kind: 'add', text: 'new title' }])
  })

  it('reports a pure-delete change', () => {
    const before = { headline: 'goodbye', body: 'same' }
    const after = { headline: '', body: 'same' }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    expect(entry.ops).toEqual([{ kind: 'remove', text: 'goodbye' }])
  })

  it('reports a mixed add/remove change and round-trips both sides', () => {
    const before = { headline: 'the quick brown fox', body: 'same' }
    const after = { headline: 'the slow brown cat', body: 'same' }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    const beforeRecon = entry.ops
      .filter((o) => o.kind === 'equal' || o.kind === 'remove')
      .map((o) => o.text)
      .join('')
    const afterRecon = entry.ops
      .filter((o) => o.kind === 'equal' || o.kind === 'add')
      .map((o) => o.text)
      .join('')
    expect(beforeRecon).toBe('the quick brown fox')
    expect(afterRecon).toBe('the slow brown cat')
  })

  it('emits entries in schema order, skipping unchanged fields', () => {
    const before = { headline: 'a', body: 'b' }
    const after = { headline: 'x', body: 'y' }
    const entries = fieldDiff(schema, before, after)
    expect(entries.map((e) => e.fieldName)).toEqual(['headline', 'body'])
  })
})

describe('fieldDiff — richText field', () => {
  it('diffs markdown as source, preserving formatting markers', () => {
    const schema = { body: RichTextField } as const
    const before = { body: 'Hello **world** and friends' }
    const after = { body: 'Hello **earth** and friends' }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    expect(entry.kind).toBe('richText')
    // Markdown markers stay with their surrounding word tokens.
    const beforeRecon = entry.ops
      .filter((o) => o.kind === 'equal' || o.kind === 'remove')
      .map((o) => o.text)
      .join('')
    const afterRecon = entry.ops
      .filter((o) => o.kind === 'equal' || o.kind === 'add')
      .map((o) => o.text)
      .join('')
    expect(beforeRecon).toBe('Hello **world** and friends')
    expect(afterRecon).toBe('Hello **earth** and friends')
  })
})

describe('fieldDiff — reference field', () => {
  it('diffs the id/slug string when the value is a plain string', () => {
    const schema = { link: ReferenceField } as const
    const before = { link: 'old-page' }
    const after = { link: 'new-page' }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    expect(entry.kind).toBe('reference')
    expect(entry.fieldName).toBe('link')
  })

  it('accepts the { slug } object shape too (graceful coercion)', () => {
    const schema = { link: ReferenceField } as const
    const before = { link: { slug: 'old-page' } }
    const after = { link: { slug: 'new-page' } }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as StringFieldDiff
    expect(entry.kind).toBe('reference')
    // At least one op must carry the before or after slug text.
    const texts = entry.ops.map((o) => o.text).join('')
    expect(texts).toContain('old-page')
    expect(texts).toContain('new-page')
  })

  it('returns empty when the slugs are equal', () => {
    const schema = { link: ReferenceField } as const
    const before = { link: 'same' }
    const after = { link: 'same' }
    expect(fieldDiff(schema, before, after)).toEqual([])
  })
})

describe('fieldDiff — image field', () => {
  const schema = { hero: ImageField } as const

  it('reports a filename-only change with empty alt ops', () => {
    const before = { hero: { filename: 'a.jpg', alt: 'logo' } }
    const after = { hero: { filename: 'b.jpg', alt: 'logo' } }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as ImageFieldDiff
    expect(entry.kind).toBe('image')
    expect(entry.beforeFilename).toBe('a.jpg')
    expect(entry.afterFilename).toBe('b.jpg')
    expect(entry.filenameOps.length).toBeGreaterThan(0)
    expect(entry.altOps).toEqual([])
  })

  it('reports an alt-only change with empty filename ops', () => {
    const before = { hero: { filename: 'a.jpg', alt: 'old alt' } }
    const after = { hero: { filename: 'a.jpg', alt: 'new alt' } }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as ImageFieldDiff
    expect(entry.filenameOps).toEqual([])
    expect(entry.altOps.length).toBeGreaterThan(0)
    expect(entry.beforeFilename).toBe('a.jpg')
    expect(entry.afterFilename).toBe('a.jpg')
  })

  it('reports both filename and alt changing at once', () => {
    const before = { hero: { filename: 'a.jpg', alt: 'left' } }
    const after = { hero: { filename: 'b.jpg', alt: 'right' } }
    const entries = fieldDiff(schema, before, after)
    expect(entries).toHaveLength(1)
    const entry = entries[0] as ImageFieldDiff
    expect(entry.filenameOps.length).toBeGreaterThan(0)
    expect(entry.altOps.length).toBeGreaterThan(0)
  })

  it('returns empty when the ImageValue is structurally equal', () => {
    const before = { hero: { filename: 'a.jpg', alt: 'x' } }
    const after = { hero: { filename: 'a.jpg', alt: 'x' } }
    expect(fieldDiff(schema, before, after)).toEqual([])
  })
})

describe('fieldDiff — mixed schema', () => {
  it('handles a schema spanning all four kinds', () => {
    const schema = {
      title: TextField,
      body: RichTextField,
      hero: ImageField,
      link: ReferenceField,
    } as const
    const before = {
      title: 'old title',
      body: 'old body',
      hero: { filename: 'a.jpg', alt: 'a' },
      link: 'old',
    }
    const after = {
      title: 'new title',
      body: 'old body', // unchanged
      hero: { filename: 'b.jpg', alt: 'a' }, // filename only
      link: 'new',
    }
    const entries = fieldDiff(schema, before, after)
    // body is unchanged, so three entries expected.
    expect(entries.map((e) => e.fieldName)).toEqual(['title', 'hero', 'link'])
    const titleEntry = entries.find((e) => e.fieldName === 'title')! as StringFieldDiff
    expect(titleEntry.kind).toBe('text')
    const heroEntry = entries.find((e) => e.fieldName === 'hero')! as ImageFieldDiff
    expect(heroEntry.kind).toBe('image')
    expect(heroEntry.altOps).toEqual([])
  })

  it('skips data keys not present in the schema', () => {
    const schema = { title: TextField } as const
    const before = { title: 'same', extra: 'ignored-before' }
    const after = { title: 'same', extra: 'ignored-after' }
    expect(fieldDiff(schema, before, after)).toEqual([])
  })
})
