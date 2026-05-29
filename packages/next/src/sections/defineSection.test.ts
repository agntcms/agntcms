import { describe, it, expect, expectTypeOf } from 'vitest'
import { TextField, ImageField, ReferenceField, RichTextField, VideoField } from '../domain/fields'
import type { ImageValue, VideoValue } from '../domain/fields'
import type { ReferenceValue } from '../domain/schema'
import {
  defineSection,
  type AnySectionDefinition,
  type DataOf,
  type EditableSlot,
  type SectionComponent,
} from './defineSection'

// EDITABILITY_DESIGN.md sub-task 1: editable kinds (text, richText, image,
// video, link, button, number, boolean, select, list) now resolve through
// `FieldDataType<F>` to `EditableSlot<K, V>` rather than to bare `V`.
// `reference` stays raw (decision #3). The component-prop shapes in the
// fixtures below reflect that.

// The whole point of `defineSection` is COMPILE-TIME: turn a schema /
// component mismatch into a type error at the call site. Runtime behaviour
// is trivial (store-and-return), and the real tests are the `expectTypeOf`
// checks plus the `@ts-expect-error` block further down.

describe('defineSection — runtime behaviour', () => {
  it('stores name, schema and component on the returned definition', () => {
    // The component reads `.value` off each slot to get the bare data.
    // Since the slot's `[__slot]` brand is phantom (never set at runtime),
    // an object literal `{ value: 'hi' }` is structurally adequate as a
    // runtime stand-in — we cast through `unknown` to bridge the
    // type-system-only brand. This is the same bridge `wrapAsSlot` uses.
    const HeroComponent = (props: {
      title: EditableSlot<'text', string>
      image: EditableSlot<'image', ImageValue>
    }): string => {
      const titleValue = props.title.value as string
      const imageValue = props.image.value as ImageValue
      return `${titleValue}|${imageValue.filename}`
    }

    const Hero = defineSection({
      name: 'Hero',
      schema: { title: TextField, image: ImageField },
      component: HeroComponent,
    })

    expect(Hero.name).toBe('Hero')
    expect(Hero.schema.title).toBe(TextField)
    expect(Hero.schema.image).toBe(ImageField)
    expect(Hero.component).toBe(HeroComponent)
    // Calling the stored component returns the expected value — proves the
    // binding is the same function reference, not a wrapped thunk. The
    // double `as unknown as ...` bridges the phantom slot brand at the
    // call site (the brand has no runtime representation).
    const titleSlot = { value: 'hi' } as unknown as EditableSlot<'text', string>
    const imageSlot = {
      value: { filename: 'h.png', alt: 'H' },
    } as unknown as EditableSlot<'image', ImageValue>
    expect(Hero.component({ title: titleSlot, image: imageSlot })).toBe('hi|h.png')
  })

  it('does not interpret or validate the schema at runtime', () => {
    // `defineSection` is declaration metadata, not a parser. The factory
    // must accept any schema shape without looking at values — this test
    // locks that contract (it would catch an accidental runtime validator
    // being introduced in the future).
    const def = defineSection({
      name: 'Anything',
      schema: { a: TextField, b: RichTextField, c: ImageField, d: ReferenceField },
      component: (_props: {
        a: EditableSlot<'text', string>
        b: EditableSlot<'richText', string>
        c: EditableSlot<'image', ImageValue>
        // ReferenceField stays raw — see decision #3.
        d: ReferenceValue
      }): null => null,
    })
    expect(Object.keys(def.schema)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('computes defaults from built-in field kinds', () => {
    const def = defineSection({
      name: 'Hero',
      schema: { title: TextField, body: RichTextField, image: ImageField, related: ReferenceField },
      component: (_props: {
        title: EditableSlot<'text', string>
        body: EditableSlot<'richText', string>
        image: EditableSlot<'image', ImageValue>
        related: ReferenceValue
      }): null => null,
    })

    expect(def.defaults).toEqual({
      title: 'Title',
      body: 'Start writing here...',
      // image built-in default is an ImageValue object — alt is required
      // by the picker, so the placeholder has a non-empty alt to keep a
      // freshly inserted section valid until the author edits it.
      image: { filename: 'placeholder.png', alt: 'Placeholder image' },
      // reference built-in default is a `ReferenceValue` with empty slug,
      // matching the runtime shape `FieldDataType<ReferenceField>` resolves to.
      related: { slug: '' },
    })
  })

  it('VideoField built-in default omits aspectRatio (absence = "auto" = 16:9)', () => {
    // The aspect ratio is genuinely optional — the editor and the
    // rendered iframe both interpret absence as 16:9. Encoding "auto"
    // as the absence of the key (rather than a literal string) keeps
    // VideoValue minimal and matches `exactOptionalPropertyTypes`.
    const def = defineSection({
      name: 'Hero',
      schema: { clip: VideoField },
      component: (_props: { clip: EditableSlot<'video', VideoValue> }): null => null,
    })
    expect(def.defaults.clip).toEqual({ url: '' })
    // Crucially, the key must be absent, not present-as-undefined.
    expect('aspectRatio' in (def.defaults.clip as object)).toBe(false)
  })

  it('uses explicit default from descriptor when provided', () => {
    const def = defineSection({
      name: 'Hero',
      schema: {
        title: { ...TextField, default: 'Hello World' },
        image: { ...ImageField, default: { filename: 'custom.png', alt: 'Custom' } },
      },
      component: (_props: {
        title: EditableSlot<'text', string>
        image: EditableSlot<'image', ImageValue>
      }): null => null,
    })

    expect(def.defaults).toEqual({
      title: 'Hello World',
      image: { filename: 'custom.png', alt: 'Custom' },
    })
  })

  it('passes category through when provided', () => {
    const def = defineSection({
      name: 'WithCategory',
      category: 'Hero',
      schema: { title: TextField },
      component: (_props: { title: EditableSlot<'text', string> }) => null,
    })
    expect(def.category).toBe('Hero')
  })

  it('omits category when not provided', () => {
    const def = defineSection({
      name: 'NoCategory',
      schema: { title: TextField },
      component: (_props: { title: EditableSlot<'text', string> }) => null,
    })
    expect(def.category).toBeUndefined()
  })

  it('round-trips previewData onto the returned definition when provided', () => {
    // `previewData` is picker-cosmetic only — the factory must surface it
    // verbatim so `SectionPickerModal` can merge it over `defaults` for
    // its preview cards. Insertion paths (SectionEditControls,
    // SectionRenderer's wrap, GlobalSlot's wrap, global-handler's create
    // merge) read `defaults`, not `previewData`.
    const sample = {
      title: 'Welcome to the show',
      body: 'A longer rich-text passage that fills the preview card.',
    }
    const def = defineSection({
      name: 'Hero',
      schema: { title: TextField, body: RichTextField },
      component: (_props: {
        title: EditableSlot<'text', string>
        body: EditableSlot<'richText', string>
      }): null => null,
      previewData: sample,
    })
    // Round-trip: same reference, no defensive copy. The factory does no
    // mutation, and the registry is read-only at runtime.
    expect(def.previewData).toBe(sample)
    // Defaults are independent — `previewData` does not pollute them.
    expect(def.defaults).toEqual({ title: 'Title', body: 'Start writing here...' })
  })

  it('omits previewData on the definition when the input did not supply it', () => {
    // Symmetric to the `category` omission test above. The factory uses a
    // conditional spread so `previewData` is ABSENT on the returned
    // object, not present-as-undefined — matches `exactOptionalPropertyTypes`.
    const def = defineSection({
      name: 'Hero',
      schema: { title: TextField },
      component: (_props: { title: EditableSlot<'text', string> }): null => null,
    })
    expect(def.previewData).toBeUndefined()
    expect('previewData' in def).toBe(false)
  })

  it('humanizes camelCase field names in text defaults', () => {
    const def = defineSection({
      name: 'Card',
      schema: { heroTitle: TextField, subHeading: TextField },
      component: (_props: {
        heroTitle: EditableSlot<'text', string>
        subHeading: EditableSlot<'text', string>
      }): null => null,
    })

    expect(def.defaults.heroTitle).toBe('Hero Title')
    expect(def.defaults.subHeading).toBe('Sub Heading')
  })
})

describe('defineSection — type-level contract', () => {
  it('DataOf wraps editable kinds in `EditableSlot<K, V>`; reference stays raw', () => {
    type HeroSchema = {
      title: typeof TextField
      body: typeof RichTextField
      image: typeof ImageField
      related: typeof ReferenceField
    }
    // EDITABILITY_DESIGN.md sub-task 1: editable kinds (text, richText,
    // image, …) map to `EditableSlot<K, V>` so a raw `<h1>{title}</h1>`
    // fails to compile. `ReferenceField` stays raw — references are not
    // inline-editable in v1, so a slot would force a no-op
    // `<EditableReference>` wrapper without UX value (decision #3).
    //
    // History: 0.1.19 mapped `ImageField` to `ImageValue`. 0.1.27 mapped
    // `ReferenceField` to `ReferenceValue`. v0.2 wraps every editable
    // kind with `EditableSlot`, leaving `ReferenceField` as the raw case.
    expectTypeOf<DataOf<HeroSchema>>().toEqualTypeOf<{
      readonly title: EditableSlot<'text', string>
      readonly body: EditableSlot<'richText', string>
      readonly image: EditableSlot<'image', ImageValue>
      readonly related: ReferenceValue
    }>()
  })

  it('SectionComponent<S> is a function taking DataOf<S>', () => {
    type HeroSchema = { title: typeof TextField; image: typeof ImageField }
    expectTypeOf<SectionComponent<HeroSchema>>().parameters.toEqualTypeOf<
      [DataOf<HeroSchema>]
    >()
  })

  it('defineSection infers the precise definition type from a matching component', () => {
    const HeroComponent = (props: {
      title: EditableSlot<'text', string>
      image: EditableSlot<'image', ImageValue>
    }): string => {
      // The slot brand is phantom — at runtime, `value` is the only
      // observable property. We cast through `unknown` to project from
      // the slot type to the bare data the test wants to inspect.
      const titleValue = props.title.value as string
      const imageValue = props.image.value as ImageValue
      return `${titleValue}:${imageValue.filename}`
    }

    const Hero = defineSection({
      name: 'Hero',
      schema: { title: TextField, image: ImageField },
      component: HeroComponent,
    })

    // The schema field stays precise (not widened to SectionSchema).
    expectTypeOf(Hero.schema).toMatchTypeOf<{
      title: typeof TextField
      image: typeof ImageField
    }>()

    // Precise definitions assign to the erased `AnySectionDefinition`
    // carrier, so a heterogeneous registry (readonly AnySectionDefinition[])
    // is well-typed. This is the variance-safe path — see the header of
    // defineSection.ts for why a default-parameterized form does not work.
    expectTypeOf(Hero).toMatchTypeOf<AnySectionDefinition>()
  })

  it('rejects a component whose props do not match the schema', () => {
    // NEGATIVE CASE. If `defineSection`'s constraint on `C` regressed, this
    // call would compile and the `@ts-expect-error` directive would itself
    // become an error ("Unused '@ts-expect-error' directive"). Either way,
    // breaking the compile-time guarantee fails the build.
    const Wrong = (_props: { title: string; heading: string }): null => null

    defineSection({
      name: 'Hero',
      schema: { title: TextField, image: ImageField },
      // @ts-expect-error — component requires `heading`, schema only provides `title` + `image`
      component: Wrong,
    })
  })

  it('rejects a component that expects the wrong runtime type for a field', () => {
    // A component asking for `title: number` contradicts the `Text` descriptor,
    // which maps to `string`. This must be a compile error.
    const Wrong = (_props: {
      title: number
      image: ImageValue
    }): null => null

    defineSection({
      name: 'Hero',
      schema: { title: TextField, image: ImageField },
      // @ts-expect-error — `title: number` conflicts with Text (→ string)
      component: Wrong,
    })
  })

  it('rejects a component that expects a bare string for an image field', () => {
    // 0.1.19: ImageField maps to `ImageValue` (`{ filename, alt }`). A
    // component asking for `image: string` must fail to compile — this
    // guards against a regression to the 0.1.18 bare-filename shape.
    const Wrong = (_props: { image: string }): null => null

    defineSection({
      name: 'Hero',
      schema: { image: ImageField },
      // @ts-expect-error — `image: string` conflicts with ImageField (→ ImageValue)
      component: Wrong,
    })
  })
})
