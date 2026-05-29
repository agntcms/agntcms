// Unit tests for `wrapAsSlot` and the `EditableSlot<K, V>` / `SlotItem<S>`
// type machinery (EDITABILITY_DESIGN.md sub-task 1).
//
// The runtime behaviour of `wrapAsSlot` is intentionally trivial — it
// returns `{ value }`. The load-bearing checks are at the type level:
//
//   1. Every editable kind round-trips through a slot of the right kind.
//   2. ReferenceField stays raw (decision #3).
//   3. ListField items recurse via `SlotItem<S>` so nested raw renders
//      are also TS errors.
//   4. `read(slot)` collapses both arms of `slot.value` (bare V, or
//      PreviewField<V>) to a bare V.
//   5. The CRITICAL `@ts-expect-error` test demonstrates that putting a
//      slot into a JSX text position fails typecheck. This is the whole
//      point of the design.

import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  ButtonValue,
  ImageValue,
  LinkValue,
  VideoValue,
} from '../domain/fields'
import {
  BooleanField,
  ButtonField,
  ImageField,
  LinkField,
  ListField,
  NumberField,
  ReferenceField,
  RichTextField,
  SelectField,
  TextField,
  VideoField,
} from '../domain/fields'
import type { ReferenceValue } from '../domain/schema'
import { read } from '../react/editable/read'
import type { PreviewFieldLike } from '../react/editable/isPreviewField'
import {
  defineSection,
  type DataOf,
  type EditableSlot,
  type SlotItem,
} from './defineSection'
import { wrapAsSlot } from './wrapAsSlot'

// ---------------------------------------------------------------------------
// 1. wrapAsSlot — runtime shape per kind
// ---------------------------------------------------------------------------

describe('wrapAsSlot — runtime shape', () => {
  it('wraps a text value as EditableSlot<"text", string>', () => {
    const slot = wrapAsSlot('text', 'Hello')
    // The phantom brand has no runtime presence — only `value` is observable.
    expect(slot.value).toBe('Hello')
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'text', string>>()
  })

  it('wraps a richText value as EditableSlot<"richText", string>', () => {
    const slot = wrapAsSlot('richText', '# Heading')
    expect(slot.value).toBe('# Heading')
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'richText', string>>()
  })

  it('wraps an ImageValue as EditableSlot<"image", ImageValue>', () => {
    const img: ImageValue = { filename: 'hero.png', alt: 'Hero' }
    const slot = wrapAsSlot('image', img)
    expect(slot.value).toEqual(img)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'image', ImageValue>>()
  })

  it('wraps a VideoValue as EditableSlot<"video", VideoValue>', () => {
    const video: VideoValue = { url: 'https://youtu.be/abc' }
    const slot = wrapAsSlot('video', video)
    expect(slot.value).toEqual(video)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'video', VideoValue>>()
  })

  it('wraps a LinkValue as EditableSlot<"link", LinkValue>', () => {
    const link: LinkValue = { type: 'internal', slug: 'about', label: 'About' }
    const slot = wrapAsSlot('link', link)
    expect(slot.value).toEqual(link)
    // `toEqualTypeOf` does not reason cleanly about discriminated-union
    // slot values through the unique-symbol brand. Forward
    // assignability covers the contract: the inferred slot must be
    // accepted by an `EditableSlot<'link', LinkValue>` binding.
    const ok: EditableSlot<'link', LinkValue> = slot
    expect(ok.value).toEqual(link)
  })

  it('wraps a ButtonValue as EditableSlot<"button", ButtonValue>', () => {
    const btn: ButtonValue = { label: 'Click me', variant: 'primary' }
    const slot = wrapAsSlot('button', btn)
    expect(slot.value).toEqual(btn)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'button', ButtonValue>>()
  })

  it('wraps a number as EditableSlot<"number", number>', () => {
    const slot = wrapAsSlot('number', 42)
    expect(slot.value).toBe(42)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'number', number>>()
  })

  it('wraps a boolean as EditableSlot<"boolean", boolean>', () => {
    const slot = wrapAsSlot('boolean', true)
    expect(slot.value).toBe(true)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'boolean', boolean>>()
  })

  it('wraps a select value (string) as EditableSlot<"select", string>', () => {
    const slot = wrapAsSlot('select', 'option-a')
    expect(slot.value).toBe('option-a')
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'select', string>>()
  })

  it('wraps a list value as EditableSlot<"list", ReadonlyArray<...>>', () => {
    type Item = { readonly _id: string; readonly title: string }
    const list: ReadonlyArray<Item> = [
      { _id: 'a', title: 'first' },
      { _id: 'b', title: 'second' },
    ]
    const slot = wrapAsSlot('list', list)
    expect(slot.value).toEqual(list)
    expectTypeOf(slot).toEqualTypeOf<EditableSlot<'list', ReadonlyArray<Item>>>()
  })

  it('passes a preview-wrapped value through unchanged in slot.value', () => {
    // wrapAsSlot does NOT distinguish bare V from PreviewField<V> — it
    // simply stores whatever it is given. The editable component (or
    // `read()`) is responsible for unwrapping. This is the
    // SectionRenderer contract: in preview mode it passes
    // `PreviewField<V>`, in published mode it passes `V`.
    const wrappedValue: PreviewFieldLike<string> = {
      __agntcmsPreview: true,
      value: 'hello',
      origin: {
        pageSlug: 'home',
        sectionId: 'hero',
        fieldPath: 'title',
        source: 'draft',
        revision: 'r1',
      },
    }
    const slot = wrapAsSlot('text', wrappedValue)
    // Runtime: the preview wrapper sits inside slot.value.
    expect(slot.value).toBe(wrappedValue)
  })
})

