// Unit tests for `wrapItemForPreview` — the helper that prepares a single
// list item for inline editing inside `<EditableList>`'s preview-mode
// `renderItem` callback. See the file header of `wrapItemForPreview.ts`
// for the full design rationale.

import { describe, it, expect, vi } from 'vitest'
import type {
  ButtonValue,
  ImageField,
  ImageValue,
  LinkValue,
  ListItem,
  RichTextField,
  SectionSchema,
  TextField,
} from '../../domain/index'
import {
  BooleanField,
  ButtonField,
  LinkField,
  ListField,
  NumberField,
  SelectField,
  VideoField,
} from '../../domain/index'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike, PreviewFieldOriginLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { wrapItemAsSlot, wrapItemForPreview } from './wrapItemForPreview'

// ---------------------------------------------------------------------------
// Slot helpers — sub-task 3 of EDITABILITY_DESIGN.md replaced the tri-arm
// `PreviewItem<S>` shape with `SlotItem<S>`. Each editable field on the
// wrapped item is now an `EditableSlot<K, V>` whose `.value` carries
// either a `PreviewFieldLike<V>` (inline-editable kinds) or a bare V
// (non-inline kinds). Tests written for the old shape unwrap one level
// through these helpers.
// ---------------------------------------------------------------------------

/** Unwrap an editable-kind slot to its inner `InlineEditablePreviewField`. */
function unwrapInline<T>(
  slotField: unknown,
): PreviewFieldLike<T> & { onSave: (newValue: T) => void } {
  // `slotField` is `EditableSlot<K, T>` whose `.value` is the
  // PreviewFieldLike wrapper (with onSave). Two levels of cast through
  // unknown so the wide test type collapses to the precise inline shape.
  const slot = slotField as EditableSlot<string, T>
  return slot.value as PreviewFieldLike<T> & { onSave: (newValue: T) => void }
}

