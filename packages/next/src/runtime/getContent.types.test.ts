// Type-level tests for the dual-mode `getContent` API (T-007).
//
// `getContent` is the single most delicate point of the public API
// (ARCHITECTURE.md §11), so this file is unusually rigorous: it locks the
// per-field mode-resolution mechanism, the zero-cost structural identity of
// the published path, the distribution of `FieldIn` and `PageContent` over a
// union `Mode`, and the control-flow narrowing behaviour a real caller will
// rely on.
//
// These are compile-time assertions. The `describe` / `it` shell exists so
// vitest picks the file up and reports a green suite; the real checks are
// the `expectTypeOf(...)` calls, which become type errors if the contract
// drifts. No runtime code in the module under test is exercised — there is
// none to exercise (`getContent.types.ts` ships only types and an ambient
// `declare const`, which emits zero JS).

import { describe, expectTypeOf, it } from 'vitest'
import type { ImageField, ImageValue, TextField } from '../domain/index'
import type {
  FieldIn,
  GetContent,
  GetContentOptions,
  PageContent,
  PreviewField,
  PreviewFieldOrigin,
  PreviewMode,
  ReferenceValue,
  SectionSchema,
} from './getContent.types'

// ---------------------------------------------------------------------------
// Fixture schema
// ---------------------------------------------------------------------------
//
// A small Hero-like schema. 0.1.19: `TextField` resolves to `string` and
// `ImageField` resolves to `ImageValue` (`{ filename, alt }` — alt is
// collected in the picker modal and stored in section data). The earlier
// 0.1.18 bare-filename shape was reverted after the picker gained a
// required alt step.
//
// Declared as `type` aliases (not `interface`) so the resulting shapes
// stay structurally identical to the mapped-type output of
// `PageContent<Mode, S>`. Interfaces carry a distinct declaration form
// that expect-type's equality check distinguishes from inline object types
// in some corners; type aliases avoid the spurious mismatch.

type HeroSchema = {
  readonly title: TextField
  readonly hero: ImageField
}

// What the user-facing, published-mode shape of HeroSchema looks like.
// Written out by hand so the test can assert EQUALITY with what the
// machinery produces, not just assignability — assignability is too weak to
// catch an accidental widening to `unknown`.
type HeroDataPublished = {
  readonly title: string
  readonly hero: ImageValue
}

// And the preview-mode shape, for the symmetrical check.
type HeroDataPreview = {
  readonly title: PreviewField<string>
  readonly hero: PreviewField<ImageValue>
}

// ---------------------------------------------------------------------------
// 1. FieldIn mode resolution
// ---------------------------------------------------------------------------

describe('FieldIn<Mode, T>', () => {
  it('maps preview mode to PreviewField<T>', () => {
    expectTypeOf<FieldIn<'preview', string>>().toEqualTypeOf<
      PreviewField<string>
    >()
    expectTypeOf<FieldIn<'preview', ReferenceValue>>().toEqualTypeOf<
      PreviewField<ReferenceValue>
    >()
  })

  it('maps published mode structurally to T (zero-cost published path)', () => {
    // This is the load-bearing assertion for the "prod pays nothing"
    // invariant. `FieldIn<'published', T>` must be INDISTINGUISHABLE from
    // `T` at the type level — `toEqualTypeOf` performs a bidirectional
    // structural check, so a silent widening or a branded intersection
    // would fail this.
    expectTypeOf<FieldIn<'published', string>>().toEqualTypeOf<string>()
    expectTypeOf<
      FieldIn<'published', ReferenceValue>
    >().toEqualTypeOf<ReferenceValue>()
  })

  it('distributes over a union Mode', () => {
    // When `Mode` is a naked union, `FieldIn<Mode, T>` must distribute
    // into `PreviewField<T> | T`. This is what the single generic
    // `getContent` call site relies on. If distribution regresses (e.g.
    // by wrapping `Mode extends ...` in a tuple), the union below would
    // collapse to `never` and this test would fail loudly.
    expectTypeOf<FieldIn<PreviewMode, string>>().toEqualTypeOf<
      PreviewField<string> | string
    >()
  })
})

