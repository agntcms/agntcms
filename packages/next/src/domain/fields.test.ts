import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  TextField,
  RichTextField,
  ImageField,
  VideoField,
  ReferenceField,
  LinkField,
  ButtonField,
  NumberField,
  BooleanField,
  SelectField,
  ListField,
  type ButtonValue,
  type FieldDescriptor,
  type FieldKind,
  type ImageValue,
  type LinkValue,
  type FieldValueFor,
  type ListItem,
  type VideoValue,
} from './index'

// This function exists to lock the closed set of field descriptors at COMPILE
// TIME. If someone adds a new variant to `FieldDescriptor` without updating
// this switch, the `default` branch will fail to narrow `f` to `never`, and
// `assertNever(f)` will become a type error. That is the whole point: a
// silent gap in exhaustive handling downstream (editable components, storage
// serialization, etc.) is turned into a compile error here at the domain
// level.
function assertNever(value: never): never {
  throw new Error(`unexpected field descriptor: ${JSON.stringify(value)}`)
}

function kindOf(f: FieldDescriptor): FieldKind {
  switch (f.kind) {
    case 'text':
      return 'text'
    case 'richText':
      return 'richText'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'reference':
      return 'reference'
    case 'link':
      return 'link'
    case 'button':
      return 'button'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'select':
      return 'select'
    case 'list':
      return 'list'
    default:
      return assertNever(f)
  }
}

