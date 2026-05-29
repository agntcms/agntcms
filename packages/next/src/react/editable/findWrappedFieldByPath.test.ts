// Unit tests for `findWrappedFieldByPath` and `stripListItemPrefix` —
// the helpers that route a fieldPath save through the wrapped item
// produced by `wrapItemForPreview`. Exercised by `<EditableList>`'s
// SaveProvider.

import { describe, it, expect, vi } from 'vitest'
import type { ImageValue, ListItem, RichTextField, SectionSchema, TextField } from '../../domain/index'
import { BooleanField, ListField, NumberField } from '../../domain/index'
import { findWrappedFieldByPath, stripListItemPrefix } from './findWrappedFieldByPath'
import type { PreviewFieldOriginLike } from './isPreviewField'
import { wrapItemForPreview } from './wrapItemForPreview'

const listOrigin: PreviewFieldOriginLike = {
  pageSlug: 'home',
  sectionId: 's-features',
  fieldPath: 'tiers',
  source: 'draft',
  revision: 'r0',
}

const textField: TextField = { kind: 'text' }
const richTextField: RichTextField = { kind: 'richText' }

function makeItem<S extends SectionSchema>(
  data: Record<string, unknown> & { _id: string },
): ListItem<S> {
  return data as unknown as ListItem<S>
}

// ---------------------------------------------------------------------------
// stripListItemPrefix
// ---------------------------------------------------------------------------