// ---------------------------------------------------------------------------
// 2. FieldDataType — raw cases (decision #3)
// ---------------------------------------------------------------------------

describe('FieldDataType — raw passthrough', () => {
  it('ReferenceField stays raw as ReferenceValue (decision #3)', () => {
    type Schema = { related: typeof ReferenceField }
    expectTypeOf<DataOf<Schema>>().toEqualTypeOf<{
      readonly related: ReferenceValue
    }>()
  })
})

// ---------------------------------------------------------------------------
// 3. SlotItem<S> — recursive list-item shape
// ---------------------------------------------------------------------------

describe('SlotItem<S> — list items are slot-typed (decision #2)', () => {
  it('a list of items with a TextField field produces slot-typed items', () => {
    // The whole point of `SlotItem<S>` is that a section author writing
    // `<span>{item.text}</span>` inside `<EditableList renderItem={...}>`
    // gets the SAME compile error as a raw `{title}` at the section level.
    //
    // `expectTypeOf<...>()` cannot directly equality-check a type that
    // carries a `unique symbol` brand (like `EditableSlot<K, V>`'s
    // `[__slot]: K`) because the symbol is module-private and external
    // type sites cannot name it. Instead, we use a positive
    // assignability check: a hand-written shape that includes the slot
    // for the editable field and `_id` must be assignable IN BOTH
    // DIRECTIONS to `SlotItem<S>`. This is the same compromise the
    // T-007 type tests use for the `__agntcmsPreview` brand.
    const itemSchema = { text: TextField } as const
    type ItemSchema = typeof itemSchema
    type Item = SlotItem<ItemSchema>

    // Forward: `Item` is assignable to a structurally-matching shape
    // (the slot brand widens to its `value` interface).
    type Forward = Item extends {
      readonly _id: string
      readonly text: EditableSlot<'text', string>
    }
      ? true
      : false
    expectTypeOf<Forward>().toEqualTypeOf<true>()

    // Reverse: the matching shape is assignable to `Item`. Because the
    // brand is unique-symbol-keyed, only `EditableSlot` values from
    // inside the same module are accepted — but the brand TYPE flows
    // through the `EditableSlot<'text', string>` reference, so
    // assignability holds.
    type Backward = {
      readonly _id: string
      readonly text: EditableSlot<'text', string>
    } extends Item
      ? true
      : false
    expectTypeOf<Backward>().toEqualTypeOf<true>()
  })

  it('FieldDataType<ListField<S>> is EditableSlot<"list", ReadonlyArray<SlotItem<S>>>', () => {
    const itemSchema = { title: TextField, image: ImageField } as const
    const list = ListField(itemSchema)
    type ListType = typeof list
    type Resolved = DataOf<{ items: ListType }>['items']

    // Bidirectional assignability check (see comment above for why
    // direct `toEqualTypeOf` cannot name the unique-symbol brand).
    type Expected = EditableSlot<'list', ReadonlyArray<SlotItem<typeof itemSchema>>>
    type Forward = Resolved extends Expected ? true : false
    type Backward = Expected extends Resolved ? true : false
    expectTypeOf<Forward>().toEqualTypeOf<true>()
    expectTypeOf<Backward>().toEqualTypeOf<true>()
  })

  it('nested lists recurse: an item with a ListField produces a slot-typed nested list', () => {
    // Recursion check. A list whose item schema contains another list
    // must produce `EditableSlot<'list', ReadonlyArray<SlotItem<NS>>>`
    // for the nested arm — same structure all the way down.
    const innerSchema = { tag: TextField } as const
    const inner = ListField(innerSchema)
    const outerSchema = { tags: inner } as const
    type OuterItem = SlotItem<typeof outerSchema>

    type Expected = {
      readonly _id: string
      readonly tags: EditableSlot<'list', ReadonlyArray<SlotItem<typeof innerSchema>>>
    }
    type Forward = OuterItem extends Expected ? true : false
    type Backward = Expected extends OuterItem ? true : false
    expectTypeOf<Forward>().toEqualTypeOf<true>()
    expectTypeOf<Backward>().toEqualTypeOf<true>()
  })
})