// ---------------------------------------------------------------------------
// 2. PageContent schema projection
// ---------------------------------------------------------------------------

describe('PageContent<Mode, S>', () => {
  it('projects a schema to its published-mode bare data shape', () => {
    // The published-mode projection of HeroSchema must equal the
    // hand-written HeroDataPublished, proving (a) the schema structure
    // is preserved, (b) `FieldValueFor<F>` resolves each descriptor to
    // the right value type, and (c) no PreviewField wrapping leaks into
    // the prod shape.
    expectTypeOf<
      PageContent<'published', HeroSchema>
    >().toEqualTypeOf<HeroDataPublished>()
  })

  it('projects a schema to its preview-mode wrapped shape', () => {
    expectTypeOf<
      PageContent<'preview', HeroSchema>
    >().toEqualTypeOf<HeroDataPreview>()
  })

  it('distributes PageContent over a union Mode', () => {
    // Symmetric with the FieldIn distribution test, one level up: a
    // generic call site passing `Mode = PreviewMode` must see the full
    // union of both projections as the return shape.
    expectTypeOf<PageContent<PreviewMode, HeroSchema>>().toEqualTypeOf<
      HeroDataPublished | HeroDataPreview
    >()
  })
})

// ---------------------------------------------------------------------------
// 3. GetContent call-site inference
// ---------------------------------------------------------------------------
//
// These tests simulate the two ways a real user would call `getContent`:
//
//   (a) With a literal mode (`mode: 'published'`) — the return type should
//       narrow all the way to `Promise<HeroDataPublished | null>`.
//   (b) Through a generic wrapper whose `Mode` parameter is the union — the
//       return type should be `Promise<HeroDataPublished | HeroDataPreview | null>`.
//
// (b) is the hard case and the whole point of T-007: if the types lose
// inference through the generic wrapper, every real codebase that chooses
// the mode behind a helper (e.g. "is this request in draft mode?") falls
// back to `any` or to manual casts. That would be a framework-level defect.

describe('GetContent call-site inference', () => {
  it('narrows the return type when the caller passes a literal mode', () => {
    // We cannot invoke `getContent` at runtime in a type-only suite, but
    // we can construct a hypothetical awaited result via
    // `ReturnType<GetContent>` and assert its shape.
    type PublishedCall = Awaited<
      ReturnType<
        (options: GetContentOptions<'published'>) => Promise<
          PageContent<'published', HeroSchema> | null
        >
      >
    >
    expectTypeOf<PublishedCall>().toEqualTypeOf<HeroDataPublished | null>()

    type PreviewCall = Awaited<
      ReturnType<
        (options: GetContentOptions<'preview'>) => Promise<
          PageContent<'preview', HeroSchema> | null
        >
      >
    >
    expectTypeOf<PreviewCall>().toEqualTypeOf<HeroDataPreview | null>()
  })

  it('produces the full union when the caller is generic over Mode', () => {
    // This is the simulated "helper function" case described in the
    // file header of getContent.types.ts. `readHero<M>` represents the
    // user's wrapper; its return type is what their call sites will
    // see. It must be the union of both mode projections.
    type ReadHero = <M extends PreviewMode>(
      options: GetContentOptions<M>,
    ) => Promise<PageContent<M, HeroSchema> | null>

    type ReadHeroResult = Awaited<ReturnType<ReadHero>>

    // Because `M` is a naked type parameter, `PageContent<M, HeroSchema>`
    // distributes into `HeroDataPublished | HeroDataPreview`. Adding
    // `| null` for the not-found case gives us the full return union.
    expectTypeOf<ReadHeroResult>().toEqualTypeOf<
      HeroDataPublished | HeroDataPreview | null
    >()
  })

  it('narrows inside a control-flow branch on mode', () => {
    // The real caller pattern: a helper reads `mode` from config or from
    // a request, then branches on it. Inside each branch, the page type
    // must narrow so user code can access the field shape specific to
    // that mode without a manual cast.
    //
    // We model this with a locally-declared stub `gc` typed as
    // `GetContent`. The stub is never called at runtime — it is
    // constructed via an unchecked `as unknown as GetContent` cast so
    // typecheck sees the right shape and the test body remains
    // type-only. The outer function is never invoked; `expectTypeOf`
    // inside it runs at typecheck time, not runtime.
    const gc = (() => {
      throw new Error('unreachable — type-only stub')
    }) as unknown as GetContent

    const dispatch = async (mode: PreviewMode): Promise<void> => {
      if (mode === 'preview') {
        const page = await gc<'preview', HeroSchema>({
          slug: 'home',
          mode,
        })
        // Narrowed branch: no bare-data shape in sight.
        expectTypeOf(page).toEqualTypeOf<HeroDataPreview | null>()
      } else {
        const page = await gc<'published', HeroSchema>({
          slug: 'home',
          mode,
        })
        expectTypeOf(page).toEqualTypeOf<HeroDataPublished | null>()
      }
    }
    // Reference `dispatch` so tsc does not flag it unused. The body is
    // never executed; only typechecked.
    expectTypeOf(dispatch).toBeFunction()
  })
})