/** Unwrap an editable-kind slot to its inner `PreviewFieldLike` (no onSave). */
function unwrapPreview<T>(slotField: unknown): PreviewFieldLike<T> {
  const slot = slotField as EditableSlot<string, T>
  return slot.value as PreviewFieldLike<T>
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const listOrigin: PreviewFieldOriginLike = {
  pageSlug: 'home',
  sectionId: 's-features',
  fieldPath: 'features',
  source: 'draft',
  revision: 'r0',
}

// `as unknown as` cast: vitest's TS resolution of generic schema fields
// occasionally widens the literal kind to `string`, so we keep the
// schema typed as `SectionSchema` here for ergonomic test setup.
const textField: TextField = { kind: 'text' }
const richTextField: RichTextField = { kind: 'richText' }
const imageField: ImageField = { kind: 'image' }

// Minimal helper to keep tests focused on the wrap behaviour, not on
// list-shape boilerplate.
function makeItem<S extends SectionSchema>(
  data: Record<string, unknown> & { _id: string },
): ListItem<S> {
  return data as unknown as ListItem<S>
}

// ---------------------------------------------------------------------------
// Wrapping rules: which kinds get wrapped, which pass through
// ---------------------------------------------------------------------------

describe('wrapItemForPreview — text/richText/image are wrapped', () => {
  it('wraps a TextField value as a slot whose value is PreviewFieldLike<string> with the expected fieldPath', () => {
    const schema = { title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', title: 'Hello' })
    const list = [item]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, list, commit)

    const wf = unwrapPreview<string>(wrapped.title)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value).toBe('Hello')
    expect(wf.origin.fieldPath).toBe('features[0].title')
    // Inherited origin keys
    expect(wf.origin.pageSlug).toBe('home')
    expect(wf.origin.sectionId).toBe('s-features')
    expect(wf.origin.source).toBe('draft')
    expect(wf.origin.revision).toBe('r0')
  })

  it('wraps a RichTextField value with the expected fieldPath', () => {
    const schema = { body: richTextField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', body: '**hi**' })
    const wrapped = wrapItemForPreview(item, schema, 2, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<string>(wrapped.body)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value).toBe('**hi**')
    expect(wf.origin.fieldPath).toBe('features[2].body')
  })

  it('wraps an ImageField value with the expected fieldPath', () => {
    const schema = { hero: imageField } satisfies SectionSchema
    const img: ImageValue = { filename: 'h.png', alt: 'hero' }
    const item = makeItem<typeof schema>({ _id: 'a', hero: img })
    const wrapped = wrapItemForPreview(item, schema, 1, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<ImageValue>(wrapped.hero)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value).toEqual({ filename: 'h.png', alt: 'hero' })
    expect(wf.origin.fieldPath).toBe('features[1].hero')
  })

  it('substitutes empty defaults for missing/wrongly-typed text values', () => {
    const schema = { title: textField } satisfies SectionSchema
    // `title` is missing on purpose — schema added a new field after the
    // item was last saved.
    const item = makeItem<typeof schema>({ _id: 'a' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<string>(wrapped.title)
    expect(wf.value).toBe('')
  })

  it('substitutes an empty ImageValue when the image field is missing', () => {
    const schema = { hero: imageField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<ImageValue>(wrapped.hero)
    expect(wf.value).toEqual({ filename: '', alt: '' })
  })
})

// ---------------------------------------------------------------------------
// wrapItemAsSlot — published-mode counterpart
// ---------------------------------------------------------------------------
//
// Sub-task 3 split per-item slot wrapping into two helpers: this one
// handles the published path (no preview origin, no inline-save closure
// — there is nothing to save). Authors get the same `SlotItem<S>` shape
// in both modes so a single `renderItem` body works for both.

describe('wrapItemAsSlot (published mode)', () => {
  it('wraps every editable-kind field as a bare-value slot', () => {
    const schema = {
      title: textField,
      body: richTextField,
      hero: imageField,
      cta: LinkField,
      featured: BooleanField,
      count: NumberField,
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'a',
      title: 'Hello',
      body: '**hi**',
      hero: { filename: 'h.png', alt: 'hero' },
      cta: { type: 'internal', slug: 'about', label: 'About' },
      featured: true,
      count: 7,
    })

    const wrapped = wrapItemAsSlot(item, schema)

    // _id passes through bare.
    expect(wrapped._id).toBe('a')
    // Every editable-kind field is a slot whose `.value` is the BARE
    // data — no preview wrapper, no onSave (published mode has nothing
    // to save).
    const titleSlot = wrapped.title as EditableSlot<string, string>
    const bodySlot = wrapped.body as EditableSlot<string, string>
    const heroSlot = wrapped.hero as EditableSlot<string, ImageValue>
    const ctaSlot = wrapped.cta as EditableSlot<string, LinkValue>
    const featuredSlot = wrapped.featured as EditableSlot<string, boolean>
    const countSlot = wrapped.count as EditableSlot<string, number>
    expect(titleSlot.value).toBe('Hello')
    expect(bodySlot.value).toBe('**hi**')
    expect(heroSlot.value).toEqual({ filename: 'h.png', alt: 'hero' })
    expect(ctaSlot.value).toEqual({ type: 'internal', slug: 'about', label: 'About' })
    expect(featuredSlot.value).toBe(true)
    expect(countSlot.value).toBe(7)
    expect(isPreviewField(titleSlot.value)).toBe(false)
    expect(isPreviewField(heroSlot.value)).toBe(false)
    expect(isPreviewField(ctaSlot.value)).toBe(false)
  })

  it('wraps a nested ListField field as a bare-value slot whose value is the raw nested array', () => {
    // Nested-list authors render through an inner `<EditableList field={item.features}>`.
    // The outer published wrap exposes `features` as a slot; the inner
    // value is the raw nested items array (no per-item recursion here —
    // the inner EditableList does its own per-item slot wrap at render
    // time, same contract as preview mode).
    const schema = {
      features: ListField({ tag: textField }),
    } satisfies SectionSchema
    const nested = [
      { _id: 'f0', tag: 'one' },
      { _id: 'f1', tag: 'two' },
    ]
    const item = makeItem<typeof schema>({ _id: 'a', features: nested })

    const wrapped = wrapItemAsSlot(item, schema)
    const featuresSlot = wrapped.features as EditableSlot<string, ReadonlyArray<unknown>>
    // Reference-equal pass-through — no spurious clone of the array.
    expect(featuresSlot.value).toBe(nested)
  })
})

describe('wrapItemForPreview — non-inline kinds are slot-wrapped with bare values (no PreviewField)', () => {
  it('wraps number / select / video values as bare-value slots (no preview wrapper, no onSave)', () => {
    // Sub-task 3 of EDITABILITY_DESIGN.md: every editable-kind field on
    // a `SlotItem<S>` is a slot, even kinds that have no inline-editing
    // surface inside a list-item card (number/select/video). Their
    // `slot.value` carries the BARE value (no PreviewFieldLike), so the
    // ✎ modal still reads them as raw — and `<EditableNumber>` /
    // `<EditableSelect>` / `<EditableVideo>` placed inside `renderItem`
    // see no preview origin and silently render in published-mode style
    // (which is the policy: meta fields edit through the modal).
    const schema = {
      count: NumberField,
      size: SelectField([{ value: 'sm', label: 'Small' }]),
      clip: VideoField,
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'a',
      count: 3,
      size: 'sm',
      clip: { url: 'https://youtu.be/x' },
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    // Each is a slot (`{ value }`), but `slot.value` is the BARE data
    // — no `__agntcmsPreview` brand.
    const countSlot = wrapped.count as EditableSlot<string, number>
    const sizeSlot = wrapped.size as EditableSlot<string, string>
    const clipSlot = wrapped.clip as EditableSlot<string, unknown>
    expect(countSlot.value).toBe(3)
    expect(sizeSlot.value).toBe('sm')
    expect(clipSlot.value).toBe(item['clip'])
    expect(isPreviewField(countSlot.value)).toBe(false)
    expect(isPreviewField(sizeSlot.value)).toBe(false)
    expect(isPreviewField(clipSlot.value)).toBe(false)
  })

  it('preserves the `_id` reserved key unchanged (bare string, not a slot)', () => {
    const schema = { title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'unique-1234', title: 'x' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(wrapped._id).toBe('unique-1234')
  })
})

// ---------------------------------------------------------------------------
// Inline save closure
// ---------------------------------------------------------------------------

describe('wrapItemForPreview — inline save closure', () => {
  it('writing wrapped.title.onSave(newValue) calls commit exactly once with the patched list', () => {
    const schema = { title: textField } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({ _id: 'a', title: 'first' }),
      makeItem<typeof schema>({ _id: 'b', title: 'second' }),
      makeItem<typeof schema>({ _id: 'c', title: 'third' }),
    ]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[1]!, schema, 1, listOrigin, items, commit)
    const wf = unwrapInline<string>(wrapped.title)
    wf.onSave('NEW')

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    // Length unchanged.
    expect(next).toHaveLength(3)
    // Edited field updated.
    expect(next[1]!.title).toBe('NEW')
    // _id preserved on the edited item.
    expect(next[1]!._id).toBe('b')
    // Other items reference-equal — important for React rerender perf.
    expect(next[0]).toBe(items[0])
    expect(next[2]).toBe(items[2])
  })

  it('image inline save produces a new ImageValue in the rebuilt list', () => {
    const schema = { hero: imageField } satisfies SectionSchema
    const original: ImageValue = { filename: 'a.png', alt: 'a' }
    const replacement: ImageValue = { filename: 'b.png', alt: 'b' }
    const items = [makeItem<typeof schema>({ _id: 'a', hero: original })]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const wf = unwrapInline<ImageValue>(wrapped.hero)
    wf.onSave(replacement)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next[0]!.hero).toEqual(replacement)
  })

  it('two consecutive saves on the same field both end up in the latest list when the wrap is recomputed each render', () => {
    // The closure captures `fullList` by parameter at wrap-call time;
    // EditableList recomputes the wrap on every render. This test
    // simulates that pattern: after the first save, the parent state
    // updates, the next render produces a fresh wrap, and the second
    // save sees the new array — never the stale one.
    const schema = { title: textField } satisfies SectionSchema
    let items: ReadonlyArray<ListItem<typeof schema>> = [
      makeItem<typeof schema>({ _id: 'a', title: 'one' }),
    ]
    const commit = vi.fn((next: ReadonlyArray<ListItem<typeof schema>>) => {
      items = next // simulate parent reducer
    })

    // First render → first wrap → first save
    let wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    let wf = unwrapInline<string>(wrapped.title)
    wf.onSave('two')

    expect(items[0]!.title).toBe('two')

    // Second render → fresh wrap over the updated `items` → second save
    wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    wf = unwrapInline<string>(wrapped.title)
    wf.onSave('three')

    expect(commit).toHaveBeenCalledTimes(2)
    // The crucial assertion: the SECOND commit ran against the post-first-save
    // array, not the original. Title goes one → two → three, never reverting.
    const lastCall = commit.mock.calls[1]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(lastCall[0]!.title).toBe('three')
    expect(items[0]!.title).toBe('three')
  })
})

// ---------------------------------------------------------------------------
// Link wrapping — `<EditableLink field={item.cta}>` inside `renderItem`
// ---------------------------------------------------------------------------
//
// Real-world driver: Pricing tier cards have a CTA link per tier. Without
// link being wrapped here, EditableLink's preview branch never fires and
// the inline link-edit modal can't open. The wrap must therefore expose
// `cta` as PreviewFieldLike<LinkValue> with chained fieldPath, and saves
// must bubble through the OUTER list's commit exactly like text/image do.

describe('wrapItemForPreview — LinkField is wrapped', () => {
  it('wraps a LinkField value as PreviewFieldLike<LinkValue> with the expected fieldPath', () => {
    const schema = { cta: LinkField } satisfies SectionSchema
    const cta: LinkValue = { type: 'internal', slug: 'pricing', label: 'See plans' }
    const item = makeItem<typeof schema>({ _id: 'tier-0', cta })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<LinkValue>(wrapped.cta)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value).toEqual(cta)
    // fieldPath chain matches the schema-keyed convention used elsewhere
    // (`tiers[0].cta` in the production schema).
    expect(wf.origin.fieldPath).toBe('features[0].cta')
    // Inherited origin keys flow through unchanged.
    expect(wf.origin.pageSlug).toBe('home')
    expect(wf.origin.sectionId).toBe('s-features')
    expect(wf.origin.source).toBe('draft')
    expect(wf.origin.revision).toBe('r0')
  })

  it('normalises legacy {href,label} payloads onto the discriminated union before wrapping', () => {
    // Mirrors what `getContent` already does on read; the wrap must not
    // hand a stale shape to EditableLink because the preview modal is
    // discriminated-union-only.
    const schema = { cta: LinkField } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'a',
      cta: { href: 'https://example.test/', label: 'Visit' },
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<LinkValue>(wrapped.cta)
    expect(wf.value).toEqual({
      type: 'external',
      url: 'https://example.test/',
      label: 'Visit',
    })
  })

  it('substitutes a blank internal link when the link field is missing or garbage', () => {
    // Same defensive default `normalizeLinkValue` produces for null/undefined —
    // EditableLink's preview branch must never see `unknown` at runtime.
    const schema = { cta: LinkField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<LinkValue>(wrapped.cta)
    expect(wf.value).toEqual({ type: 'internal', slug: '', label: '' })
  })

  it('saving wrapped.cta.onSave(newLinkValue) calls commit exactly once with the patched outer list', () => {
    const schema = { cta: LinkField, title: textField } satisfies SectionSchema
    const original: LinkValue = { type: 'internal', slug: '', label: '' }
    const items = [
      makeItem<typeof schema>({ _id: 'a', title: 'first', cta: original }),
      makeItem<typeof schema>({ _id: 'b', title: 'second', cta: original }),
      makeItem<typeof schema>({ _id: 'c', title: 'third', cta: original }),
    ]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const wf = unwrapInline<LinkValue>(wrapped.cta)
    const replacement: LinkValue = { type: 'external', url: 'https://x.test', label: 'Click' }
    wf.onSave(replacement)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(3)
    // Edited field updated.
    expect(next[0]!.cta).toEqual(replacement)
    // _id preserved on the edited item.
    expect(next[0]!._id).toBe('a')
    // Sibling `title` on the same item preserved (a single-key patch only).
    expect(next[0]!.title).toBe('first')
    // Other items reference-equal — important for React rerender perf and
    // the same contract text/image already uphold.
    expect(next[1]).toBe(items[1])
    expect(next[2]).toBe(items[2])
  })

  it('a nested-list LinkField is reached by re-wrapping the nested array (simulating the inner EditableList) and bubbles to the outer commit exactly once', () => {
    // Real shape: an outer list whose items each carry an inner list,
    // and an item inside the inner list has a CTA link. The outer wrap
    // exposes the nested list as a single PreviewFieldLike whose
    // `value` is the RAW nested array; the inner EditableList wraps
    // each nested item itself at render time. We simulate that by
    // calling `wrapItemForPreview` on the nested raw array using the
    // wrapped nested-list field's `onSave` as the inner-list commit.
    // A leaf save on the nested CTA must bubble all the way to the
    // OUTER commit in one call.
    const schema = {
      blocks: ListField({ cta: LinkField, label: textField }),
    } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({
        _id: 'tier-a',
        blocks: [
          { _id: 'b0', label: 'first', cta: { type: 'internal', slug: '', label: '' } },
          { _id: 'b1', label: 'second', cta: { type: 'internal', slug: 'about', label: 'About' } },
        ],
      }),
      makeItem<typeof schema>({
        _id: 'tier-b',
        blocks: [{ _id: 'c0', label: 'untouched', cta: { type: 'internal', slug: '', label: '' } }],
      }),
    ]
    const commit = vi.fn()
    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)

    // The nested list is a slot whose `.value` is a PreviewFieldLike
    // with raw items array (no per-item pre-wrap).
    const nestedField = unwrapInline<
      ReadonlyArray<ListItem<{ cta: typeof LinkField; label: typeof textField }>>
    >(wrapped.blocks)
    expect(isPreviewField(nestedField)).toBe(true)
    expect(nestedField.origin.fieldPath).toBe('features[0].blocks')
    // Raw value: same reference as the source nested array.
    expect(nestedField.value).toBe(items[0]!['blocks'])

    // Simulate the inner EditableList: re-wrap each nested raw item via
    // wrapItemForPreview using the wrapped nested-list field's onSave
    // as the inner-list `commit`. This is exactly what
    // `<EditableList field={item.blocks}>` would do at render time.
    const innerSchema = { cta: LinkField, label: textField } satisfies SectionSchema
    const innerCommit = nestedField.onSave
    const innerWrapped = wrapItemForPreview(
      nestedField.value[1]! as ListItem<typeof innerSchema>,
      innerSchema,
      1,
      nestedField.origin,
      nestedField.value as ReadonlyArray<ListItem<typeof innerSchema>>,
      innerCommit as (v: ReadonlyArray<ListItem<typeof innerSchema>>) => void,
    )
    // Inner-leaf is a slot whose `.value` is a PreviewFieldLike with
    // the chained fieldPath.
    const innerCta = unwrapInline<LinkValue>(innerWrapped.cta)
    expect(isPreviewField(innerCta)).toBe(true)
    expect(innerCta.origin.fieldPath).toBe('features[0].blocks[1].cta')

    const replacement: LinkValue = {
      type: 'external',
      url: 'https://x.test',
      label: 'Click',
    }
    innerCta.onSave(replacement)

    // Exactly one outer-list commit — the cascade (inner leaf onSave →
    // inner commit (= nested-list field's onSave) → outer commitItem)
    // ends with one outer commit call.
    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(2)

    const tierA = next[0]! as unknown as {
      readonly _id: string
      readonly blocks: ReadonlyArray<{ readonly _id: string; readonly cta: LinkValue }>
    }
    expect(tierA._id).toBe('tier-a')
    expect(tierA.blocks[1]!.cta).toEqual(replacement)
    expect(tierA.blocks[1]!._id).toBe('b1')
    // Sibling nested item unchanged and reference-equal.
    expect(tierA.blocks[0]).toBe(items[0]!['blocks'][0])
    // Sibling outer item unchanged and reference-equal.
    expect(next[1]).toBe(items[1])
  })
})