describe('FieldDescriptor closed union', () => {
  it('exposes one singleton per simple variant with the correct brand', () => {
    expect(TextField.kind).toBe('text')
    expect(RichTextField.kind).toBe('richText')
    expect(ImageField.kind).toBe('image')
    expect(VideoField.kind).toBe('video')
    expect(ReferenceField.kind).toBe('reference')
    expect(LinkField.kind).toBe('link')
    expect(NumberField.kind).toBe('number')
    expect(BooleanField.kind).toBe('boolean')
  })

  it('SelectField factory produces a select descriptor carrying its options', () => {
    const s = SelectField([
      { value: 'sm', label: 'Small' },
      { value: 'lg', label: 'Large' },
    ])
    expect(s.kind).toBe('select')
    expect(s.options).toEqual([
      { value: 'sm', label: 'Small' },
      { value: 'lg', label: 'Large' },
    ])
    // No `default` provided → key absent (exactOptionalPropertyTypes).
    expect('default' in s).toBe(false)
  })

  it('SelectField factory carries an explicit default when provided', () => {
    const s = SelectField(
      [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      { default: 'b' },
    )
    expect(s.default).toBe('b')
  })

  it('ListField factory produces a list descriptor carrying its itemSchema', () => {
    const l = ListField({ title: TextField, body: RichTextField })
    expect(l.kind).toBe('list')
    expect(l.itemSchema).toEqual({ title: TextField, body: RichTextField })
    expect('min' in l).toBe(false)
    expect('max' in l).toBe(false)
  })

  it('ListField factory respects min/max bounds', () => {
    const l = ListField({ title: TextField }, { min: 1, max: 5 })
    expect(l.min).toBe(1)
    expect(l.max).toBe(5)
  })

  it('ListField factory carries an explicit `default` seed array when provided', () => {
    // The default lets schema authors say "every fresh tier comes with
    // these two feature rows pre-filled". The descriptor preserves the
    // array verbatim; per-item `_id` regeneration happens at editor
    // build-time (buildBlankItem), not here.
    const l = ListField(
      { label: TextField, included: BooleanField },
      { default: [{ label: 'A', included: true }, { label: 'B', included: false }] },
    )
    expect(l.default).toEqual([
      { label: 'A', included: true },
      { label: 'B', included: false },
    ])
  })

  it('ListField factory omits `default` from the descriptor when not provided', () => {
    // exactOptionalPropertyTypes contract: undefined opt → key absent.
    const l = ListField({ label: TextField })
    expect('default' in l).toBe(false)
  })

  it('a switch over FieldDescriptor narrows exhaustively', () => {
    // Runtime side of the compile-time exhaustiveness check. If the switch in
    // `kindOf` ever stops being exhaustive, typecheck fails first, and this
    // test becomes unreachable — which is the desired failure mode.
    expect(kindOf(TextField)).toBe('text')
    expect(kindOf(RichTextField)).toBe('richText')
    expect(kindOf(ImageField)).toBe('image')
    expect(kindOf(VideoField)).toBe('video')
    expect(kindOf(ReferenceField)).toBe('reference')
    expect(kindOf(LinkField)).toBe('link')
    expect(kindOf(ButtonField([{ value: 'primary', label: 'Primary' }]))).toBe('button')
    expect(kindOf(NumberField)).toBe('number')
    expect(kindOf(BooleanField)).toBe('boolean')
    expect(kindOf(SelectField([{ value: 'a', label: 'A' }]))).toBe('select')
    expect(kindOf(ListField({ title: TextField }))).toBe('list')
  })

  it('FieldKind equals the literal union of every descriptor kind', () => {
    expectTypeOf<FieldKind>().toEqualTypeOf<
      | 'text'
      | 'richText'
      | 'image'
      | 'video'
      | 'reference'
      | 'link'
      | 'button'
      | 'number'
      | 'boolean'
      | 'select'
      | 'list'
    >()
  })

  it('each singleton has its specific descriptor type', () => {
    expectTypeOf(TextField).toEqualTypeOf<TextField>()
    expectTypeOf(RichTextField).toEqualTypeOf<RichTextField>()
    expectTypeOf(ImageField).toEqualTypeOf<ImageField>()
    expectTypeOf(VideoField).toEqualTypeOf<VideoField>()
    expectTypeOf(ReferenceField).toEqualTypeOf<ReferenceField>()
    expectTypeOf(LinkField).toEqualTypeOf<LinkField>()
    expectTypeOf(NumberField).toEqualTypeOf<NumberField>()
    expectTypeOf(BooleanField).toEqualTypeOf<BooleanField>()
  })

  it('FieldDescriptor is assignable from every variant', () => {
    expectTypeOf<TextField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<RichTextField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<ImageField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<VideoField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<ReferenceField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<LinkField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<NumberField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<BooleanField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<SelectField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<ListField>().toMatchTypeOf<FieldDescriptor>()
    expectTypeOf<ButtonField>().toMatchTypeOf<FieldDescriptor>()
  })

  // ImageField.default is typed as ImageValue (`{ filename, alt }`). Alt is
  // collected per-usage in the picker modal and lives in the section's data;
  // there is no on-disk sidecar. The descriptor-level type lock forces the
  // picker + EditableImage to agree on the shape at compile time.
  it('ImageField.default is typed as ImageValue', () => {
    expectTypeOf<NonNullable<ImageField['default']>>().toEqualTypeOf<ImageValue>()
  })

  it('ImageValue has readonly filename and alt strings', () => {
    expectTypeOf<ImageValue>().toEqualTypeOf<{
      readonly filename: string
      readonly alt: string
    }>()
  })

  it('LinkValue is a discriminated union over internal/external/email/phone', () => {
    // The new shape (Storyblok-inspired) splits page references,
    // external URLs, email addresses, and phone numbers at the type
    // level so the editor can render the right sub-form per branch
    // (page picker / URL input / email input / phone input). See
    // `domain/fields.ts` LinkValue header for rationale.
    expectTypeOf<LinkValue>().toEqualTypeOf<
      | {
          readonly type: 'internal'
          readonly slug: string
          readonly label: string
        }
      | {
          readonly type: 'external'
          readonly url: string
          readonly label: string
        }
      | {
          readonly type: 'email'
          readonly email: string
          readonly label: string
        }
      | {
          readonly type: 'phone'
          readonly phone: string
          readonly label: string
        }
    >()
  })

  it('FieldValueFor maps each descriptor to the right runtime value', () => {
    expectTypeOf<FieldValueFor<TextField>>().toEqualTypeOf<string>()
    expectTypeOf<FieldValueFor<RichTextField>>().toEqualTypeOf<string>()
    expectTypeOf<FieldValueFor<ImageField>>().toEqualTypeOf<ImageValue>()
    expectTypeOf<FieldValueFor<VideoField>>().toEqualTypeOf<VideoValue>()
    expectTypeOf<FieldValueFor<LinkField>>().toEqualTypeOf<LinkValue>()
    expectTypeOf<FieldValueFor<NumberField>>().toEqualTypeOf<number>()
    expectTypeOf<FieldValueFor<BooleanField>>().toEqualTypeOf<boolean>()
    expectTypeOf<FieldValueFor<SelectField>>().toEqualTypeOf<string>()
  })

  // VideoField: aspectRatio is genuinely optional. The closed string-literal
  // union (no 'auto' member) is the contract — absence is the auto signal,
  // and the editor / iframe both fall back to 16:9 in that case.
  it('VideoField.default is typed as VideoValue', () => {
    expectTypeOf<NonNullable<VideoField['default']>>().toEqualTypeOf<VideoValue>()
  })

  it('VideoValue has a required url, optional aspectRatio union, and optional plain-text caption', () => {
    expectTypeOf<VideoValue>().toEqualTypeOf<{
      readonly url: string
      readonly aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
      readonly caption?: string
    }>()
  })

  // `caption` is optional on purpose — older content without a caption
  // must continue to type-check. The picker modal edits caption inline
  // with URL + ratio; absence is the canonical "no caption" signal.
  it('VideoValue accepts a caption when provided', () => {
    const v: VideoValue = {
      url: 'https://youtu.be/abc',
      caption: 'A 2-minute walkthrough',
    }
    expect(v.caption).toBe('A 2-minute walkthrough')
  })

  it('VideoValue accepts an omitted caption (existing content stays valid)', () => {
    const v: VideoValue = { url: 'https://youtu.be/abc', aspectRatio: '16:9' }
    expect('caption' in v).toBe(false)
  })

  // ---- ButtonField --------------------------------------------------------

  it('ButtonField factory carries the variants list verbatim', () => {
    const b = ButtonField([
      { value: 'primary', label: 'Primary' },
      { value: 'secondary', label: 'Secondary' },
    ])
    expect(b.kind).toBe('button')
    expect(b.variants).toEqual([
      { value: 'primary', label: 'Primary' },
      { value: 'secondary', label: 'Secondary' },
    ])
    // No `default` provided → key absent (exactOptionalPropertyTypes).
    expect('default' in b).toBe(false)
  })

  it('ButtonField factory carries an explicit default when provided', () => {
    const b = ButtonField(
      [
        { value: 'primary', label: 'Primary' },
        { value: 'secondary', label: 'Secondary' },
      ],
      { default: { label: 'Get started', variant: 'primary' } },
    )
    expect(b.default).toEqual({ label: 'Get started', variant: 'primary' })
  })

  it('ButtonValue is `{ label, variant, link? }` with optional link', () => {
    // Required keys present, no link → valid (a non-navigating CTA).
    const v1: ButtonValue = { label: 'Open', variant: 'primary' }
    expect('link' in v1).toBe(false)
    // With a link (any LinkValue branch) → valid.
    const v2: ButtonValue = {
      label: 'Sign up',
      variant: 'secondary',
      link: { type: 'internal', slug: 'signup', label: 'Sign up' },
    }
    expect(v2.link).toBeDefined()
  })

  it('FieldValueFor maps ButtonField to ButtonValue', () => {
    expectTypeOf<FieldValueFor<ButtonField>>().toEqualTypeOf<ButtonValue>()
  })

  it('FieldValueFor recurses into List itemSchema', () => {
    // The brief calls out a concrete recursion test to prove the generic
    // ListField<S>.itemSchema flows all the way through into the value
    // type. Schema with text + richText + link nested under a list.
    type ItemSchema = {
      readonly title: TextField
      readonly body: RichTextField
      readonly link: LinkField
    }
    type Field = ListField<ItemSchema>

    // The recursive item shape: per-field record + opaque _id.
    type Item = {
      readonly title: string
      readonly body: string
      readonly link: LinkValue
    } & { readonly _id: string }

    expectTypeOf<FieldValueFor<Field>>().toEqualTypeOf<ReadonlyArray<Item>>()
    expectTypeOf<ListItem<ItemSchema>>().toEqualTypeOf<Item>()
  })
})