// ---------------------------------------------------------------------------
// 4. read(slot) — round-trip
// ---------------------------------------------------------------------------

describe('read(slot)', () => {
  it('returns the bare value when slot.value is bare', () => {
    const slot = wrapAsSlot('text', 'Hello')
    const out = read(slot)
    expect(out).toBe('Hello')
    expectTypeOf(out).toEqualTypeOf<string>()
  })

  it('unwraps the preview-mode wrapper to the bare value', () => {
    const wrappedValue: PreviewFieldLike<string> = {
      __agntcmsPreview: true,
      value: 'Hello',
      origin: {
        pageSlug: 'home',
        sectionId: 'hero',
        fieldPath: 'title',
        source: 'draft',
        revision: 'r1',
      },
    }
    const slot = wrapAsSlot('text', wrappedValue)
    expect(read(slot)).toBe('Hello')
  })

  it('round-trips ImageValue through wrapAsSlot + read', () => {
    const img: ImageValue = { filename: 'hero.png', alt: 'Hero' }
    const slot = wrapAsSlot('image', img)
    expect(read(slot)).toEqual(img)
  })

  it('round-trips LinkValue through wrapAsSlot + read', () => {
    const link: LinkValue = {
      type: 'external',
      url: 'https://example.com',
      label: 'Example',
    }
    const slot = wrapAsSlot('link', link)
    expect(read(slot)).toEqual(link)
  })
})

// ---------------------------------------------------------------------------
// 5. CRITICAL — slots are NOT assignable to React.ReactNode
// ---------------------------------------------------------------------------
//
// This is the load-bearing assertion of the whole design. If it
// regresses, the package regresses to a state where a raw
// `<h1>{title}</h1>` silently breaks inline editing. Quote it verbatim
// in any review:
//
//   const slot: EditableSlot<'text', string> = ...
//   // @ts-expect-error — EditableSlot is not assignable to ReactNode
//   const _node: ReactNode = slot
//
// The `@ts-expect-error` directive itself is checked by the compiler:
// if the assignment ever became valid (a regression), the directive
// would be flagged as an unused error suppression and the build would
// fail.

