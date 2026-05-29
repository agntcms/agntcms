// Regression test for `isSlotInPreview` (the public preview-mode signal
// for optional-field UX in section components).
//
// WHAT REGRESSION THIS GUARDS AGAINST
// -----------------------------------
// Pre-v0.1 the canonical idiom for an OPTIONAL link/image was:
//
//     const cta = resolveLinkValue(rawCta)
//     const showCta = Boolean(hrefOf(cta)) || isPreviewField(rawCta)
//     {showCta && <a ...><EditableLink field={rawCta} ... /></a>}
//
// During the EditableSlot rollout (sub-task 4), several template sections
// silently lost the `|| isPreviewField(rawCta)` clause:
//
//     const cta = read(rawCta)
//     const showCta = Boolean(hrefOf(cta))
//
// In preview mode with an unconfigured CTA, `hrefOf(cta) === ''` so the
// `<a>` did not render and the author had no click target to configure
// the link — typecheck and tests passed; the regression was only visible
// when running the template against a draft. The fix exposed
// `isSlotInPreview` so the disjunction can be restored cleanly:
//
//     const cta = read(rawCta)
//     const showCta = Boolean(hrefOf(cta)) || isSlotInPreview(rawCta)
//     {showCta && <a ...><EditableLink field={rawCta} ... /></a>}
//
// This test pins the helper's behaviour so a future refactor that breaks
// the preview-mode branch fails at unit-test time, not in template:dev.

import { describe, expect, it } from 'vitest'

import type { EditableSlot } from '../../sections/defineSection'
import { wrapAsSlot } from '../../sections/wrapAsSlot'
import { isSlotInPreview } from './read'

describe('isSlotInPreview', () => {
  it('returns false for a published-mode slot (bare value)', () => {
    // Published-mode slot: `slot.value` is the bare V.
    const slot = wrapAsSlot('text', 'hello')
    expect(isSlotInPreview(slot)).toBe(false)
  })

  it('returns true for a preview-mode slot (PreviewFieldLike value)', () => {
    // Preview-mode slot: `slot.value` is a PreviewFieldLike<V> with the
    // `__agntcmsPreview: true` brand. `wrapAsSlot` stores whatever it is
    // given without narrowing, mirroring how SectionRenderer wires preview
    // wrappers through to the section props.
    const previewWrapped = {
      __agntcmsPreview: true as const,
      value: 'hello',
      origin: {
        pageSlug: 'home',
        sectionId: 'hero-1',
        fieldPath: 'cta',
        source: 'draft' as const,
        revision: 'r1',
      },
    }
    const slot = wrapAsSlot('text', previewWrapped)
    expect(isSlotInPreview(slot)).toBe(true)
  })

  it('returns false for a slot whose bare value happens to be an object', () => {
    // A LinkValue is structurally an object — make sure the helper does NOT
    // misidentify it as a preview wrapper. The discriminant is the brand
    // `__agntcmsPreview`, not the type of `slot.value`.
    const slot: EditableSlot<'link', { type: 'internal'; slug: string; label: string }> =
      wrapAsSlot('link', { type: 'internal', slug: 'docs', label: 'Docs' })
    expect(isSlotInPreview(slot)).toBe(false)
  })
})
