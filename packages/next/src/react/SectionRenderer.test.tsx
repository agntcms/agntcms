import { describe, it, expect } from 'vitest'
import type { Section } from '../domain/index'
import {
  BooleanField,
  ImageField,
  LinkField,
  NumberField,
  ReferenceField,
  RichTextField,
  TextField,
} from '../domain/fields'
import type { AnySectionDefinition } from '../sections/index'
import { SectionRenderer } from './SectionRenderer'

// Helper to access React element internals in tests without fighting
// React 19's `ReactElement<P = unknown>` default. The shape `{ type, props, key }`
// is stable React public API — we just need TS to let us read the fields.
interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

// Minimal stub component.
function StubHero(props: { title: string; image: string }): React.ReactElement {
  return <h1>{props.title}</h1>
}

function makeDefinition(
  name: string,
  component: (props: never) => unknown,
  defaults: Record<string, unknown> = {},
  schema: Record<string, unknown> = {},
): AnySectionDefinition {
  // Cast through `unknown` because every test fixture below builds the
  // `schema` from real domain field descriptors, but the local
  // `Record<string, unknown>` shape lets each callsite pass either the
  // empty record (existing tests) or a populated one (slot tests) without
  // wrestling with `SectionSchema` type ergonomics.
  const sectionSchema = schema as AnySectionDefinition['schema']
  return { name, schema: sectionSchema, component, defaults }
}

function makeSection(type: string, data: Record<string, unknown>): Section {
  return { id: `s-${type}`, type, data }
}