// ---------------------------------------------------------------------------
// 4. PreviewField metadata shape
// ---------------------------------------------------------------------------
//
// Lock the metadata payload the runtime (T-008) must produce and the
// editable React components (T-016) will consume. If the contract shrinks
// or renames, these assertions fail and force the author to confront the
// change deliberately.

describe('PreviewField metadata', () => {
  it('PreviewFieldOrigin carries pageSlug, sectionId, fieldPath, source, revision plus optional kind/globalName', () => {
    // `kind` and `globalName` were added in v0.2 to support `<GlobalSlot>`
    // (Phase 2 globals work). They are OPTIONAL for back-compat — existing
    // call sites that build origins without them are still page-origin
    // fields by convention.
    expectTypeOf<PreviewFieldOrigin>().toEqualTypeOf<{
      readonly pageSlug: string
      readonly sectionId: string
      readonly fieldPath: string
      readonly source: 'draft' | 'published'
      readonly revision: string
      readonly kind?: 'page' | 'global'
      readonly globalName?: string
    }>()
  })

  it('PreviewField<T> exposes value and origin as readable properties', () => {
    // We cannot directly name the `unique symbol` brand property from
    // outside the module that owns it, which is the whole point — it is
    // structurally unforgeable. We assert the two OBSERVABLE properties
    // the consumers actually read.
    type Field = PreviewField<string>
    expectTypeOf<Field['value']>().toEqualTypeOf<string>()
    expectTypeOf<Field['origin']>().toEqualTypeOf<PreviewFieldOrigin>()
  })

  it('PreviewField is NOT assignable from a bare matching shape (brand blocks forgery)', () => {
    // A plain object with `value` and `origin` must NOT satisfy
    // `PreviewField<T>` — the brand is the whole point. `toMatchTypeOf`
    // would allow a supertype match; we use a negative assignability
    // check via a conditional instead.
    type Forgery = { readonly value: string; readonly origin: PreviewFieldOrigin }
    type IsAssignable = Forgery extends PreviewField<string> ? true : false
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>()
  })
})

// ---------------------------------------------------------------------------
// 5. Public function type anchor
// ---------------------------------------------------------------------------

describe('GetContent public type', () => {
  it('is a generic async function over Mode and S', () => {
    // Smoke-test the `GetContent` alias as a callable type. If the
    // signature changes shape (e.g. options become positional, or the
    // return drops the `| null`), this assertion fails.
    expectTypeOf<GetContent>().toEqualTypeOf<
      <Mode extends PreviewMode, S extends SectionSchema>(
        options: GetContentOptions<Mode>,
      ) => Promise<PageContent<Mode, S> | null>
    >()
  })

  it('GetContentOptions carries slug and mode only', () => {
    expectTypeOf<GetContentOptions<'preview'>>().toEqualTypeOf<{
      readonly slug: string
      readonly mode: 'preview'
    }>()
    expectTypeOf<GetContentOptions<'published'>>().toEqualTypeOf<{
      readonly slug: string
      readonly mode: 'published'
    }>()
  })
})