describe('CRITICAL — EditableSlot is not assignable to ReactNode', () => {
  it('a raw EditableSlot fails to satisfy React.ReactNode', () => {
    // The runtime body of this test is irrelevant — the test exists
    // to anchor the `@ts-expect-error` directive below at typecheck
    // time. We assert `true` so the suite reports green when the
    // directive correctly fires (i.e., when the assignment is the TS
    // error the design promises).

    type ReactNode =
      | string
      | number
      | boolean
      | null
      | undefined
      | { readonly type: unknown; readonly props: unknown; readonly key: unknown }
      | ReadonlyArray<ReactNode>

    // A locally-typed ReactNode is structurally what `React.ReactNode`
    // accepts (string / number / boolean / null / undefined / element /
    // array). We deliberately avoid a `react` import here because
    // `sections/` may not depend on React (file header of
    // defineSection.ts). The structural fragment is enough to prove the
    // brand blocks the assignment — strings / numbers / booleans are the
    // arms an `EditableSlot<…>` could plausibly collide with.

    const slot = wrapAsSlot('text', 'Hello')

    // @ts-expect-error — EditableSlot<'text', string> is not assignable
    // to ReactNode. This is the load-bearing assertion of
    // EDITABILITY_DESIGN.md sub-task 1: the phantom `[__slot]: K` brand
    // structurally distinguishes the slot from every JSX-renderable
    // type. If this directive ever stops firing, the design has
    // regressed and `<h1>{title}</h1>` would silently break inline
    // editing again.
    const node: ReactNode = slot
    void node // reference the binding so tsc doesn't flag it unused

    expect(true).toBe(true)
  })

  it('a section component cannot render a slot directly via a string-typed return', () => {
    // Symmetric check: a `string`-typed binding rejects a slot. This
    // covers the `<h1>{slot}</h1>` shape — JSX text positions accept
    // strings/numbers/etc., and the slot brand blocks every one of
    // them.
    const slot = wrapAsSlot('text', 'Hello')

    // @ts-expect-error — EditableSlot<'text', string> is not assignable
    // to a bare string binding.
    const s: string = slot
    void s

    expect(true).toBe(true)
  })

  it('the matching slot kind IS accepted (positive sanity check)', () => {
    // Positive: a slot-typed binding accepts a slot of the same kind.
    // If this test fails, the brand is too restrictive (the editable
    // components would not be able to consume their own slot type).
    const slot = wrapAsSlot('text', 'Hello')
    const ok: EditableSlot<'text', string> = slot
    expect(ok.value).toBe('Hello')
  })

  // ---------------------------------------------------------------------------
  // Sub-task 3 gate: a raw item-field render INSIDE renderItem is a TS error
  // ---------------------------------------------------------------------------
  //
  // Decision #2 of EDITABILITY_DESIGN.md says ListField items recurse via
  // `SlotItem<S>`, so an author who writes `<span>{item.text}</span>`
  // inside `<EditableList renderItem>` gets the SAME TypeScript error as
  // a raw `<h1>{title}</h1>` at the section level. This test anchors that
  // gate at typecheck time. If the directive ever stops firing, the
  // sub-task-3 invariant has regressed and inline editing for list items
  // would silently break exactly the way the design promised to prevent.
  it('a raw item-field render fails to satisfy React.ReactNode (sub-task 3 gate)', () => {
    type ReactNode =
      | string
      | number
      | boolean
      | null
      | undefined
      | { readonly type: unknown; readonly props: unknown; readonly key: unknown }
      | ReadonlyArray<ReactNode>

    // Build a `SlotItem<S>` shape for a list whose items have a TextField
    // field. We construct the value through `wrapAsSlot('text', ...)` so
    // the synthetic item is a real slot — exactly what
    // `<EditableList renderItem>` hands the section author.
    const item: SlotItem<{ text: typeof TextField }> = {
      _id: 'a',
      text: wrapAsSlot('text', 'Hello'),
    }

    // @ts-expect-error — `item.text` is `EditableSlot<'text', string>`,
    // not assignable to `ReactNode`. This is the load-bearing assertion
    // for EDITABILITY_DESIGN.md decision #2: raw renders inside
    // `renderItem` are caught at typecheck time, not by a heuristic.
    // Pretend we're in JSX: a raw `{item.text}` text-position render is
    // structurally identical to assigning to a ReactNode binding.
    const node: ReactNode = item.text
    void node

    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. defineSection — a section component receives slot-typed props
// ---------------------------------------------------------------------------
//
// Smoke check that `DataOf<S>` flows through `defineSection`'s
// `SectionComponent<S>` constraint. Failures here surface in
// `defineSection.test.ts` already; we lock the integration end-to-end
// once.

describe('defineSection accepts a slot-typed component', () => {
  it('a Hero component with slot-typed props compiles', () => {
    const Hero = defineSection({
      name: 'Hero',
      schema: { title: TextField, image: ImageField },
      component: (props: {
        title: EditableSlot<'text', string>
        image: EditableSlot<'image', ImageValue>
      }): null => {
        // read() to prove the helper integrates with the schema-derived shape
        const _t: string = read(props.title)
        const _i: ImageValue = read(props.image)
        void _t
        void _i
        return null
      },
    })
    expect(Hero.name).toBe('Hero')
  })
})

// ---------------------------------------------------------------------------
// 7. Misc kinds covered for completeness (number, boolean, select)
// ---------------------------------------------------------------------------

describe('FieldDataType — misc kinds', () => {
  it('NumberField → EditableSlot<"number", number>', () => {
    expectTypeOf<DataOf<{ n: typeof NumberField }>>().toEqualTypeOf<{
      readonly n: EditableSlot<'number', number>
    }>()
  })

  it('BooleanField → EditableSlot<"boolean", boolean>', () => {
    expectTypeOf<DataOf<{ b: typeof BooleanField }>>().toEqualTypeOf<{
      readonly b: EditableSlot<'boolean', boolean>
    }>()
  })

  it('SelectField → EditableSlot<"select", string>', () => {
    const select = SelectField([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ])
    expectTypeOf<DataOf<{ s: typeof select }>>().toEqualTypeOf<{
      readonly s: EditableSlot<'select', string>
    }>()
  })

  it('LinkField → EditableSlot<"link", LinkValue>', () => {
    expectTypeOf<DataOf<{ l: typeof LinkField }>>().toEqualTypeOf<{
      readonly l: EditableSlot<'link', LinkValue>
    }>()
  })

  it('RichTextField → EditableSlot<"richText", string>', () => {
    expectTypeOf<DataOf<{ r: typeof RichTextField }>>().toEqualTypeOf<{
      readonly r: EditableSlot<'richText', string>
    }>()
  })

  it('VideoField → EditableSlot<"video", VideoValue>', () => {
    expectTypeOf<DataOf<{ v: typeof VideoField }>>().toEqualTypeOf<{
      readonly v: EditableSlot<'video', VideoValue>
    }>()
  })

  it('ButtonField → EditableSlot<"button", ButtonValue>', () => {
    const btn = ButtonField([
      { value: 'primary', label: 'Primary' },
      { value: 'ghost', label: 'Ghost' },
    ])
    expectTypeOf<DataOf<{ b: typeof btn }>>().toEqualTypeOf<{
      readonly b: EditableSlot<'button', ButtonValue>
    }>()
  })
})