// ---------------------------------------------------------------------------
// Boolean wrapping — `<EditableBoolean field={item.highlighted}>` inside
// `renderItem`
// ---------------------------------------------------------------------------
//
// Real-world driver: Pricing tier cards have a `highlighted` toggle per
// tier. Without boolean being wrapped here, EditableBoolean's preview
// branch never fires and the inline toggle can't flip the value. The wrap
// must therefore expose `highlighted` as PreviewFieldLike<boolean> with
// chained fieldPath, and saves must bubble through the OUTER list's
// commit exactly like text/image/link do.

describe('wrapItemForPreview — BooleanField is wrapped', () => {
  it('wraps a BooleanField value as PreviewFieldLike<boolean> with the expected fieldPath', () => {
    const schema = { highlighted: BooleanField, title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'tier-0', title: 'Pro', highlighted: true })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<boolean>(wrapped.highlighted)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value).toBe(true)
    expect(wf.origin.fieldPath).toBe('features[0].highlighted')
    // Inherited origin keys flow through unchanged.
    expect(wf.origin.pageSlug).toBe('home')
    expect(wf.origin.sectionId).toBe('s-features')
    expect(wf.origin.source).toBe('draft')
    expect(wf.origin.revision).toBe('r0')
  })

  it('saving wrapped.highlighted.onSave(true) calls commit exactly once with the patched outer list', () => {
    const schema = { highlighted: BooleanField, title: textField } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({ _id: 'a', title: 'first', highlighted: false }),
      makeItem<typeof schema>({ _id: 'b', title: 'second', highlighted: false }),
      makeItem<typeof schema>({ _id: 'c', title: 'third', highlighted: false }),
    ]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const wf = unwrapInline<boolean>(wrapped.highlighted)
    wf.onSave(true)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(3)
    // Edited field updated.
    expect(next[0]!.highlighted).toBe(true)
    // _id preserved on the edited item.
    expect(next[0]!._id).toBe('a')
    // Sibling field on the same item preserved (single-key patch only).
    expect(next[0]!.title).toBe('first')
    // Other items reference-equal — the same contract text/image/link uphold.
    expect(next[1]).toBe(items[1])
    expect(next[2]).toBe(items[2])
  })

  it('saving wrapped.highlighted.onSave(false) flips back through the same single-commit path', () => {
    const schema = { highlighted: BooleanField } satisfies SectionSchema
    const items = [makeItem<typeof schema>({ _id: 'a', highlighted: true })]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const wf = unwrapInline<boolean>(wrapped.highlighted)
    wf.onSave(false)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next[0]!.highlighted).toBe(false)
    expect(next[0]!._id).toBe('a')
  })

  it('substitutes `false` defensively when the boolean field is missing or non-boolean', () => {
    // Mirrors `image`/`link` defensive normalisation. EditableBoolean's
    // preview branch must never see `unknown` at runtime — schema drift
    // (a new field added after items were last saved) and outright bad
    // data both collapse to `false`.
    const schema = { highlighted: BooleanField } satisfies SectionSchema

    // Missing field
    const missingItem = makeItem<typeof schema>({ _id: 'a' })
    const missingWrapped = wrapItemForPreview(missingItem, schema, 0, listOrigin, [missingItem], vi.fn())
    expect(unwrapPreview<boolean>(missingWrapped.highlighted).value).toBe(false)

    // Explicit null
    const nullItem = makeItem<typeof schema>({ _id: 'b', highlighted: null })
    const nullWrapped = wrapItemForPreview(nullItem, schema, 0, listOrigin, [nullItem], vi.fn())
    expect(unwrapPreview<boolean>(nullWrapped.highlighted).value).toBe(false)

    // Wrong type (string from corrupted/legacy data)
    const stringItem = makeItem<typeof schema>({ _id: 'c', highlighted: 'true' })
    const stringWrapped = wrapItemForPreview(stringItem, schema, 0, listOrigin, [stringItem], vi.fn())
    expect(unwrapPreview<boolean>(stringWrapped.highlighted).value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Nested lists — list-of-lists wrapped as PreviewFieldLike<raw array>
// ---------------------------------------------------------------------------
//
// Real-world driver: the Pricing template has
//   tiers: ListField({ features: ListField({ label: RichTextField, included: BooleanField }) })
// and an author wants:
//   - inline-edit a feature's label,
//   - add / remove / reorder feature rows.
//
// The OUTER wrap exposes the nested `features` field as a SINGLE
// PreviewFieldLike whose `value` is the RAW nested array (no per-item
// pre-wrap) and whose `onSave(newArray)` rebuilds the outer item and
// bubbles to the topmost commit. The INNER `<EditableList>` does its
// own per-item wrap at render time — same contract as top-level lists.
// Add/remove/move at the nested level go through `onSave` directly.
// Inline-leaf edits at the nested level go through the inner
// EditableList's per-item dispatcher and ultimately call this same
// `onSave` with a new full nested array — different entry hop, same
// single-commit cascade. We simulate the inner-EditableList path here
// by re-wrapping the nested raw array with `wrapItemForPreview` using
// the wrapped nested-list field's `onSave` as the inner-list commit.

describe('wrapItemForPreview — nested list (list-of-lists)', () => {
  it('wraps the nested list as a single PreviewFieldLike with raw value array and chained fieldPath', () => {
    const schema = {
      features: ListField({ label: richTextField, included: BooleanField }),
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'tier-a',
      features: [
        { _id: 'f0', label: 'first', included: true },
        { _id: 'f1', label: 'second', included: false },
      ],
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    // `wrapped.features` is a slot whose `.value` is a PreviewFieldLike
    // — NOT an array of pre-wrapped items. The slot wrap is the
    // sub-task-3 invariant; the inner PreviewFieldLike is what gives
    // the nested list its own add/remove affordance through the inner
    // EditableList.
    const nestedField = unwrapPreview<ReadonlyArray<ListItem<SectionSchema>>>(wrapped.features)
    expect(isPreviewField(nestedField)).toBe(true)
    // `value` is the RAW nested array, reference-equal to the source.
    expect(Array.isArray(nestedField.value)).toBe(true)
    expect(nestedField.value).toBe(item['features'])
    expect(nestedField.value).toHaveLength(2)
    // FieldPath is `${outerPath}[${index}].${key}` — same convention as
    // every other wrapped field on the item.
    expect(nestedField.origin.fieldPath).toBe('features[0].features')
    // Inherited origin keys flow through unchanged.
    expect(nestedField.origin.pageSlug).toBe('home')
    expect(nestedField.origin.sectionId).toBe('s-features')
    expect(nestedField.origin.source).toBe('draft')
    expect(nestedField.origin.revision).toBe('r0')
  })

  it('substitutes an empty array when the nested list field is missing or wrongly typed', () => {
    // Mirrors the defensive defaults used for image/link/boolean — schema
    // drift (a new nested-list field added after items were last saved)
    // and outright bad data both collapse to an empty array so
    // `<EditableList>`'s preview branch can read `.length` immediately.
    const schema = {
      features: ListField({ label: textField }),
    } satisfies SectionSchema

    const missingItem = makeItem<typeof schema>({ _id: 'a' })
    const missingWrapped = wrapItemForPreview(missingItem, schema, 0, listOrigin, [missingItem], vi.fn())
    const missingField = unwrapPreview<ReadonlyArray<ListItem<SectionSchema>>>(missingWrapped.features)
    expect(isPreviewField(missingField)).toBe(true)
    expect(missingField.value).toEqual([])

    const wrongTypeItem = makeItem<typeof schema>({ _id: 'b', features: 'not an array' })
    const wrongTypeWrapped = wrapItemForPreview(wrongTypeItem, schema, 0, listOrigin, [wrongTypeItem], vi.fn())
    const wrongTypeField = unwrapPreview<ReadonlyArray<ListItem<SectionSchema>>>(wrongTypeWrapped.features)
    expect(wrongTypeField.value).toEqual([])
  })

  it('calling the wrapped nested-list onSave with a full new array bubbles one outer commit with the nested array swapped on the right outer item', () => {
    // This is the add/remove/reorder path: `EditableList`'s `commit` calls
    // `field.onSave(field.origin, newFullArray)`. Through the
    // SaveProvider chain that becomes a call to THIS wrapped field's
    // onSave with the new full nested array.
    const schema = {
      features: ListField({ label: richTextField }),
    } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({
        _id: 'tier-a',
        features: [
          { _id: 'f0', label: 'first' },
          { _id: 'f1', label: 'second' },
        ],
      }),
      makeItem<typeof schema>({
        _id: 'tier-b',
        features: [{ _id: 'g0', label: 'untouched' }],
      }),
    ]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    // `as unknown as` because the runtime shape is the third arm of the
    // union but TS sees the intersection with `{ onSave }` as too narrow
    // a refinement of the union's PreviewFieldLike arm. Same pattern as
    // every other inline-save cast in this file.
    const nestedField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(wrapped.features)

    // Replace the nested array entirely (e.g. add/remove/reorder result).
    const replacement: ReadonlyArray<ListItem<SectionSchema>> = [
      { _id: 'f1', label: 'second' } as unknown as ListItem<SectionSchema>,
      { _id: 'f0', label: 'first' } as unknown as ListItem<SectionSchema>,
      { _id: 'fNew', label: 'new' } as unknown as ListItem<SectionSchema>,
    ]
    nestedField.onSave(replacement)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(2)

    // The outer item that owned the edited nested list now carries the
    // replacement array (reference-equal — no spurious shallow clone of
    // the array between us and the outer commit).
    const tierA = next[0]! as unknown as {
      readonly _id: string
      readonly features: ReadonlyArray<unknown>
    }
    expect(tierA._id).toBe('tier-a')
    expect(tierA.features).toBe(replacement)
    // Sibling outer item is reference-equal — single-key patch only.
    expect(next[1]).toBe(items[1])
  })

  it('add/remove at the nested level produces the expected outer-list shape (length grows / shrinks correctly)', () => {
    const schema = {
      features: ListField({ label: textField }),
    } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({
        _id: 'tier-a',
        features: [
          { _id: 'f0', label: 'one' },
          { _id: 'f1', label: 'two' },
        ],
      }),
    ]

    // Add a row.
    const commitAdd = vi.fn()
    const wrappedAdd = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commitAdd)
    const nestedAddField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(wrappedAdd.features)
    const grown: ReadonlyArray<ListItem<SectionSchema>> = [
      ...(nestedAddField.value as ReadonlyArray<ListItem<SectionSchema>>),
      { _id: 'fNew', label: 'three' } as unknown as ListItem<SectionSchema>,
    ]
    nestedAddField.onSave(grown)
    expect(commitAdd).toHaveBeenCalledTimes(1)
    const afterAdd = commitAdd.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    const tierA = afterAdd[0]! as unknown as { readonly features: ReadonlyArray<unknown> }
    expect(tierA.features).toHaveLength(3)

    // Remove the first row. Fresh wrap because `items` would normally be
    // updated by the parent reducer between mutations.
    const commitRemove = vi.fn()
    const wrappedRemove = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commitRemove)
    const nestedRemoveField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(wrappedRemove.features)
    const shrunk = (nestedRemoveField.value as ReadonlyArray<ListItem<SectionSchema>>).slice(1)
    nestedRemoveField.onSave(shrunk)
    expect(commitRemove).toHaveBeenCalledTimes(1)
    const afterRemove = commitRemove.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    const tierARem = afterRemove[0]! as unknown as { readonly features: ReadonlyArray<{ _id: string }> }
    expect(tierARem.features).toHaveLength(1)
    expect(tierARem.features[0]!._id).toBe('f1')
  })

  it('inline-leaf edit inside a nested item still bubbles to the outer commit in one call (simulating the inner EditableList)', () => {
    // The inner `<EditableList field={item.features}>` re-wraps each
    // nested raw item with `wrapItemForPreview` at render time, using
    // the wrapped nested-list field's `onSave` as the inner-list commit.
    // A leaf save through the inner wrap should call the outer commit
    // exactly once with the deeply-nested update applied.
    const schema = {
      features: ListField({ label: richTextField, included: BooleanField }),
    } satisfies SectionSchema
    const items = [
      makeItem<typeof schema>({
        _id: 'tier-a',
        features: [
          { _id: 'f0', label: 'first', included: true },
          { _id: 'f1', label: 'second', included: false },
        ],
      }),
      makeItem<typeof schema>({
        _id: 'tier-b',
        features: [{ _id: 'g0', label: 'untouched', included: true }],
      }),
    ]
    const commit = vi.fn()
    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const nestedField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(wrapped.features)

    // Inner-EditableList simulation: wrap the nested raw array per-item
    // using the wrapped nested-list field's onSave as the inner commit.
    const innerSchema = { label: richTextField, included: BooleanField } satisfies SectionSchema
    const innerArray = nestedField.value as ReadonlyArray<ListItem<typeof innerSchema>>
    const innerWrapped = wrapItemForPreview(
      innerArray[1]!,
      innerSchema,
      1,
      nestedField.origin,
      innerArray,
      nestedField.onSave as (v: ReadonlyArray<ListItem<typeof innerSchema>>) => void,
    )
    const innerLabel = unwrapInline<string>(innerWrapped.label)
    expect(isPreviewField(innerLabel)).toBe(true)
    expect(innerLabel.origin.fieldPath).toBe('features[0].features[1].label')

    innerLabel.onSave('NEW')

    // Exactly one outer-list commit — the cascade ends at the outermost
    // commit even though the save started two levels in.
    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(2)

    const tierA = next[0]! as unknown as {
      readonly _id: string
      readonly features: ReadonlyArray<{ readonly _id: string; readonly label: string; readonly included: boolean }>
    }
    expect(tierA._id).toBe('tier-a')
    expect(tierA.features[1]!.label).toBe('NEW')
    expect(tierA.features[1]!._id).toBe('f1')
    // Sibling nested item unchanged and reference-equal.
    expect(tierA.features[0]).toBe(items[0]!['features'][0])
    // Sibling outer item reference-equal.
    expect(next[1]).toBe(items[1])
  })

  it('three-level nesting (list of lists of lists) bubbles the deepest add/remove through to a single outer commit', () => {
    // Three levels deep — the wrap shape applies recursively through the
    // inner-EditableList simulation chain. Each level emits its own
    // PreviewFieldLike whose onSave bubbles to the level above; the
    // innermost save lands a single outer-list commit.
    const schema = {
      x: ListField({
        y: ListField({
          z: ListField({ deep: textField }),
        }),
      }),
    } satisfies SectionSchema

    const item = makeItem<typeof schema>({
      _id: 'outer-0',
      x: [
        {
          _id: 'x0',
          y: [
            { _id: 'y0', z: [] },
            {
              _id: 'y1',
              z: [
                { _id: 'z0', deep: 'a' },
                { _id: 'z1', deep: 'b' },
              ],
            },
          ],
        },
      ],
    })
    const commit = vi.fn()
    const outerWrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], commit)

    // Level 1: outer item → wrapped.x is a PreviewFieldLike for the x array.
    // `as unknown as` because the precise generic NS doesn't structurally
    // overlap with the wide `SectionSchema` cast target.
    const xField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(outerWrapped.x)
    expect(isPreviewField(xField)).toBe(true)
    expect(xField.origin.fieldPath).toBe('features[0].x')

    // Level 2: simulate inner EditableList for x; wrap x[0].
    const xInnerSchema = { y: ListField({ z: ListField({ deep: textField }) }) } satisfies SectionSchema
    const xInner = wrapItemForPreview(
      xField.value[0]! as ListItem<typeof xInnerSchema>,
      xInnerSchema,
      0,
      xField.origin,
      xField.value as ReadonlyArray<ListItem<typeof xInnerSchema>>,
      xField.onSave as (v: ReadonlyArray<ListItem<typeof xInnerSchema>>) => void,
    )
    const yField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(xInner.y)
    expect(isPreviewField(yField)).toBe(true)
    expect(yField.origin.fieldPath).toBe('features[0].x[0].y')

    // Level 3: simulate inner EditableList for y; wrap y[1].
    const yInnerSchema = { z: ListField({ deep: textField }) } satisfies SectionSchema
    const yInner = wrapItemForPreview(
      yField.value[1]! as ListItem<typeof yInnerSchema>,
      yInnerSchema,
      1,
      yField.origin,
      yField.value as ReadonlyArray<ListItem<typeof yInnerSchema>>,
      yField.onSave as (v: ReadonlyArray<ListItem<typeof yInnerSchema>>) => void,
    )
    const zField = unwrapInline<ReadonlyArray<ListItem<SectionSchema>>>(yInner.z)
    expect(isPreviewField(zField)).toBe(true)
    expect(zField.origin.fieldPath).toBe('features[0].x[0].y[1].z')

    // Add a new row to the deepest list (the new add/remove path
    // exercised at the deepest level — what the dispatch's #5 calls
    // out: "the analogous test for the new add/remove path at the
    // deepest level"). The save bubbles three hops up to a single
    // outer-list commit.
    const grown: ReadonlyArray<ListItem<SectionSchema>> = [
      ...(zField.value as ReadonlyArray<ListItem<SectionSchema>>),
      { _id: 'zNew', deep: 'NEW' } as unknown as ListItem<SectionSchema>,
    ]
    zField.onSave(grown)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    const root = next[0]! as unknown as {
      readonly _id: string
      readonly x: ReadonlyArray<{
        readonly _id: string
        readonly y: ReadonlyArray<{
          readonly _id: string
          readonly z: ReadonlyArray<{ readonly _id: string; readonly deep: string }>
        }>
      }>
    }
    expect(root._id).toBe('outer-0')
    expect(root.x[0]!._id).toBe('x0')
    expect(root.x[0]!.y[1]!._id).toBe('y1')
    // The deepest list now has 3 entries, with the new one appended.
    expect(root.x[0]!.y[1]!.z).toHaveLength(3)
    expect(root.x[0]!.y[1]!.z[2]!._id).toBe('zNew')
    expect(root.x[0]!.y[1]!.z[2]!.deep).toBe('NEW')
    // Untouched sibling at the same depth reference-equal.
    expect(root.x[0]!.y[0]).toBe(item['x'][0]!.y[0])
  })
})