describe('SectionRenderer', () => {
  const heroDefinition = makeDefinition(
    'Hero',
    StubHero as unknown as (props: never) => unknown,
  )
  const definitions: readonly AnySectionDefinition[] = [heroDefinition]

  it('renders the matching component with section data as props', () => {
    const section = makeSection('Hero', { title: 'Hello', image: '/hero.png' })

    const result = SectionRenderer({ section, definitions })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    expect(el.type).toBe(StubHero)
    expect(el.props).toEqual({ title: 'Hello', image: '/hero.png' })
  })

  it('returns null for unknown section type in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const section = makeSection('NonExistent', {})
      const result = SectionRenderer({ section, definitions })
      expect(result).toBeNull()
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  it('renders error box for unknown section type in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const section = makeSection('NonExistent', {})
      const result = SectionRenderer({ section, definitions })

      expect(result).not.toBeNull()
      const el = asTestElement(result!)
      expect(el.type).toBe('div')
      // The children field for JSX with mixed text/expression content
      // is an array: ["Unknown section type: ", "NonExistent"].
      const children = el.props['children']
      expect(children).toContain('NonExistent')
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  it('fills missing fields from definition.defaults (schema added after content saved)', () => {
    // Regression: content saved before the schema gained a `subtitle` field
    // must still render, with `subtitle` taking the schema default.
    const defWithDefaults = makeDefinition(
      'HeroWithDefaults',
      StubHero as unknown as (props: never) => unknown,
      { title: 'Default title', image: '/default.png', subtitle: 'Default subtitle' },
    )
    const section = makeSection('HeroWithDefaults', { title: 'Actual title', image: '/a.png' })

    const result = SectionRenderer({ section, definitions: [defWithDefaults] })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    // Section data wins over defaults; missing fields fall back to defaults.
    expect(el.props).toEqual({
      title: 'Actual title',
      image: '/a.png',
      subtitle: 'Default subtitle',
    })
  })

  it('wraps missing-field defaults as PreviewField when section.data is in preview mode', () => {
    // Regression: when a schema grows (or a layout switch exposes fields
    // that were never saved), the missing keys came from `definition.defaults`
    // as plain values. `EditableText` saw plain strings and rendered
    // read-only — the user couldn't click to edit. Fix: detect preview mode
    // structurally and synthesize a PreviewField wrapper for every default.
    const defWithDefaults = makeDefinition(
      'Hero',
      StubHero as unknown as (props: never) => unknown,
      {
        title: 'Default title',
        image: '/default.png',
        terminalCommand: 'agntcms up',
      },
    )
    const wrappedTitle = {
      __agntcmsPreview: true,
      value: 'Actual title',
      origin: {
        pageSlug: 'home',
        sectionId: 's-Hero',
        fieldPath: 'title',
        source: 'draft' as const,
        revision: 'abc',
      },
    }
    // Only `title` is in content; `image` and `terminalCommand` are missing.
    const section = makeSection('Hero', { title: wrappedTitle })

    const result = SectionRenderer({ section, definitions: [defWithDefaults] })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)

    // Existing wrapped field passes through untouched.
    expect(el.props['title']).toEqual(wrappedTitle)

    // Missing fields arrive wrapped so EditableText can enter edit mode.
    const image = el.props['image'] as Record<string, unknown>
    expect(image['__agntcmsPreview']).toBe(true)
    expect(image['value']).toBe('/default.png')
    const imageOrigin = image['origin'] as Record<string, unknown>
    expect(imageOrigin['sectionId']).toBe('s-Hero')
    expect(imageOrigin['fieldPath']).toBe('image')
    expect(imageOrigin['source']).toBe('draft')

    const cmd = el.props['terminalCommand'] as Record<string, unknown>
    expect(cmd['__agntcmsPreview']).toBe(true)
    expect(cmd['value']).toBe('agntcms up')
    const cmdOrigin = cmd['origin'] as Record<string, unknown>
    expect(cmdOrigin['sectionId']).toBe('s-Hero')
    expect(cmdOrigin['fieldPath']).toBe('terminalCommand')
  })

  it('passes defaults through as plain values in published mode (no preview brand)', () => {
    // Published mode: no value in section.data carries the preview brand,
    // so `inPreview` is false and defaults pass through untouched. This
    // keeps the hot path allocation-free.
    const defWithDefaults = makeDefinition(
      'Hero',
      StubHero as unknown as (props: never) => unknown,
      { title: 'Default title', image: '/default.png', subtitle: 'Default subtitle' },
    )
    const section = makeSection('Hero', { title: 'Actual title', image: '/a.png' })

    const result = SectionRenderer({ section, definitions: [defWithDefaults] })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    // Defaults arrive as plain values, not wrapped objects.
    expect(el.props).toEqual({
      title: 'Actual title',
      image: '/a.png',
      subtitle: 'Default subtitle',
    })
  })

  it('picks the correct definition from multiple', () => {
    function StubFooter(props: { text: string }): React.ReactElement {
      return <footer>{props.text}</footer>
    }

    const multiDefs: readonly AnySectionDefinition[] = [
      heroDefinition,
      makeDefinition('Footer', StubFooter as unknown as (props: never) => unknown),
    ]

    const section = makeSection('Footer', { text: 'bye' })
    const result = SectionRenderer({ section, definitions: multiDefs })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    expect(el.type).toBe(StubFooter)
    expect(el.props).toEqual({ text: 'bye' })
  })

  // ---------------------------------------------------------------------------
  // Slot wrapping (EDITABILITY_DESIGN.md sub-task 2)
  //
  // The renderer hands each editable field to the section component as
  // `EditableSlot<K, V> = { value: V | PreviewFieldLike<V> }` (the brand
  // `[__slot]: K` is phantom, type-only). The runtime shape is just
  // `{ value }`. ListField / ReferenceField intentionally pass through
  // raw — list internals are owned by sub-task 3, reference stays raw
  // forever (decision #3).
  // ---------------------------------------------------------------------------

  describe('slot wrapping', () => {
    function StubSection(_: Record<string, unknown>): React.ReactElement {
      // Body is irrelevant — we inspect the props on the element handed
      // back from `SectionRenderer` directly.
      return <div />
    }

    const stubComponent = StubSection as unknown as (props: never) => unknown

    it('wraps every editable kind into a slot in published mode', () => {
      // Schema covers TextField + RichTextField + ImageField + LinkField
      // + NumberField + BooleanField — the kinds called out in the
      // sub-task 2 dispatch's "at least: text, richText, image, link,
      // number, boolean" requirement. ListField / ReferenceField are
      // covered by their own tests below.
      const schema = {
        title: TextField,
        body: RichTextField,
        image: ImageField,
        cta: LinkField,
        rating: NumberField,
        featured: BooleanField,
      }
      const def = makeDefinition('Mixed', stubComponent, {}, schema)
      const data = {
        title: 'Hello',
        body: '**rich**',
        image: { filename: 'a.png', alt: 'a' },
        cta: { type: 'internal' as const, slug: 'about', label: 'About' },
        rating: 5,
        featured: true,
      }
      const section = makeSection('Mixed', data)

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      // Each editable kind arrives as `{ value: <bare-data> }` — the
      // phantom `[__slot]: K` brand has no runtime presence. We assert
      // the structural shape because the symbol-keyed brand can't be
      // named outside the module that declares it.
      expect(el.props['title']).toEqual({ value: 'Hello' })
      expect(el.props['body']).toEqual({ value: '**rich**' })
      expect(el.props['image']).toEqual({
        value: { filename: 'a.png', alt: 'a' },
      })
      expect(el.props['cta']).toEqual({
        value: { type: 'internal', slug: 'about', label: 'About' },
      })
      expect(el.props['rating']).toEqual({ value: 5 })
      expect(el.props['featured']).toEqual({ value: true })
    })

    it('wraps every editable kind into a slot in preview mode (slot.value carries the PreviewFieldLike)', () => {
      // Preview mode: each `section.data` value is itself a
      // `PreviewFieldLike<V>`. `wrapAsSlot` does NOT distinguish bare V
      // from PreviewField<V> — it stores whatever the caller passed.
      // The slot's `value` therefore contains the preview wrapper, and
      // `EditableText` / `read()` unwrap downstream.
      const schema = {
        title: TextField,
        body: RichTextField,
        image: ImageField,
      }
      const def = makeDefinition('PreviewMixed', stubComponent, {}, schema)
      const wrap = <T,>(value: T, fieldPath: string): {
        readonly __agntcmsPreview: true
        readonly value: T
        readonly origin: {
          pageSlug: string
          sectionId: string
          fieldPath: string
          source: 'draft'
          revision: string
        }
      } => ({
        __agntcmsPreview: true,
        value,
        origin: {
          pageSlug: 'home',
          sectionId: 's-PreviewMixed',
          fieldPath,
          source: 'draft',
          revision: 'r0',
        },
      })
      const wrappedTitle = wrap('Hello', 'title')
      const wrappedBody = wrap('**rich**', 'body')
      const wrappedImage = wrap({ filename: 'a.png', alt: 'a' }, 'image')

      const section = makeSection('PreviewMixed', {
        title: wrappedTitle,
        body: wrappedBody,
        image: wrappedImage,
      })

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      // `slot.value` IS the preview wrapper (NOT the bare value). This
      // is the contract the editable components count on: their
      // internal `isPreviewField(slot.value)` branch fires and drives
      // the click-to-edit path.
      expect(el.props['title']).toEqual({ value: wrappedTitle })
      expect(el.props['body']).toEqual({ value: wrappedBody })
      expect(el.props['image']).toEqual({ value: wrappedImage })
    })

    it('passes ReferenceField props through RAW (no slot wrapping)', () => {
      // Decision #3 in EDITABILITY_DESIGN.md: ReferenceField stays raw
      // forever. References are not inline-editable in v1; a slot would
      // force a no-op `<EditableReference>` wrapper without UX value. A
      // regression here would silently change the prop shape section
      // authors see and break any code that passes a ReferenceValue
      // straight into a non-editable utility (e.g. a slug lookup).
      const schema = { related: ReferenceField }
      const def = makeDefinition(
        'WithRef',
        stubComponent,
        {},
        schema,
      )
      const refValue = { slug: 'other-page' }
      const section = makeSection('WithRef', { related: refValue })

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      // Identity check — the prop is the same object the data carried.
      // Not a `{ value: refValue }` wrapper.
      expect(el.props['related']).toBe(refValue)
    })

    it('wraps a ListField prop into an EditableSlot whose value carries the raw items array (published mode)', () => {
      // Sub-task 3: `ListField` is now slot-typed end-to-end. The
      // SectionRenderer's slot lift produces an
      // `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>`; in published
      // mode the slot's `.value` is the bare items array (no per-item
      // pre-wrap — `<EditableList>` handles per-item slot wrapping at
      // render time so it can attach the right inline-save closures).
      const ListSchema = {
        items: { kind: 'list' as const, schema: { tag: TextField } },
      } as unknown as Record<string, unknown>
      const def = makeDefinition(
        'WithList',
        stubComponent,
        {},
        ListSchema,
      )
      const items = [
        { _id: 'a', tag: 'first' },
        { _id: 'b', tag: 'second' },
      ]
      const section = makeSection('WithList', { items })

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      // Slot shape is `{ value }` (the phantom `[__slot]: K` brand has
      // no runtime presence). The inner value is the raw items array
      // — reference-equal so React's reconciliation isn't broken by a
      // gratuitous shallow clone.
      expect(el.props['items']).toEqual({ value: items })
      expect((el.props['items'] as { value: unknown }).value).toBe(items)
    })

    it('wraps a ListField prop preserving per-item-field origin metadata (preview mode)', () => {
      // Preview mode: `getContent` wraps the WHOLE list-field value as
      // a single `PreviewField<RawArray>`. The slot lift stores that
      // wrapper INSIDE `slot.value` — the per-item-field origins live
      // unchanged on the items themselves (per-field origins are
      // synthesized at the `<EditableList>` boundary by
      // `wrapItemForPreview`, NOT here). We assert the renderer did
      // not strip the wrapper and the inner array is reference-equal,
      // because `wrapItemForPreview` reads list-level origin off
      // `slot.value` and chains per-field origins from it.
      const ListSchema = {
        items: { kind: 'list' as const, schema: { tag: TextField } },
      } as unknown as Record<string, unknown>
      const def = makeDefinition(
        'WithList',
        stubComponent,
        {},
        ListSchema,
      )
      const items = [
        { _id: 'a', tag: 'first' },
        { _id: 'b', tag: 'second' },
      ]
      const wrappedItems = {
        __agntcmsPreview: true as const,
        value: items,
        origin: {
          pageSlug: 'home',
          sectionId: 's-WithList',
          fieldPath: 'items',
          source: 'draft' as const,
          revision: 'r0',
        },
      }
      const section = makeSection('WithList', { items: wrappedItems })

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      // The slot's `.value` IS the preview wrapper (carrying the
      // list-level origin). The wrapper's inner `.value` is the raw
      // items array, reference-equal to the source — the same contract
      // every other editable kind upholds in preview mode.
      const slot = el.props['items'] as { value: unknown }
      expect(slot.value).toBe(wrappedItems)
      const innerWrapper = slot.value as { value: unknown; origin: { fieldPath: string } }
      expect(innerWrapper.value).toBe(items)
      expect(innerWrapper.origin.fieldPath).toBe('items')
    })

    it('passes data keys not present in the schema through verbatim', () => {
      // The renderer composes `wrappedDefaults`, then `section.data`.
      // Any data key that isn't in the schema must pass through
      // untouched — there is no editable widget bound to it, so
      // wrapping would just confuse downstream consumers.
      const schema = { title: TextField }
      const def = makeDefinition('Extras', stubComponent, {}, schema)
      const section = makeSection('Extras', {
        title: 'Hello',
        sectionId: 'opaque-id',
      })

      const result = SectionRenderer({ section, definitions: [def] })
      expect(result).not.toBeNull()
      const el = asTestElement(result!)

      expect(el.props['title']).toEqual({ value: 'Hello' })
      expect(el.props['sectionId']).toBe('opaque-id')
    })
  })
})