describe('stripListItemPrefix', () => {
  it('returns the suffix after the canonical `<list>[idx].` prefix', () => {
    expect(stripListItemPrefix('tiers[0].title', 'tiers', 0)).toBe('title')
    expect(stripListItemPrefix('tiers[2].features[1].label', 'tiers', 2)).toBe('features[1].label')
  })

  it('returns undefined when the prefix does not match', () => {
    expect(stripListItemPrefix('tiers[1].title', 'tiers', 0)).toBeUndefined()
    expect(stripListItemPrefix('other[0].title', 'tiers', 0)).toBeUndefined()
    // No item-index segment at all (would be a top-level page field path).
    expect(stripListItemPrefix('title', 'tiers', 0)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findWrappedFieldByPath — top-level fields
// ---------------------------------------------------------------------------

describe('findWrappedFieldByPath — top-level wrapped fields', () => {
  it('finds a wrapped text leaf and exposes its onSave', () => {
    const schema = { title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', title: 'hello' })
    const commit = vi.fn()
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], commit)

    const found = findWrappedFieldByPath(wrapped as Record<string, unknown>, 'title')
    expect(found).toBeDefined()
    expect(found!.value).toBe('hello')
    found!.onSave('NEW')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('returns undefined for a path that names a non-wrapped kind (e.g. number)', () => {
    // Boolean used to be non-wrapped, but `<EditableBoolean>` inline
    // toggles now require a PreviewFieldLike origin too — see
    // wrapItemForPreview's boolean case. NumberField is the remaining
    // canonical example of a kind that genuinely passes through raw.
    const schema = { count: NumberField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', count: 3 })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'count')).toBeUndefined()
  })

  it('returns undefined for an unknown field name', () => {
    const schema = { title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', title: 'x' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'whatever')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findWrappedFieldByPath — nested list field (the Pricing case)
// ---------------------------------------------------------------------------
//
// Under the new wrapping contract, nested lists are emitted as a SINGLE
// PreviewFieldLike with the raw nested array as value (no per-item
// pre-wrap). So `findWrappedFieldByPath` resolves one-segment paths into
// the wrapped nested-list field itself; deeper walks (`features[idx].leaf`)
// are no longer the framework's responsibility — the inner
// `<EditableList>` mounts its OWN per-item SaveProvider that catches
// inner-leaf saves before they escape to the outer ItemCard's dispatcher.
// What we test here is the contract the OUTER ItemCard's dispatcher
// relies on: a one-hop walk to the wrapped nested-list field works (so
// add/remove/move from an inner EditableList commits routes correctly),
// and deeper walks return undefined (so the inner SaveProvider is the
// only path to inner-leaf onSave closures).

describe('findWrappedFieldByPath — nested list field', () => {
  it("resolves the one-hop `features` path to the wrapped nested-list field's onSave (the add/remove/move route)", () => {
    // Inner EditableList's commit calls the wrapped nested-list field's
    // onSave through SaveProvider; the outer ItemCard's dispatcher
    // strips the prefix and walks one hop to find that wrapped field.
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
    const commit = vi.fn()
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], commit)

    const found = findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features')
    expect(found).toBeDefined()
    expect(found!.origin.fieldPath).toBe('tiers[0].features')
    // value is the RAW nested array — reference-equal to the source.
    expect(found!.value).toBe(item['features'])

    // Saving with a full new nested array bubbles to the OUTER list
    // commit exactly once.
    const replacement = [{ _id: 'fNew', label: 'new', included: false }]
    found!.onSave(replacement)
    expect(commit).toHaveBeenCalledTimes(1)
    const next = commit.mock.calls[0]![0] as ReadonlyArray<ListItem<typeof schema>>
    const tierA = next[0]! as unknown as { readonly features: unknown }
    expect(tierA.features).toBe(replacement)
  })

  it('returns undefined for a deeper walk into a nested list (the inner EditableList owns those leaves)', () => {
    // `features[1].label` does NOT resolve through the outer ItemCard's
    // dispatcher — the wrapped nested-list field is an OBJECT (not an
    // array), so `findWrappedFieldByPath` halts at the container hop.
    // This is the correct routing under the new design: inner-leaf
    // saves are caught by the inner EditableList's per-item
    // SaveProvider before they reach the outer dispatcher.
    const schema = {
      features: ListField({ label: richTextField }),
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'tier-a',
      features: [{ _id: 'f0', label: 'only' }],
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features[0].label')).toBeUndefined()
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features[5].label')).toBeUndefined()
  })

  it('three-level nested lists also resolve only at the top hop on the OUTER item', () => {
    // Each level exposes its own wrapped nested-list field through its
    // own EditableList instance; the outer ItemCard never has to walk
    // through more than one hop.
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
          y: [{ _id: 'y0', z: [{ _id: 'z0', deep: 'a' }] }],
        },
      ],
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())

    // One-hop walk on the OUTER item resolves to the top-level nested-list
    // field `x` — that's the route an inner-x EditableList's commit takes.
    const xFound = findWrappedFieldByPath(wrapped as Record<string, unknown>, 'x')
    expect(xFound).toBeDefined()
    expect(xFound!.origin.fieldPath).toBe('tiers[0].x')

    // Deeper walks from the OUTER item return undefined.
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'x[0].y[0].z[0].deep')).toBeUndefined()
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'x[0].y')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findWrappedFieldByPath — malformed paths
// ---------------------------------------------------------------------------

describe('findWrappedFieldByPath — malformed input', () => {
  it('rejects an unbracketed container hop', () => {
    const schema = {
      features: ListField({ label: richTextField }),
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'tier-a',
      features: [{ _id: 'f0', label: 'x' }],
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    // No bracket on the container hop; not a path the wrap could ever
    // produce, but the helper must not throw.
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features.label')).toBeUndefined()
  })

  it('rejects a leaf segment with a bracket index (no field today has primitive-array shape)', () => {
    const schema = { title: textField } satisfies SectionSchema
    const item = makeItem<typeof schema>({ _id: 'a', title: 'x' })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'title[0]')).toBeUndefined()
  })

  it('rejects a non-integer or negative index', () => {
    const schema = {
      features: ListField({ label: richTextField }),
    } satisfies SectionSchema
    const item = makeItem<typeof schema>({
      _id: 'tier-a',
      features: [{ _id: 'f0', label: 'x' }],
    })
    const wrapped = wrapItemForPreview(item, schema, 0, listOrigin, [item], vi.fn())
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features[abc].label')).toBeUndefined()
    expect(findWrappedFieldByPath(wrapped as Record<string, unknown>, 'features[-1].label')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// findWrappedFieldByPath — slot-wrapped containers (sub-task 3 contract)
// ---------------------------------------------------------------------------
//
// `wrapItemForPreview` does not pre-wrap nested-list items today (the
// inner `<EditableList>` does its own per-item wrap), so the existing
// helper deeper-walk tests above resolve to `undefined`. But the
// helper's docstring (`x[0].y[1].z[2].deep` example) promises that
// when a CALLER hands a slot-wrapped tree whose nested lists DO carry
// wrapped items, multi-segment lookups walk through. This test exercises
// that contract directly: build an outer wrapped item where the
// `features` arm is the post-sub-task-3 shape
// `EditableSlot<'list', PreviewFieldLike<Array>>` (i.e. `{ value: { __agntcmsPreview, value: [item], … } }`)
// and the inner item carries a wrapped `label` field with an `onSave`
// closure. Pre-fix: the container hop sees the slot wrapper, fails
// `Array.isArray`, returns `undefined`. Post-fix: the helper unwraps
// slot + preview wrapper at the hop, walks into the array, and returns
// the inner-leaf wrapped field with its `onSave`.

describe('findWrappedFieldByPath — slot-wrapped container hops', () => {
  it('walks through `EditableSlot<"list", PreviewFieldLike<Array>>` to reach an inner-leaf wrapped field', () => {
    // Inner-leaf wrapped field — the same shape `wrapItemForPreview`
    // produces for `text`/`richText` fields: PreviewFieldLike + onSave.
    const innerLeafSave = vi.fn()
    const innerLeafWrapped = {
      __agntcmsPreview: true as const,
      value: 'inner label',
      origin: {
        pageSlug: 'home',
        sectionId: 's-features',
        fieldPath: 'tiers[0].features[0].label',
        source: 'draft' as const,
        revision: 'r0',
      },
      onSave: innerLeafSave,
    }
    // Inner item — its `label` field is slot-wrapped (sub-task 3 shape:
    // `EditableSlot<'richText', string>` whose `.value` carries the
    // inline-editable PreviewFieldLike).
    const innerItem = {
      _id: 'f0',
      label: { value: innerLeafWrapped },
    }
    // Outer item with a slot-wrapped `features` field. The slot's
    // `.value` is the PreviewFieldLike for the LIST as a whole; that
    // wrapper's `.value` is the array of (slot-wrapped) inner items.
    const outerWrapped = {
      _id: 'tier-a',
      features: {
        value: {
          __agntcmsPreview: true as const,
          value: [innerItem],
          origin: {
            pageSlug: 'home',
            sectionId: 's-features',
            fieldPath: 'tiers[0].features',
            source: 'draft' as const,
            revision: 'r0',
          },
          onSave: vi.fn(),
        },
      },
    }

    const found = findWrappedFieldByPath(outerWrapped as Record<string, unknown>, 'features[0].label')
    expect(found).toBeDefined()
    expect(found!.value).toBe('inner label')
    expect(found!.origin.fieldPath).toBe('tiers[0].features[0].label')
    found!.onSave('NEW')
    expect(innerLeafSave).toHaveBeenCalledTimes(1)
    expect(innerLeafSave).toHaveBeenCalledWith('NEW')
  })

  it('returns undefined when a slot-wrapped container resolves to an inner item that is missing the leaf', () => {
    // Same shape, but the inner item has no `label` field at all — the
    // walk completes the container hop, then the leaf check fails
    // (`cursor['label']` is undefined). The helper must not throw.
    const outerWrapped = {
      _id: 'tier-a',
      features: {
        value: {
          __agntcmsPreview: true as const,
          value: [{ _id: 'f0' }], // no `label`
          origin: {
            pageSlug: 'home',
            sectionId: 's-features',
            fieldPath: 'tiers[0].features',
            source: 'draft' as const,
            revision: 'r0',
          },
          onSave: vi.fn(),
        },
      },
    }
    expect(
      findWrappedFieldByPath(outerWrapped as Record<string, unknown>, 'features[0].label'),
    ).toBeUndefined()
  })
})

// Image typing sanity — the helper returns a generic wrapped field; the
// caller casts the value to the appropriate kind.
const _imageValueTypeCheck = (): ImageValue => ({ filename: '', alt: '' })
void _imageValueTypeCheck