// ---------------------------------------------------------------------------
// Button wrapping — `<EditableButton field={item.cta}>` inside `renderItem`
// ---------------------------------------------------------------------------
//
// Real-world driver: Pricing tier cards have a CTA button per tier. Without
// button being wrapped here, EditableButton's preview branch never fires
// and clicking the button navigates the underlying link instead of opening
// the picker modal — a hard usability bug. The wrap must therefore expose
// `cta` as PreviewFieldLike<ButtonValue> with chained fieldPath, the
// ButtonValue (label + variant + optional link) carried as a single unit,
// and saves bubbling through the OUTER list's commit exactly like
// text/image/link/boolean do.

describe('wrapItemForPreview — ButtonField is wrapped', () => {
  // Variants list shared across button tests — order matters: the first
  // entry is the canonical fallback when content is missing/garbage.
  const buttonVariants = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
  ]

  it('wraps a ButtonField value as PreviewFieldLike<ButtonValue> with the expected fieldPath', () => {
    const schema = { cta: ButtonField(buttonVariants) } satisfies SectionSchema
    const cta: ButtonValue = {
      label: 'Sign up',
      variant: 'primary',
      link: { type: 'internal', slug: 'signup', label: 'Sign up' },
    }
    const item = makeItem<typeof schema>({ _id: 'tier-0', cta })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<ButtonValue>(wrapped.cta)
    expect(isPreviewField(wf)).toBe(true)
    // Whole ButtonValue is the wrap unit — link sub-object is NOT
    // independently wrapped (it round-trips through the picker modal).
    expect(wf.value).toEqual(cta)
    // fieldPath chain matches the schema-keyed convention.
    expect(wf.origin.fieldPath).toBe('features[0].cta')
    // Inherited origin keys flow through unchanged.
    expect(wf.origin.pageSlug).toBe('home')
    expect(wf.origin.sectionId).toBe('s-features')
    expect(wf.origin.source).toBe('draft')
    expect(wf.origin.revision).toBe('r0')
  })

  it('wraps a button with `link: undefined` cleanly (link is optional)', () => {
    // A pure UI affordance with no navigation — the wrap must not crash
    // or invent a link. The whole ButtonValue is wrapped as one; `link`
    // stays undefined.
    const schema = { cta: ButtonField(buttonVariants) } satisfies SectionSchema
    const cta: ButtonValue = { label: 'Open dialog', variant: 'secondary' }
    const item = makeItem<typeof schema>({ _id: 'tier-0', cta })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<ButtonValue>(wrapped.cta)
    expect(isPreviewField(wf)).toBe(true)
    expect(wf.value.label).toBe('Open dialog')
    expect(wf.value.variant).toBe('secondary')
    expect(wf.value.link).toBeUndefined()
  })

  it('does NOT independently wrap the `link` sub-object — the entire ButtonValue is the wrap unit', () => {
    // Critical contract: the editor flow is the picker modal, which
    // commits a fully-formed replacement ButtonValue. Wrapping `link`
    // on its own would introduce a second routing path with a
    // divergent fieldPath — the saved state would race the modal's.
    const schema = { cta: ButtonField(buttonVariants) } satisfies SectionSchema
    const cta: ButtonValue = {
      label: 'Sign up',
      variant: 'primary',
      link: { type: 'external', url: 'https://example.test/', label: 'Sign up' },
    }
    const item = makeItem<typeof schema>({ _id: 'tier-0', cta })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    const wf = unwrapPreview<ButtonValue>(wrapped.cta)
    // The inner `link` is the raw LinkValue, not a PreviewFieldLike.
    const innerLink = wf.value.link as unknown
    expect(isPreviewField(innerLink)).toBe(false)
    expect(innerLink).toEqual({
      type: 'external',
      url: 'https://example.test/',
      label: 'Sign up',
    })
  })

  it('substitutes a blank ButtonValue with the first declared variant when the button field is missing or garbage', () => {
    // Mirrors `image`/`link` defensive normalisation. EditableButton's
    // preview branch must never see `unknown` at runtime — schema drift
    // (a new field added after items were last saved) and outright bad
    // data both collapse to `{ label: '', variant: <first declared>, link: undefined }`.
    const schema = { cta: ButtonField(buttonVariants) } satisfies SectionSchema

    // Missing field
    const missingItem = makeItem<typeof schema>({ _id: 'a' })
    const missingWrapped = wrapItemForPreview(missingItem, schema, 0, listOrigin, [missingItem], vi.fn())
    expect(unwrapPreview<ButtonValue>(missingWrapped.cta).value).toEqual({
      label: '',
      variant: 'primary',
    })

    // Wrong type (string from corrupted/legacy data)
    const stringItem = makeItem<typeof schema>({ _id: 'b', cta: 'click' })
    const stringWrapped = wrapItemForPreview(stringItem, schema, 0, listOrigin, [stringItem], vi.fn())
    expect(unwrapPreview<ButtonValue>(stringWrapped.cta).value).toEqual({
      label: '',
      variant: 'primary',
    })
  })

  it('falls back to an empty variant string when the descriptor declares no variants', () => {
    // Defensive: a schema without variants is unusual but legal. The
    // fallback collapses to `''` so the picker modal's "(missing)"
    // surfacing kicks in rather than crashing on an undefined variant.
    const schema = { cta: ButtonField([]) } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    expect(unwrapPreview<ButtonValue>(wrapped.cta).value).toEqual({
      label: '',
      variant: '',
    })
  })

  it('saving wrapped.cta.onSave(newButtonValue) calls commit exactly once with the patched outer list', () => {
    const schema = {
      cta: ButtonField(buttonVariants),
      title: textField,
    } satisfies SectionSchema
    const original: ButtonValue = { label: 'Old', variant: 'primary' }
    const items = [
      makeItem<typeof schema>({ _id: 'a', title: 'first', cta: original }),
      makeItem<typeof schema>({ _id: 'b', title: 'second', cta: original }),
      makeItem<typeof schema>({ _id: 'c', title: 'third', cta: original }),
    ]
    const commit = vi.fn()

    const wrapped = wrapItemForPreview(items[0]!, schema, 0, listOrigin, items, commit)
    const wf = unwrapInline<ButtonValue>(wrapped.cta)
    const replacement: ButtonValue = {
      label: 'New',
      variant: 'secondary',
      link: { type: 'external', url: 'https://x.test', label: 'New' },
    }
    wf.onSave(replacement)

    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    expect(next).toHaveLength(3)
    // Edited field updated as a whole ButtonValue.
    expect(next[0]!.cta).toEqual(replacement)
    // _id preserved on the edited item.
    expect(next[0]!._id).toBe('a')
    // Sibling `title` on the same item preserved (a single-key patch only).
    expect(next[0]!.title).toBe('first')
    // Other items reference-equal — same contract text/image/link/boolean uphold.
    expect(next[1]).toBe(items[1])
    expect(next[2]).toBe(items[2])
  })
})
